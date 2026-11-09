// WinBox native Node client: EC-SRP5 authentication, encrypted framing,
// mepty terminal session and command execution.
//
// Protocol/behaviour ported from the MIT Python reference implementation
// tools/winbox/winbox_terminal_client.py. Legacy MD5 authentication (RouterOS
// before 6.43) is intentionally NOT implemented: authenticate() fails with
// LEGACY_AUTH_UNSUPPORTED instead of silently retrying an insecure handshake.
//
// Only Node builtins are imported (node:net, node:crypto).

import net from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
  WCurve,
  sha256,
  hmacSha1,
  genStreamKeys,
  bytesToBigInt,
  liftX,
  pointAdd,
  scalarMult,
  encryptAesCbc,
  decryptAesCbc,
  stripHmacAndPadding,
} from './crypto.mjs'
import { M2, M2Parser, encodeFrameChunks, FrameDecoder } from './m2.mjs'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const ERROR_CODES = Object.freeze({
  CONNECT_FAILED: 'CONNECT_FAILED',
  AUTH_FAILED: 'AUTH_FAILED',
  LEGACY_AUTH_UNSUPPORTED: 'LEGACY_AUTH_UNSUPPORTED',
  PROTOCOL_ERROR: 'PROTOCOL_ERROR',
  TIMEOUT: 'TIMEOUT',
  CLOSED: 'CLOSED',
  READ_ONLY_BLOCKED: 'READ_ONLY_BLOCKED',
  CREDENTIALS_ERROR: 'CREDENTIALS_ERROR',
  UNSUPPORTED: 'UNSUPPORTED',
})

export class WinboxError extends Error {
  constructor (code, message, details = {}) {
    super(message)
    this.name = 'WinboxError'
    this.code = code
    this.details = details
  }
}

function timeoutError (message, details = {}) {
  return new WinboxError(ERROR_CODES.TIMEOUT, message, details)
}

/**
 * RouterOS reports a failed EC-SRP5 login by replying with a tag 0x06 frame
 * that carries a short human-readable reason ("invalid user name or
 * password") instead of the 32-byte server confirmation. Keep that text for
 * diagnostics but strip control bytes and cap the length: it is untrusted
 * remote input and must never end up with raw terminal escapes in the tool
 * output.
 */
export function sanitizeServerAuthReply (payload) {
  if (!Buffer.isBuffer(payload) && !(payload instanceof Uint8Array)) return ''
  const text = Buffer.from(payload).toString('utf8')
  return text
    .replace(/[^\x20-\x7e]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

// ---------------------------------------------------------------------------
// Terminal text helpers (port of wb_run.strip_ansi / prompt / pagination).
// ---------------------------------------------------------------------------

// CSI sequences, OSC (window title) sequences, charset selection, keypad modes.
const ANSI_PATTERN = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB0-9]|\x1b[=>]/g
const PROMPT_AT_END = /\[[^\]]*@[^\]]*\]\s*>?\s*$/
const PAGINATION_MARKER = '[Q quit|'

/** Decode bytes and strip ANSI/VT102 escapes, normalising CRLF/CR to LF. */
export function stripAnsi (input) {
  const text = Buffer.isBuffer(input) || input instanceof Uint8Array
    ? Buffer.from(input).toString('utf8')
    : String(input ?? '')
  return text
    .replace(ANSI_PATTERN, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x07\x08]/g, '')
}

/** Prompt heuristic used by the reference terminal driver (tail-based). */
export function isPromptAtEnd (text) {
  const tail = String(text ?? '').slice(-400)
  if (PROMPT_AT_END.test(tail)) return true
  return tail.trimEnd().endsWith('>')
}

/** True when the RouterOS pagination prompt is present in the text. */
export function findPaginationTrigger (text) {
  return String(text ?? '').includes(PAGINATION_MARKER)
}

function isPromptLine (line) {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/^\[[^\]]*@[^\]]*\](?:\s+[^>\n]*)?>$/.test(trimmed)) return true
  if (/^[^\s<>]+@[^\s<>]+(?:\s+[^>\n]*)?>$/.test(trimmed)) return true
  if (/^[^\s<>]+(?:\s+[^>\n]*)?>\s*$/.test(trimmed)) return true
  return false
}

function isPaginationLine (line) {
  return line.includes(PAGINATION_MARKER)
}

/**
 * Turn a raw terminal transcript into command output: drop the echoed command
 * line, the leading/trailing prompts and transient pagination prompts.
 */
export function cleanCommandOutput (rawText, command = '') {
  const lines = String(rawText ?? '').split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()

  const cmd = String(command ?? '').trim()
  if (cmd) {
    const firstNonEmpty = lines.findIndex((line) => line.trim() !== '')
    if (firstNonEmpty !== -1 && lines[firstNonEmpty].includes(cmd)) {
      lines.splice(0, firstNonEmpty + 1)
    }
  }
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && isPromptLine(lines[0])) lines.shift()

  const filtered = lines.filter((line) => !isPaginationLine(line))
  while (filtered.length > 0) {
    const last = filtered[filtered.length - 1]
    if (last.trim() === '' || isPromptLine(last)) {
      filtered.pop()
      continue
    }
    break
  }
  return filtered.join('\n').trimEnd()
}

/**
 * Incremental transcript collector used by runCommand.
 *
 * feed() returns { text, quit }: the newly appended stripped text and whether
 * a *new* pagination prompt appeared (caller must send 'q'). Completion is
 * prompt-seen + output quiet for `stabilityMs`; timeout is idle for
 * `idleTimeoutMs` or total duration beyond `maxDurationMs`.
 */
export class TerminalCollector {
  constructor ({ command = '', idleTimeoutMs = 5000, stabilityMs = 150, maxDurationMs = 120000 } = {}) {
    this.command = String(command ?? '')
    this.idleTimeoutMs = idleTimeoutMs
    this.stabilityMs = stabilityMs
    this.maxDurationMs = maxDurationMs
    this._raw = Buffer.alloc(0)
    this._stripped = ''
    this._reportedLength = 0
    this._paginationHandledThrough = 0
    this._promptSeen = false
    this._startedAt = Date.now()
    this._lastDataAt = this._startedAt
  }

  feed (chunk) {
    const bytes = Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
      ? Buffer.from(chunk)
      : Buffer.from(String(chunk ?? ''), 'utf8')
    this._raw = Buffer.concat([this._raw, bytes])
    this._stripped = stripAnsi(this._raw)
    const text = this._stripped.slice(this._reportedLength)
    this._reportedLength = this._stripped.length
    this._lastDataAt = Date.now()
    if (isPromptAtEnd(this._stripped)) this._promptSeen = true

    let quit = false
    const trigger = this._stripped.indexOf(PAGINATION_MARKER, this._paginationHandledThrough)
    if (trigger !== -1) {
      quit = true
      this._paginationHandledThrough = trigger + 1
    }
    return { text, quit }
  }

  get text () {
    return this._stripped
  }

  get promptSeen () {
    return this._promptSeen
  }

  isComplete (now = Date.now()) {
    return this._promptSeen && now - this._lastDataAt >= this.stabilityMs
  }

  isTimedOut (now = Date.now()) {
    if (now - this._lastDataAt >= this.idleTimeoutMs) return true
    return now - this._startedAt >= this.maxDurationMs
  }

  finish () {
    return cleanCommandOutput(this._stripped, this.command)
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function u16be (value) {
  const buf = Buffer.alloc(2)
  buf.writeUInt16BE(value)
  return buf
}

export class WinboxClient {
  constructor ({ host, port = 8291, connectTimeoutMs = 10000, logger = null } = {}) {
    if (!host) throw new WinboxError(ERROR_CODES.CONNECT_FAILED, 'host is required')
    this.host = host
    this.port = port
    this.connectTimeoutMs = connectTimeoutMs
    this.logger = logger

    this._socket = null
    this._connected = false
    this._authenticated = false
    this._terminalOpened = false
    this._closed = false
    this._closedError = null

    this._decoder = new FrameDecoder()
    this._messages = []
    this._waiters = []
    this._rawBuffer = Buffer.alloc(0)
    this._rawWaiters = []

    this._curve = new WCurve()
    this._sourceId = 8
    this._reqId = 0
    this._sessionId = null
    this._counter = 0
    this._recvCounter = 0
    this._keys = null
    this._username = null
    this._password = null
    this.banner = ''
  }

  _log (level, message, details) {
    if (!this.logger) return
    try {
      if (typeof this.logger === 'function') this.logger(level, message, details)
      else if (typeof this.logger[level] === 'function') this.logger[level](message, details)
    } catch {
      // Logging must never break the protocol.
    }
  }

  // -- connection lifecycle -------------------------------------------------

  async connect () {
    if (this._connected) throw new WinboxError(ERROR_CODES.CONNECT_FAILED, 'client is already connected')
    if (this._closed) throw new WinboxError(ERROR_CODES.CLOSED, 'client is closed')

    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port })
      this._socket = socket
      socket.setNoDelay(true)

      let settled = false
      const finish = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.off('connect', onConnect)
        socket.off('error', onError)
        if (error) {
          socket.destroy()
          if (this._socket === socket) this._socket = null
          reject(error)
        } else {
          resolve()
        }
      }
      const onConnect = () => finish(null)
      const onError = (cause) => finish(new WinboxError(
        ERROR_CODES.CONNECT_FAILED,
        `failed to connect to ${this.host}:${this.port}: ${cause.message}`,
        { cause }
      ))
      const timer = setTimeout(() => finish(new WinboxError(
        ERROR_CODES.CONNECT_FAILED,
        `connect timed out after ${this.connectTimeoutMs}ms`,
        { timeoutMs: this.connectTimeoutMs }
      )), this.connectTimeoutMs)

      socket.once('connect', onConnect)
      socket.once('error', onError)
    })

    this._connected = true
    this._socket.on('data', (chunk) => this._onData(chunk))
    this._socket.on('error', (cause) => {
      this._fail(new WinboxError(ERROR_CODES.CONNECT_FAILED, `socket error: ${cause.message}`, { cause }))
    })
    this._socket.on('close', () => {
      if (!this._closed) this._fail(new WinboxError(ERROR_CODES.CLOSED, 'connection closed by peer'))
    })
    this._log('debug', `connected to ${this.host}:${this.port}`)
  }

  /** Idempotent close; safe to call before connect or multiple times. */
  async close () {
    if (this._closed) return
    this._closed = true
    this._closedError = new WinboxError(ERROR_CODES.CLOSED, 'client closed')
    this._rejectWaiters(this._closedError)
    if (this._socket) {
      const socket = this._socket
      this._socket = null
      socket.removeAllListeners('data')
      socket.destroy()
    }
    this._connected = false
    this._authenticated = false
    this._terminalOpened = false
  }

  _rejectWaiters (error) {
    for (const waiter of this._waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    for (const waiter of this._rawWaiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
  }

  _fail (error) {
    if (this._closed) return
    this._closed = true
    this._closedError = error
    this._rejectWaiters(error)
    if (this._socket) {
      const socket = this._socket
      this._socket = null
      socket.destroy()
    }
    this._log('error', error.message)
  }

  // -- raw (pre-encryption) transport --------------------------------------

  _onData (chunk) {
    if (this._authenticated) {
      this._feedFrames(chunk)
      return
    }
    this._rawBuffer = Buffer.concat([this._rawBuffer, chunk])
    for (;;) {
      if (this._rawBuffer.length === 0 || this._rawWaiters.length === 0) break
      const waiter = this._rawWaiters.shift()
      clearTimeout(waiter.timer)
      waiter.resolve()
    }
  }

  _readRawBytes (count, deadline) {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (this._rawBuffer.length >= count) {
          const out = this._rawBuffer.subarray(0, count)
          this._rawBuffer = this._rawBuffer.subarray(count)
          resolve(out)
          return
        }
        if (this._closed) {
          reject(this._closedError ?? new WinboxError(ERROR_CODES.CLOSED, 'connection closed'))
          return
        }
        const remaining = deadline - Date.now()
        if (remaining <= 0) {
          reject(timeoutError('timed out while reading from the router'))
          return
        }
        const waiter = {
          resolve: () => attempt(),
          reject,
          timer: setTimeout(() => {
            const index = this._rawWaiters.indexOf(waiter)
            if (index !== -1) this._rawWaiters.splice(index, 1)
            reject(timeoutError('timed out while reading from the router'))
          }, remaining),
        }
        this._rawWaiters.push(waiter)
      }
      attempt()
    })
  }

  async _readRawFrame (timeoutMs) {
    const deadline = Date.now() + timeoutMs
    const header = await this._readRawBytes(2, deadline)
    const length = header[0]
    const tag = header[1]
    const payload = await this._readRawBytes(length, deadline)
    return { length, tag, payload }
  }

  async _writeSocket (data) {
    if (!this._socket || this._closed) {
      throw this._closedError ?? new WinboxError(ERROR_CODES.CLOSED, 'connection is closed')
    }
    const socket = this._socket
    await new Promise((resolve, reject) => {
      socket.write(data, (error) => {
        if (error) reject(new WinboxError(ERROR_CODES.CONNECT_FAILED, `write failed: ${error.message}`, { cause: error }))
        else resolve()
      })
    })
  }

  // -- authentication -------------------------------------------------------

  async authenticate ({ username, password } = {}) {
    if (this._authenticated) return true
    if (!this._socket || this._connected === false || this._closed) {
      throw new WinboxError(ERROR_CODES.CONNECT_FAILED, 'not connected')
    }
    if (typeof username !== 'string' || username.length === 0 ||
        typeof password !== 'string' || password.length === 0) {
      throw new WinboxError(ERROR_CODES.CREDENTIALS_ERROR, 'username and password are required')
    }
    this._username = username
    this._password = password

    // Stage 1: send [len][0x06][username\0][public_key 32B][parity 1B].
    const sA = randomBytes(32)
    const clientPublic = this._curve.genPublicKey(sA)
    const hello = Buffer.concat([
      Buffer.from(username, 'utf8'),
      Buffer.from([0x00]),
      clientPublic.x,
      Buffer.from([clientPublic.parity]),
    ])
    await this._writeSocket(Buffer.concat([Buffer.from([hello.length, 0x06]), hello]))

    let challenge
    try {
      challenge = await this._readRawFrame(3000)
    } catch (error) {
      if (error instanceof WinboxError && error.code === ERROR_CODES.TIMEOUT) {
        throw new WinboxError(
          ERROR_CODES.LEGACY_AUTH_UNSUPPORTED,
          'no response to the EC-SRP5 challenge; legacy (pre-6.43) WinBox authentication is not supported',
          { cause: error }
        )
      }
      throw error
    }

    if (challenge.tag !== 0x06) {
      throw new WinboxError(
        ERROR_CODES.LEGACY_AUTH_UNSUPPORTED,
        `server does not support EC-SRP5 (challenge tag 0x${challenge.tag.toString(16)})`
      )
    }
    if (challenge.payload.length !== 49) {
      throw new WinboxError(
        ERROR_CODES.UNSUPPORTED,
        `unexpected EC-SRP5 challenge size (${challenge.payload.length}, expected 49)`
      )
    }

    const serverPublic = challenge.payload.subarray(0, 32)
    const serverParity = challenge.payload[32]
    const salt = challenge.payload.subarray(33, 49)

    // Stage 2: client shared secret and confirmation.
    const validatorPriv = this._curve.genPasswordValidatorPriv(username, password, salt)
    const xGamma = this._curve.genPublicKey(validatorPriv).x
    const v = this._curve.redp1(xGamma, 1)
    let wB = liftX(bytesToBigInt(serverPublic), serverParity)
    if (wB === null) throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, 'server public key is not on the curve')
    wB = pointAdd(wB, v)

    const j = sha256(Buffer.concat([clientPublic.x, serverPublic]))
    const exponent = this._curve.finiteFieldValue(
      bytesToBigInt(validatorPriv) * bytesToBigInt(j) + bytesToBigInt(sA)
    )
    const sharedPoint = scalarMult(wB, exponent)
    if (sharedPoint === null) throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, 'SRP shared point is at infinity')
    const z = this._curve.toMontgomery(sharedPoint).x
    const secret = sha256(z)

    const clientConfirmation = sha256(Buffer.concat([j, z]))
    await this._writeSocket(Buffer.concat([
      Buffer.from([clientConfirmation.length, 0x06]),
      clientConfirmation,
    ]))

    let confirmation
    try {
      confirmation = await this._readRawFrame(this.connectTimeoutMs)
    } catch (error) {
      if (
        error instanceof WinboxError &&
        (error.code === ERROR_CODES.TIMEOUT || error.code === ERROR_CODES.CLOSED)
      ) {
        throw new WinboxError(
          ERROR_CODES.AUTH_FAILED,
          'no server confirmation; authentication failed (wrong username or password)',
          { cause: error }
        )
      }
      throw error
    }
    if (confirmation.tag !== 0x06 || confirmation.payload.length !== 32) {
      // RouterOS answers a rejected EC-SRP5 login with a short reason string
      // ("invalid user name or password") instead of the SRP confirmation.
      const reason = confirmation.tag === 0x06 ? sanitizeServerAuthReply(confirmation.payload) : ''
      throw new WinboxError(
        ERROR_CODES.AUTH_FAILED,
        reason
          ? `wrong username or password (server: ${reason})`
          : 'wrong username or password (invalid server confirmation frame)',
        { tag: confirmation.tag, serverReplyLength: confirmation.payload.length }
      )
    }
    const expected = sha256(Buffer.concat([j, clientConfirmation, z]))
    if (!timingSafeEqual(confirmation.payload, expected)) {
      throw new WinboxError(ERROR_CODES.AUTH_FAILED, 'wrong username or password')
    }

    this._keys = genStreamKeys(false, secret)
    this._authenticated = true
    this._activateEncrypted()
    this._log('debug', 'EC-SRP5 authentication succeeded')
    return true
  }

  /** Move any bytes already buffered before encryption into the frame decoder. */
  _activateEncrypted () {
    if (this._rawBuffer.length === 0) return
    const leftover = this._rawBuffer
    this._rawBuffer = Buffer.alloc(0)
    this._feedFrames(leftover)
  }

  // -- encrypted transport --------------------------------------------------

  _feedFrames (chunk) {
    try {
      for (const payload of this._decoder.push(chunk)) {
        this._pushMessage(this._decryptFrame(payload))
      }
    } catch (error) {
      this._fail(error instanceof WinboxError
        ? error
        : new WinboxError(ERROR_CODES.PROTOCOL_ERROR, `failed to decode frame: ${error.message}`, { cause: error }))
    }
  }

  _decryptFrame (payload) {
    if (!this._keys) throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, 'received encrypted frame before authentication')
    if (payload.length < 2 + 16) throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, 'encrypted frame is too short')
    const iv = payload.subarray(2, 18)
    const ciphertext = payload.subarray(18)
    if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) {
      throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, 'encrypted frame ciphertext is not block aligned')
    }
    let padded
    try {
      padded = decryptAesCbc(this._keys.receiveAesKey, iv, ciphertext)
    } catch (error) {
      throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, `AES decryption failed: ${error.message}`, { cause: error })
    }
    // The reference implementation deliberately ignores HMAC mismatches, so a
    // router that does not validate the trailing MAC stays usable.
    const message = stripHmacAndPadding(padded)
    if (message === null) throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, 'invalid encrypted frame padding')
    return message
  }

  async _sendMessage (message) {
    if (!this._keys) throw new WinboxError(ERROR_CODES.CONNECT_FAILED, 'not authenticated')
    const hmac = hmacSha1(this._keys.sendHmacKey, message)
    const iv = randomBytes(16)
    const padByte = 0x0f - ((message.length + hmac.length) % 0x10)
    const padding = Buffer.alloc(padByte + 1, padByte)
    const ciphertext = encryptAesCbc(
      this._keys.sendAesKey,
      iv,
      Buffer.concat([message, hmac, padding])
    )
    const payload = Buffer.concat([u16be(ciphertext.length), iv, ciphertext])
    await this._writeSocket(encodeFrameChunks(payload, 0x06))
  }

  _pushMessage (message) {
    const waiter = this._waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      waiter.resolve(message)
    } else {
      this._messages.push(message)
    }
  }

  /** Resolve with the next M2 message, or null after timeoutMs. */
  _nextMessage (timeoutMs) {
    if (this._messages.length > 0) return Promise.resolve(this._messages.shift())
    if (this._closed) return Promise.reject(this._closedError ?? new WinboxError(ERROR_CODES.CLOSED, 'connection closed'))
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null }
      waiter.timer = setTimeout(() => {
        const index = this._waiters.indexOf(waiter)
        if (index !== -1) this._waiters.splice(index, 1)
        resolve(null)
      }, Math.max(1, timeoutMs))
      this._waiters.push(waiter)
    })
  }

  // -- terminal session -----------------------------------------------------

  async openTerminal ({ cols = 200, rows = 1000 } = {}) {
    if (!this._authenticated) throw new WinboxError(ERROR_CODES.AUTH_FAILED, 'not authenticated')
    if (this._terminalOpened) return true

    // Step 1: initial request; the server's SYS_TO carries the source id.
    await this._sendMessage(M2.buildInitialRequest(this._sourceId))
    const initialReply = await this._nextMessage(5000)
    if (initialReply !== null) {
      const parsed = M2Parser.parse(initialReply)
      const sysFrom = M2Parser.getSysFrom(parsed)
      const sysTo = M2Parser.getSysTo(parsed)
      if (sysFrom && sysFrom.length >= 2 && sysTo && sysTo.length >= 2) {
        this._sourceId = sysTo[1]
      }
    }

    // Step 2: meptyLogin (SYS_CMD = 0x0A0065).
    const reqId = ++this._reqId
    await this._sendMessage(M2.buildEmptyLogin(this._sourceId, reqId, this._password, cols, rows))

    // Step 3: wait for the mepty handler (76) to assign a session id.
    let opened = false
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const message = await this._nextMessage(3000)
      if (message === null) continue
      const parsed = M2Parser.parse(message)
      const sessionId = M2Parser.getSessionId(parsed)
      if (sessionId !== null) {
        const sysFrom = M2Parser.getSysFrom(parsed)
        if (sysFrom && sysFrom.includes(76)) {
          this._sessionId = sessionId
          opened = true
          break
        }
      }
      if (this._sessionId !== null) {
        opened = true
        break
      }
    }
    if (!opened) {
      throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, 'terminal session was not established (no mepty session id)')
    }

    // Step 4: ready signal, then consume the initial banner so the next
    // command's transcript starts at its own echo line.
    await this.sendReadySignal()
    this.banner = await this._drainBanner(3000)
    this._terminalOpened = true
    return true
  }

  async _drainBanner (timeoutMs) {
    const collector = new TerminalCollector({ command: '', idleTimeoutMs: timeoutMs, stabilityMs: 150 })
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const message = await this._nextMessage(Math.min(100, Math.max(1, deadline - Date.now())))
      if (message === null) {
        if (collector.isComplete() || Date.now() >= deadline) break
        continue
      }
      const raw = M2Parser.getKey2Raw(M2Parser.parse(message))
      if (!raw) continue
      this._recvCounter += raw.length
      const { quit } = collector.feed(raw)
      await this.sendAck()
      if (quit) await this.sendTerminalInput(Buffer.from('q', 'utf8'))
      if (collector.isComplete()) break
    }
    return collector.finish()
  }

  async sendReadySignal () {
    await this._sendMessage(M2.buildEmptyData(this._sourceId, this._sessionId, this._counter))
  }

  async sendAck () {
    await this._sendMessage(M2.buildEmptyData(this._sourceId, this._sessionId, this._recvCounter))
  }

  async sendTerminalInput (data) {
    const bytes = Buffer.isBuffer(data) || data instanceof Uint8Array
      ? Buffer.from(data)
      : Buffer.from(String(data ?? ''), 'utf8')
    await this._sendMessage(M2.buildEmptyData(this._sourceId, this._sessionId, this._counter, bytes))
    this._counter += bytes.length
  }

  /**
   * Run one CLI command and return its cleaned terminal output.
   * Throws TIMEOUT (details.output carries partial output) when the router
   * stops producing output before a new prompt appears.
   */
  async runCommand (command, { idleTimeoutMs = 5000, stabilityMs = 150, maxDurationMs = 120000, onOutput } = {}) {
    if (!this._terminalOpened) throw new WinboxError(ERROR_CODES.PROTOCOL_ERROR, 'terminal session is not open')
    const cmd = String(command ?? '')
    if (cmd.length === 0) throw new WinboxError(ERROR_CODES.UNSUPPORTED, 'command must not be empty')
    const collector = new TerminalCollector({ command: cmd, idleTimeoutMs, stabilityMs, maxDurationMs })

    await this.sendTerminalInput(Buffer.from(`${cmd}\r`, 'utf8'))

    for (;;) {
      const message = await this._nextMessage(100)
      if (message === null) {
        const now = Date.now()
        if (collector.isComplete(now)) break
        if (collector.isTimedOut(now)) {
          const output = collector.finish()
          const error = timeoutError(`command timed out: ${cmd}`, {
            output,
            promptSeen: collector.promptSeen,
            partial: true,
          })
          // The tool layer reads `error.output ?? error.partial ?? partial`;
          // expose the partial transcript on the error itself as well.
          error.output = output
          error.partial = true
          throw error
        }
        continue
      }

      const raw = M2Parser.getKey2Raw(M2Parser.parse(message))
      if (!raw) continue
      this._recvCounter += raw.length
      const { text, quit } = collector.feed(raw)
      if (text && typeof onOutput === 'function') {
        try {
          onOutput(text)
        } catch {
          // Consumer callbacks must not break the protocol loop.
        }
      }
      await this.sendAck()
      if (quit) await this.sendTerminalInput(Buffer.from('q', 'utf8'))
      if (collector.isComplete()) break
    }
    return collector.finish()
  }
}

// ---------------------------------------------------------------------------
// Session helper
// ---------------------------------------------------------------------------

/**
 * Connect, authenticate, open a terminal and execute commands sequentially.
 * A per-command TIMEOUT is recorded as {ok:false,error:"TIMEOUT"} and does not
 * interrupt the remaining commands; transport failures abort the session.
 */
export async function runSession ({
  host,
  port = 8291,
  username,
  password,
  commands = [],
  connectTimeoutMs = 10000,
  commandTimeoutMs = 5000,
  maxDurationMs = 120000,
  openTerminal = {},
  onOutput = null,
  logger = null,
  clientFactory = (options) => new WinboxClient(options),
} = {}) {
  if (!host) throw new WinboxError(ERROR_CODES.CONNECT_FAILED, 'host is required')
  if (!Array.isArray(commands)) throw new WinboxError(ERROR_CODES.UNSUPPORTED, 'commands must be an array')

  const client = clientFactory({ host, port, connectTimeoutMs, logger })
  const results = []
  try {
    await client.connect()
    await client.authenticate({ username, password })
    await client.openTerminal(openTerminal ?? {})
    for (const command of commands) {
      const cmd = String(command)
      try {
        const output = await client.runCommand(cmd, {
          idleTimeoutMs: commandTimeoutMs,
          maxDurationMs,
          onOutput: typeof onOutput === 'function' ? (chunk) => onOutput(cmd, chunk) : undefined,
        })
        results.push({ command: cmd, ok: true, output })
      } catch (error) {
        if (error instanceof WinboxError && error.code === ERROR_CODES.TIMEOUT) {
          results.push({ command: cmd, ok: false, output: error.details?.output ?? '', error: ERROR_CODES.TIMEOUT })
          continue
        }
        throw error
      }
    }
    return results
  } finally {
    await client.close()
  }
}

/** Convenience factory mirroring the clientFactory default above. */
export function createClient (options) {
  return new WinboxClient(options)
}

// Keep references used by tooling/tests that inspect the exported surface.
export { M2, M2Parser, encodeFrameChunks, FrameDecoder }
