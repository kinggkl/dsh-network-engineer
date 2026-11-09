// Golden-vector tests for the native WinBox protocol implementation.
//
// Every expected byte string is produced by the MIT Python reference
// implementation (tools/winbox/winbox_terminal_client.py) through
// tools/winbox/gen_vectors.py; nothing here is hand-computed. The fixtures live
// in test/fixtures/winbox/ and are checked into the repository so `node --test`
// needs no Python runtime.
//
// Coverage: EC-SRP5 / HKDF / AES / HMAC primitives, M2 encoders + parser,
// chunk framing (split/coalesce/exact-255 boundaries), ANSI stripping and
// prompt/pagination handling, runCommand transcript collection, error codes,
// and the runSession orchestration contract.

import { readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  P, R, A_MONT, GX, A_W, B_W, H, CONVERSION_FROM_M, CONVERSION,
  WCurve, sha256, hmacSha1, hkdf, genStreamKeys, verifyHmacSha1,
  bigIntToBytes32, bytesToBigInt, pointAdd, liftX, scalarMult,
  encryptAesCbc, decryptAesCbc, appendHmacAndPadding, stripHmacAndPadding,
} from '../lib/winbox/crypto.mjs'
import { M2, M2Parser, encodeFrameChunks, FrameDecoder } from '../lib/winbox/m2.mjs'
import {
  ERROR_CODES,
  WinboxError,
  WinboxClient,
  TerminalCollector,
  runSession,
  stripAnsi,
  isPromptAtEnd,
  findPaginationTrigger,
  cleanCommandOutput,
  sanitizeServerAuthReply,
} from '../lib/winbox/client.mjs'

const fixture = (name) => JSON.parse(
  readFileSync(new URL(`./fixtures/winbox/${name}`, import.meta.url), 'utf8')
)

const CRYPTO = fixture('crypto.json')
const M2_FIXTURE = fixture('m2.json')
const TERMINAL = fixture('terminal.json')

const hex = (value) => Buffer.from(value).toString('hex')
const bytes = (value) => Buffer.from(value, 'hex')

function u16be (value) {
  const buf = Buffer.alloc(2)
  buf.writeUInt16BE(value)
  return buf
}

// ---------------------------------------------------------------------------
// Crypto primitives (golden vectors from the Python reference)
// ---------------------------------------------------------------------------

test('curve constants match the Python WCurve constants', () => {
  const c = CRYPTO.constants
  assert.equal(P, BigInt(`0x${c.p_hex}`))
  assert.equal(R, BigInt(`0x${c.r_hex}`))
  assert.equal(A_MONT, BigInt(c.a_mont))
  assert.equal(GX, BigInt(c.gx))
  assert.equal(A_W, BigInt(`0x${c.a_w_hex}`))
  assert.equal(B_W, BigInt(`0x${c.b_w_hex}`))
  assert.equal(H, BigInt(c.h))
  assert.equal(hex(bigIntToBytes32(CONVERSION_FROM_M)), c.conversion_from_m_hex)
  assert.equal(hex(bigIntToBytes32(CONVERSION)), c.conversion_hex)
})

test('password validator private key matches Python', () => {
  const v = CRYPTO.validator
  const curve = new WCurve()
  const priv = curve.genPasswordValidatorPriv(v.username, v.password, bytes(v.salt_hex))
  assert.equal(hex(priv), v.validator_priv_hex)
})

test('genPublicKey / redp1 match Python for golden scalars', () => {
  const curve = new WCurve()
  const v = CRYPTO.validator
  const gamma = curve.genPublicKey(bytes(v.validator_priv_hex))
  assert.equal(hex(gamma.x), v.x_gamma_hex)
  assert.equal(gamma.parity, v.x_gamma_parity)
  const vPoint = curve.redp1(gamma.x, 1)
  assert.equal(hex(bigIntToBytes32(vPoint.x)), v.redp1_x_hex)
  assert.equal(hex(bigIntToBytes32(vPoint.y)), v.redp1_y_hex)

  const keys = CRYPTO.keys
  const serverPublic = curve.genPublicKey(bytes(keys.server_priv_hex))
  assert.equal(hex(serverPublic.x), keys.server_pub_hex)
  assert.equal(serverPublic.parity, keys.server_parity)
  const clientPublic = curve.genPublicKey(bytes(keys.client_priv_hex))
  assert.equal(hex(clientPublic.x), keys.client_pub_hex)
  assert.equal(clientPublic.parity, keys.client_parity)
})

test('EC-SRP5 shared secret, confirmations and stream keys match Python', () => {
  const curve = new WCurve()
  const keys = CRYPTO.keys
  const srp = CRYPTO.srp
  const validator = CRYPTO.validator

  const clientPublic = curve.genPublicKey(bytes(keys.client_priv_hex))
  const serverPublic = curve.genPublicKey(bytes(keys.server_priv_hex))
  const vPoint = curve.redp1(curve.genPublicKey(bytes(validator.validator_priv_hex)).x, 1)

  const wB = pointAdd(liftX(bytesToBigInt(serverPublic.x), serverPublic.parity), vPoint)
  assert.equal(hex(bigIntToBytes32(wB.x)), srp.w_b_x_hex)
  assert.equal(hex(bigIntToBytes32(wB.y)), srp.w_b_y_hex)

  const j = sha256(Buffer.concat([clientPublic.x, serverPublic.x]))
  assert.equal(hex(j), srp.j_hex)
  const finiteField = curve.finiteFieldValue(
    bytesToBigInt(bytes(validator.validator_priv_hex)) * bytesToBigInt(j) +
    bytesToBigInt(bytes(keys.client_priv_hex))
  )
  assert.equal(finiteField.toString(), srp.finite_field_value)
  assert.equal(BigInt(srp.finite_field_input) % R, finiteField)

  const z = curve.toMontgomery(scalarMult(wB, finiteField))
  assert.equal(hex(z.x), srp.z_hex)
  assert.equal(z.parity, srp.z_parity)

  const secret = sha256(z.x)
  assert.equal(hex(secret), srp.secret_hex)
  const clientCc = sha256(Buffer.concat([j, z.x]))
  assert.equal(hex(clientCc), srp.client_cc_hex)
  const serverCc = sha256(Buffer.concat([j, clientCc, z.x]))
  assert.equal(hex(serverCc), srp.server_cc_hex)

  const stream = genStreamKeys(false, secret)
  assert.equal(hex(stream.sendAesKey), CRYPTO.stream_keys.send_aes_key_hex)
  assert.equal(hex(stream.receiveAesKey), CRYPTO.stream_keys.receive_aes_key_hex)
  assert.equal(hex(stream.sendHmacKey), CRYPTO.stream_keys.send_hmac_key_hex)
  assert.equal(hex(stream.receiveHmacKey), CRYPTO.stream_keys.receive_hmac_key_hex)
})

test('sha256 / HMAC-SHA1 / HKDF match Python', () => {
  assert.equal(hex(sha256(bytes(CRYPTO.sha256.input_hex))), CRYPTO.sha256.digest_hex)
  assert.equal(
    hex(hmacSha1(bytes(CRYPTO.hmac_sha1.key_hex), bytes(CRYPTO.hmac_sha1.data_hex))),
    CRYPTO.hmac_sha1.mac_hex
  )
  assert.equal(hex(hkdf(bytes(CRYPTO.hkdf.input_hex))), CRYPTO.hkdf.output_hex)
})

test('AES-128-CBC encrypt/decrypt match Python', () => {
  const aes = CRYPTO.aes
  const cipher = encryptAesCbc(bytes(aes.key_hex), bytes(aes.iv_hex), bytes(aes.plain_hex))
  assert.equal(hex(cipher), aes.cipher_hex)
  assert.equal(hex(decryptAesCbc(bytes(aes.key_hex), bytes(aes.iv_hex), cipher)), aes.plain_hex)
})

test('HMAC + custom padding round-trips and detects tampering', () => {
  const plain = Buffer.from('M2 golden plaintext that is not block aligned')
  const key = bytes(CRYPTO.stream_keys.send_hmac_key_hex)
  const padded = appendHmacAndPadding(plain, key)
  assert.equal(padded.length % 16, 0)
  assert.equal(hex(stripHmacAndPadding(padded)), hex(plain))
  // Padding is the custom scheme: last byte is the pad byte count minus one.
  const padByte = padded[padded.length - 1]
  assert.ok(hex(padded.subarray(plain.length, plain.length + 20)).length === 40)
  assert.equal(verifyHmacSha1(key, plain, padded.subarray(plain.length, plain.length + 20)), true)
  assert.equal(verifyHmacSha1(key, plain, padded.subarray(plain.length + 1, plain.length + 21)), false)
  assert.equal(stripHmacAndPadding(Buffer.alloc(0)), null)
  void padByte
})

// ---------------------------------------------------------------------------
// M2 messages, encoders and parser
// ---------------------------------------------------------------------------

test('M2 message builders are byte-identical to Python', () => {
  assert.equal(hex(M2.buildInitialRequest(8)), M2_FIXTURE.messages.initial_request)
  assert.equal(hex(M2.buildEmptyLogin(8, 5, 'golden-pass', 80, 24)), M2_FIXTURE.messages.mepty_login)
  const data = Buffer.from([0x1b, 0x5b, 0x41, 0x7f, ...Buffer.from('hello')])
  assert.equal(hex(M2.buildEmptyData(8, 7, 123, data)), M2_FIXTURE.messages.mepty_data)
  assert.equal(hex(M2.buildEmptyData(8, 7, 456)), M2_FIXTURE.messages.mepty_data_ready)
})

test('M2 encoders are byte-identical to Python', () => {
  const encoders = {
    encode_bool_true: () => M2.encodeBool(M2.SYS_REQUEST, true),
    encode_bool_false: () => M2.encodeBool(M2.SYS_REQUEST, false),
    encode_u8: () => M2.encodeU8(M2.SYS_REQID, 200),
    encode_u8_user: () => M2.encodeU8User(2, 7),
    encode_u32: () => M2.encodeU32(M2.SYS_CMD, 0x0a0067),
    encode_u32_user: () => M2.encodeU32User(3, 664),
    encode_u32_array: () => M2.encodeU32Array(M2.SYS_TO, [13, 4, 0xffffffff]),
    encode_string_user_small: () => M2.encodeStringUser(1, 'admin'),
    encode_string_user_large: () => M2.encodeStringUser(1, 'x'.repeat(300)),
    encode_raw_user_small: () => M2.encodeRawUser(2, Buffer.from([0x1b, 0x5b, 0x31, 0x6d])),
    encode_raw_user_large: () => M2.encodeRawUser(2, Buffer.from('y'.repeat(300))),
    encode_embedded_msg_user: () => M2.encodeEmbeddedMsgUser(11, M2.encodeU8User(1, 0)),
  }
  for (const vector of M2_FIXTURE.encode) {
    assert.equal(hex(encoders[vector.name]()), vector.hex, vector.name)
  }
})

test('M2Parser reproduces every Python parsed field', () => {
  for (const vector of M2_FIXTURE.parser) {
    const parsed = M2Parser.parse(bytes(vector.frame_hex))
    const actual = {}
    for (const [fullKey, field] of parsed) {
      const value = field.type === 'raw' || field.type === 'msg' ? hex(field.value) : field.value
      actual[String(fullKey)] = [field.type, value]
    }
    assert.deepEqual(actual, vector.fields, vector.name)
  }
})

test('M2Parser getters return typed values and null when absent', () => {
  const initial = M2Parser.parse(M2.buildInitialRequest(8))
  assert.deepEqual(M2Parser.getSysTo(initial), [13, 4])
  assert.deepEqual(M2Parser.getSysFrom(initial), [0, 8])
  assert.equal(M2Parser.getSysCmd(initial), 7)
  assert.equal(M2Parser.getSysReqId(initial), 0)
  assert.equal(M2Parser.getSessionId(initial), null)
  assert.equal(M2Parser.getKey2Raw(initial), null)
  assert.equal(M2Parser.getSysStatus(initial), null)

  const dataBytes = Buffer.from([0x1b, 0x5b, 0x41, 0x7f, ...Buffer.from('hello')])
  const data = M2Parser.parse(M2.buildEmptyData(8, 7, 123, dataBytes))
  assert.equal(M2Parser.getSessionId(data), 7)
  assert.equal(hex(M2Parser.getKey2Raw(data)), hex(dataBytes))
  assert.equal(M2Parser.getSysCmd(data), 0x0a0067)

  const synthetic = M2Parser.parse(bytes(M2_FIXTURE.parser.find((p) => p.name === 'synthetic').frame_hex))
  assert.equal(M2Parser.getSysStatus(synthetic), 0)
  assert.equal(M2Parser.getSessionId(synthetic), 27)
})

test('M2Parser stops at unknown types and tolerates empty/non-M2 input', () => {
  assert.equal(M2Parser.parse(Buffer.alloc(0)).size, 0)
  assert.equal(M2Parser.parse(Buffer.from('XX')).size, 0)
  const withUnknown = Buffer.concat([
    M2.buildInitialRequest(8),
    Buffer.from([0x01, 0x00, 0x00, 0xf0]), // unknown TLV type -> parsing stops
    M2.encodeU8(M2.SYS_REQID, 9), // must be ignored
  ])
  const parsed = M2Parser.parse(withUnknown)
  assert.equal(M2Parser.getSysReqId(parsed), 0)
  assert.equal(parsed.size, 5)
})

// ---------------------------------------------------------------------------
// Chunk framing
// ---------------------------------------------------------------------------

test('encodeFrameChunks matches Python for multi-chunk payloads', () => {
  for (const frame of M2_FIXTURE.encrypted_frames) {
    assert.equal(hex(encodeFrameChunks(bytes(frame.payload_hex))), frame.wire_hex, frame.name)
  }
})

test('exact 255-byte payload gets the Python zero-length terminal chunk', () => {
  const wire = encodeFrameChunks(Buffer.alloc(255, 0x61))
  assert.equal(wire[0], 0xff)
  assert.equal(wire[1], 0x06)
  assert.equal(wire[2 + 255], 0x00)
  assert.equal(wire[2 + 255 + 1], 0xff)
  const decoder = new FrameDecoder()
  const frames = decoder.push(wire)
  assert.equal(frames.length, 1)
  assert.equal(frames[0].length, 255)
})

test('FrameDecoder handles arbitrary TCP splits (sticky/split packets)', () => {
  for (const frame of M2_FIXTURE.encrypted_frames) {
    const wire = bytes(frame.wire_hex)
    const decoder = new FrameDecoder()
    const frames = []
    for (let i = 0; i < wire.length; i += 1) {
      frames.push(...decoder.push(wire.subarray(i, i + 1)))
    }
    assert.equal(frames.length, 1, `${frame.name}: one frame`)
    assert.equal(hex(frames[0]), frame.payload_hex, `${frame.name}: payload`)

    const coalesced = new FrameDecoder()
    const both = coalesced.push(Buffer.concat([wire, wire]))
    assert.equal(both.length, 2, `${frame.name}: two coalesced frames`)
    assert.equal(hex(both[0]), frame.payload_hex)
    assert.equal(hex(both[1]), frame.payload_hex)
  }
})

test('FrameDecoder waits for the terminal chunk at a 255-byte boundary', () => {
  // Regression against the Python reference bug: if the buffer ends exactly on
  // a full 0xFF chunk it must NOT be treated as a complete frame.
  const wire = bytes(M2_FIXTURE.encrypted_frames.find((f) => f.name === 'large').wire_hex)
  const decoder = new FrameDecoder()
  assert.deepEqual(decoder.push(wire.subarray(0, 2 + 255)), [])
  const frames = decoder.push(wire.subarray(2 + 255))
  assert.equal(frames.length, 1)
  assert.equal(hex(frames[0]), M2_FIXTURE.encrypted_frames.find((f) => f.name === 'large').payload_hex)
})

test('encrypted frame pipeline reproduces Python ciphertext and decrypts', () => {
  for (const frame of M2_FIXTURE.encrypted_frames) {
    const plain = bytes(frame.plain_hex)
    const padded = appendHmacAndPadding(plain, bytes(frame.hmac_key_hex))
    assert.equal(hex(padded), frame.padded_hex, `${frame.name}: padded`)
    const cipher = encryptAesCbc(bytes(frame.aes_key_hex), bytes(frame.iv_hex), padded)
    assert.equal(hex(cipher), frame.cipher_hex, `${frame.name}: cipher`)
    const payload = Buffer.concat([u16be(cipher.length), bytes(frame.iv_hex), cipher])
    assert.equal(hex(payload), frame.payload_hex, `${frame.name}: payload`)
    assert.equal(hex(encodeFrameChunks(payload)), frame.wire_hex, `${frame.name}: wire`)

    const decryptedPadded = decryptAesCbc(bytes(frame.aes_key_hex), bytes(frame.iv_hex), cipher)
    assert.equal(hex(stripHmacAndPadding(decryptedPadded)), frame.plain_hex, `${frame.name}: decrypt`)
    assert.equal(
      verifyHmacSha1(bytes(frame.hmac_key_hex), plain, padded.subarray(plain.length, plain.length + 20)),
      true,
      `${frame.name}: hmac`
    )
  }
})

// ---------------------------------------------------------------------------
// ANSI / prompt / pagination
// ---------------------------------------------------------------------------

test('stripAnsi matches the Python wb_run.normalize output for all cases', () => {
  for (const testCase of TERMINAL.cases) {
    assert.equal(stripAnsi(bytes(testCase.raw_hex)), testCase.stripped, testCase.name)
  }
  assert.equal(stripAnsi(bytes(TERMINAL.normalization.raw_hex)), TERMINAL.normalization.stripped)
  assert.equal(stripAnsi(''), '')
  assert.equal(stripAnsi(Buffer.from('a\r\nb\rc')), 'a\nb\nc')
})

test('prompt and pagination detection match the Python driver heuristics', () => {
  for (const testCase of TERMINAL.cases) {
    const stripped = stripAnsi(bytes(testCase.raw_hex))
    assert.equal(isPromptAtEnd(stripped), testCase.prompt, testCase.name)
    assert.equal(findPaginationTrigger(stripped), testCase.pagination, testCase.name)
  }
  assert.equal(isPromptAtEnd(''), false)
  assert.equal(isPromptAtEnd('plain output'), false)
})

test('cleanCommandOutput drops the echoed command and prompts', () => {
  const command = TERMINAL.cases.find((c) => c.name === 'command_output_prompt')
  const output = cleanCommandOutput(command.stripped, '/system resource print')
  assert.ok(!output.includes('/system resource print'))
  assert.ok(!output.includes('[admin@MikroTik]'))
  assert.ok(output.includes('uptime: 1d2h3m4s'))
  assert.equal(output.split('\n').length, 3)

  const directory = TERMINAL.cases.find((c) => c.name === 'directory_prompt')
  const directoryOutput = cleanCommandOutput(directory.stripped, '/ip address print')
  assert.ok(directoryOutput.startsWith('Flags: X - disabled, I - invalid'))
  assert.ok(!directoryOutput.includes('> /ip address print'))
})

// ---------------------------------------------------------------------------
// TerminalCollector (transcript accumulation used by runCommand)
// ---------------------------------------------------------------------------

test('TerminalCollector accumulates chunked output and sees the prompt', () => {
  const testCase = TERMINAL.cases.find((c) => c.name === 'command_output_prompt')
  const raw = bytes(testCase.raw_hex)
  const collector = new TerminalCollector({ command: '/system resource print' })
  const chunks = []
  for (let i = 0; i < raw.length; i += 3) {
    chunks.push(collector.feed(raw.subarray(i, i + 3)).text)
  }
  assert.equal(chunks.join(''), testCase.stripped)
  assert.equal(collector.promptSeen, true)
  assert.equal(collector.isComplete(Date.now() + 1000), true)
  assert.equal(collector.isTimedOut(Date.now() + 1000), false)
  assert.equal(collector.finish().split('\n').length, 3)
})

test('TerminalCollector reports each pagination prompt exactly once', () => {
  const testCase = TERMINAL.cases.find((c) => c.name === 'pagination')
  const collector = new TerminalCollector({ command: '/interface print' })
  const first = collector.feed(bytes(testCase.raw_hex))
  assert.equal(first.quit, true)
  assert.equal(collector.isComplete(Date.now() + 1000), false)
  const second = collector.feed(Buffer.from('more output\r\n'))
  assert.equal(second.quit, false)
  collector.feed(Buffer.from('extra --More-- [Q quit|Dump]\r\n'))
  assert.equal(collector.feed(Buffer.from('x')).quit, false)
})

test('TerminalCollector times out without a prompt and reports partial output', () => {
  const collector = new TerminalCollector({ command: 'slow', idleTimeoutMs: 1000 })
  collector.feed(Buffer.from('partial output\r\n'))
  assert.equal(collector.isComplete(), false)
  assert.equal(collector.isTimedOut(Date.now() + 2000), true)
  assert.equal(collector.finish(), 'partial output')
})

// ---------------------------------------------------------------------------
// Errors / client contract
// ---------------------------------------------------------------------------

test('WinboxError carries code, details and the documented error codes', () => {
  const error = new WinboxError('TIMEOUT', 'boom', { partial: true })
  assert.equal(error.name, 'WinboxError')
  assert.equal(error.code, 'TIMEOUT')
  assert.equal(error.details.partial, true)
  assert.ok(error instanceof Error)
  for (const code of [
    'CONNECT_FAILED', 'AUTH_FAILED', 'LEGACY_AUTH_UNSUPPORTED', 'PROTOCOL_ERROR',
    'TIMEOUT', 'CLOSED', 'READ_ONLY_BLOCKED', 'CREDENTIALS_ERROR', 'UNSUPPORTED',
  ]) {
    assert.equal(ERROR_CODES[code], code)
  }
})

test('client rejects operations before connect/authenticate', async () => {
  const client = new WinboxClient({ host: '127.0.0.1', connectTimeoutMs: 1000 })
  await assert.rejects(
    client.authenticate({ username: 'admin', password: 'secret' }),
    (error) => error instanceof WinboxError && error.code === 'CONNECT_FAILED'
  )
  await assert.rejects(
    client.openTerminal(),
    (error) => error instanceof WinboxError && error.code === 'AUTH_FAILED'
  )
  await assert.rejects(
    client.runCommand('/system identity print'),
    (error) => error instanceof WinboxError && error.code === 'PROTOCOL_ERROR'
  )
  assert.throws(
    () => new WinboxClient({}),
    (error) => error instanceof WinboxError && error.code === 'CONNECT_FAILED'
  )
})

test('client.close is idempotent and never throws', async () => {
  const client = new WinboxClient({ host: '127.0.0.1', port: 1 })
  await client.close()
  await client.close()
  await client.close()
  assert.equal(typeof client.connect, 'function')
})

test('connect() to a closed port fails with CONNECT_FAILED quickly', async () => {
  const client = new WinboxClient({ host: '127.0.0.1', port: 1, connectTimeoutMs: 2000 })
  try {
    await assert.rejects(
      client.connect(),
      (error) => error instanceof WinboxError && error.code === 'CONNECT_FAILED'
    )
  } finally {
    await client.close()
  }
})

// ---------------------------------------------------------------------------
// Authentication handshake against a local fake RouterOS socket
// ---------------------------------------------------------------------------

async function startFakeRouter (onSocket) {
  const sockets = new Set()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))
    onSocket(socket)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    port: server.address().port,
    async close () {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

test('legacy (non EC-SRP5) challenge is reported, never retried with MD5', async () => {
  const fake = await startFakeRouter((socket) => {
    socket.once('data', () => socket.write(Buffer.from([0x01, 0x01, 0x00])))
  })
  const client = new WinboxClient({ host: '127.0.0.1', port: fake.port, connectTimeoutMs: 2000 })
  try {
    await client.connect()
    await assert.rejects(
      client.authenticate({ username: 'admin', password: 'secret' }),
      (error) => error instanceof WinboxError && error.code === 'LEGACY_AUTH_UNSUPPORTED'
    )
  } finally {
    await client.close()
    await fake.close()
  }
})

test('malformed EC-SRP5 challenge size is rejected as UNSUPPORTED', async () => {
  const fake = await startFakeRouter((socket) => {
    socket.once('data', () => socket.write(Buffer.from([0x03, 0x06, 0x00, 0x01, 0x02])))
  })
  const client = new WinboxClient({ host: '127.0.0.1', port: fake.port, connectTimeoutMs: 2000 })
  try {
    await client.connect()
    await assert.rejects(
      client.authenticate({ username: 'admin', password: 'secret' }),
      (error) => error instanceof WinboxError && error.code === 'UNSUPPORTED'
    )
  } finally {
    await client.close()
    await fake.close()
  }
})

test('missing server confirmation maps to AUTH_FAILED', async () => {
  const keys = CRYPTO.keys
  const challenge = Buffer.concat([
    Buffer.from([49, 0x06]),
    bytes(keys.server_pub_hex),
    Buffer.from([keys.server_parity]),
    bytes(CRYPTO.validator.salt_hex),
  ])
  const fake = await startFakeRouter((socket) => {
    socket.once('data', () => socket.write(challenge))
  })
  const client = new WinboxClient({ host: '127.0.0.1', port: fake.port, connectTimeoutMs: 300 })
  try {
    await client.connect()
    await assert.rejects(
      client.authenticate({ username: 'admin', password: 'secret' }),
      (error) => error instanceof WinboxError && error.code === 'AUTH_FAILED'
    )
  } finally {
    await client.close()
    await fake.close()
  }
})

test('wrong password: RouterOS reason frame maps to sanitized AUTH_FAILED', async () => {
  const keys = CRYPTO.keys
  const challenge = Buffer.concat([
    Buffer.from([49, 0x06]),
    bytes(keys.server_pub_hex),
    Buffer.from([keys.server_parity]),
    bytes(CRYPTO.validator.salt_hex),
  ])
  // RouterOS rejects a bad EC-SRP5 login with a tag 0x06 frame whose payload is
  // a short reason string instead of the 32-byte server confirmation.
  const refusal = Buffer.concat([
    Buffer.from('invalid user name or password'),
    // A hostile/buggy server could append escape bytes; they must be stripped.
    Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d]),
  ])
  const fake = await startFakeRouter((socket) => {
    let exchanges = 0
    socket.on('data', () => {
      exchanges += 1
      if (exchanges === 1) socket.write(challenge)
      else if (exchanges === 2) {
        socket.write(Buffer.concat([Buffer.from([refusal.length, 0x06]), refusal]))
      }
    })
  })
  const client = new WinboxClient({ host: '127.0.0.1', port: fake.port, connectTimeoutMs: 2000 })
  try {
    await client.connect()
    await assert.rejects(
      client.authenticate({ username: 'admin', password: 'secret-password-123' }),
      (error) => {
        assert.ok(error instanceof WinboxError)
        assert.equal(error.code, 'AUTH_FAILED')
        assert.match(error.message, /wrong username or password/)
        assert.match(error.message, /invalid user name or password/)
        assert.doesNotMatch(error.message, /secret-password-123/)
        assert.doesNotMatch(error.message, /\x1b/)
        assert.equal(error.details.serverReplyLength, refusal.length)
        return true
      }
    )
  } finally {
    await client.close()
    await fake.close()
  }
})

test('sanitizeServerAuthReply strips control bytes and caps length', () => {
  assert.equal(sanitizeServerAuthReply(Buffer.from('invalid user name or password')), 'invalid user name or password')
  assert.equal(sanitizeServerAuthReply(Buffer.from([0x00, 0x1b, 0x07, 0x41])), 'A')
  assert.equal(sanitizeServerAuthReply(Buffer.from('x'.repeat(500))).length, 120)
  assert.equal(sanitizeServerAuthReply(null), '')
})

// ---------------------------------------------------------------------------
// runSession orchestration
// ---------------------------------------------------------------------------

function makeFakeClient () {
  const calls = { connect: 0, authenticate: 0, openTerminal: 0, close: 0, commands: [] }
  return {
    calls,
    async connect () { calls.connect += 1 },
    async authenticate (credentials) {
      calls.authenticate += 1
      assert.equal(credentials.username, 'admin')
    },
    async openTerminal (options) {
      calls.openTerminal += 1
      assert.deepEqual(options, { cols: 120, rows: 40 })
    },
    async runCommand (command) {
      calls.commands.push(command)
      if (command === 'timeout-me') {
        const error = new WinboxError('TIMEOUT', 'timed out', { output: 'partial output' })
        error.output = 'partial output'
        throw error
      }
      return `output of ${command}`
    },
    async close () { calls.close += 1 },
  }
}

test('runSession returns per-command results and keeps going after TIMEOUT', async () => {
  const fake = makeFakeClient()
  const results = await runSession({
    host: '127.0.0.1',
    username: 'admin',
    password: 'secret',
    commands: ['/system identity print', 'timeout-me', '/ip address print'],
    openTerminal: { cols: 120, rows: 40 },
    clientFactory: () => fake,
  })
  assert.equal(fake.calls.connect, 1)
  assert.equal(fake.calls.authenticate, 1)
  assert.equal(fake.calls.openTerminal, 1)
  assert.equal(fake.calls.close, 1)
  assert.deepEqual(results.map((r) => r.ok), [true, false, true])
  assert.equal(results[0].output, 'output of /system identity print')
  assert.equal(results[1].output, 'partial output')
  assert.equal(results[1].error, 'TIMEOUT')
  assert.equal(results[2].command, '/ip address print')
})

test('runSession closes the session when connecting fails', async () => {
  let closed = 0
  await assert.rejects(
    runSession({
      host: '127.0.0.1',
      username: 'admin',
      password: 'secret',
      commands: [],
      clientFactory: () => ({
        async connect () { throw new WinboxError('CONNECT_FAILED', 'nope') },
        async close () { closed += 1 },
      }),
    }),
    (error) => error instanceof WinboxError && error.code === 'CONNECT_FAILED'
  )
  assert.equal(closed, 1)
})

test('runSession validates required arguments', async () => {
  await assert.rejects(runSession({ username: 'admin', password: 'x' }), /host is required/)
  await assert.rejects(
    runSession({ host: '127.0.0.1', username: 'admin', password: 'x', commands: 'nope' }),
    (error) => error instanceof WinboxError && error.code === 'UNSUPPORTED'
  )
})
