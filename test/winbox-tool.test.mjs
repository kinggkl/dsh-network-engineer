// Unit tests for the mt_winbox_exec tool layer (lib/mikrotik-tool.mjs).
//
// These tests never open a socket and never touch a real device: the protocol
// client is injected through `createWinboxTool({ clientFactory })`, so the tool
// contract (schema, render, credentials, read-only gate, truncation, secret
// redaction) is verified in isolation from the WireBox protocol implementation
// that ships in lib/winbox/client.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  checkReadOnly,
  createWinboxTool,
  formatWinboxText,
  redactSecrets,
  resolveCredentials,
} from '../lib/mikrotik-tool.mjs'

const HOST = '192.0.2.10'
const PORT = 8291
const PASSWORD = 'S3cr3t-WinBox-Pa55!'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary credentials file and register cleanup on the test. */
function makeCredentialsFile(t, data, { mode = 0o600, raw } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-winbox-tool-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'winbox.json')
  writeFileSync(file, raw ?? JSON.stringify(data, null, 2))
  if (mode !== null) chmodSync(file, mode)
  return file
}

/** Path inside a fresh temporary directory (does not exist unless created). */
function makeMissingFile(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-winbox-missing-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, 'winbox.json')
}

/**
 * In-memory protocol client. Records every call so tests can assert that the
 * tool short-circuits before `connect()`/`runCommand()` when it should.
 */
function createFakeClient({ outputs = {}, runCommand, connect, authenticate, openTerminal } = {}) {
  const calls = {
    connect: 0,
    authenticate: [],
    openTerminal: [],
    runCommand: [],
    close: 0,
  }
  const client = {
    calls,
    async connect() {
      calls.connect += 1
      if (typeof connect === 'function') return connect()
      return undefined
    },
    async authenticate(credentials) {
      calls.authenticate.push(credentials)
      if (typeof authenticate === 'function') return authenticate(credentials)
      return undefined
    },
    async openTerminal(options) {
      calls.openTerminal.push(options)
      if (typeof openTerminal === 'function') return openTerminal(options)
      return undefined
    },
    async runCommand(command, options = {}) {
      calls.runCommand.push({ command, options })
      if (typeof runCommand === 'function') return runCommand(command, options, client)
      return Object.hasOwn(outputs, command) ? outputs[command] : ''
    },
    async close() {
      calls.close += 1
    },
  }
  return client
}

/** Wrap a fake client in a recording clientFactory. */
function createFactory(client) {
  const state = { calls: 0, options: [] }
  const factory = (options) => {
    state.calls += 1
    state.options.push(options)
    return client
  }
  return { factory, state }
}

/** Default execute() arguments with an explicit credentials file. */
function baseArgs(credentialsFile, overrides = {}) {
  return {
    host: HOST,
    port: PORT,
    commands: ['/system resource print'],
    credentialsFile,
    ...overrides,
  }
}

/** Await a rejection and return the error (fails the test when it resolves). */
async function captureError(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  assert.fail('expected the promise to reject')
}

/** Attach a WinboxError-style code to a plain Error (stands in for client errors). */
function codedError(message, code) {
  return Object.assign(new Error(message), { code })
}

// ---------------------------------------------------------------------------
// 1. Raw ToolDefinition contract
// ---------------------------------------------------------------------------

test('createWinboxTool returns a raw ToolDefinition with the expected shape', () => {
  let factoryCalls = 0
  const tool = createWinboxTool({
    clientFactory: () => {
      factoryCalls += 1
      return createFakeClient()
    },
  })

  assert.equal(tool.name, 'mt_winbox_exec')
  assert.equal(typeof tool.description, 'string')
  assert.ok(tool.description.length > 40)
  assert.equal(tool.parameters.type, 'object')
  assert.deepEqual(tool.parameters.required, ['host', 'commands'])
  assert.equal(tool.parameters.additionalProperties, false)
  assert.equal(tool.parameters.properties.commands.type, 'array')
  assert.equal(tool.parameters.properties.commands.minItems, 1)
  assert.equal(tool.parameters.properties.commands.maxItems, 30)
  assert.equal(tool.parameters.properties.port.default, 8291)
  assert.equal(tool.parameters.properties.allowWrite.default, false)
  assert.equal(tool.parameters.properties.credentialsFile.type, 'string')
  assert.equal(tool.parameters.properties.credentialKey.type, 'string')

  assert.equal(tool.output.schema.type, 'object')
  assert.equal(tool.output.schema.additionalProperties, false)
  assert.deepEqual(tool.output.schema.required, [
    'host',
    'port',
    'username',
    'authenticated',
    'durationMs',
    'commands',
  ])
  assert.equal(tool.output.schema.properties.commands.items.required.includes('ok'), true)

  assert.equal(typeof tool.execute, 'function')
  assert.equal(typeof tool.output.render, 'function')
  assert.equal(tool.timeoutMs, 120_000)
  assert.equal(tool.isConcurrencySafe({}), false)
  assert.equal(factoryCalls, 0, 'creating the definition must not create a client')
})

test('output.render returns a single text ContentBlock using formatWinboxText', () => {
  const tool = createWinboxTool({ clientFactory: () => createFakeClient() })
  const args = { host: HOST, commands: ['/interface print'] }
  const value = {
    host: HOST,
    port: PORT,
    username: 'admin',
    authenticated: true,
    durationMs: 12,
    commands: [{ command: '/interface print', ok: true, output: 'ether1' }],
  }

  const blocks = tool.output.render(args, value)
  assert.deepEqual(blocks, [{ type: 'text', text: formatWinboxText(value) }])
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'text')
  assert.equal(typeof blocks[0].text, 'string')
  assert.match(blocks[0].text, /^# WinBox 192\.0\.2\.10:8291 user=admin authenticated=true 12ms$/m)
  assert.match(blocks[0].text, /^## \/interface print$/m)
})

// ---------------------------------------------------------------------------
// 2. Text formatting
// ---------------------------------------------------------------------------

test('formatWinboxText follows the spec layout (header, command, failure code, truncation)', () => {
  const value = {
    host: HOST,
    port: 8291,
    username: 'admin',
    authenticated: false,
    durationMs: 34,
    truncated: true,
    commands: [
      { command: '/system resource print', ok: true, output: 'uptime: 1d\n' },
      { command: '/system license print', ok: false, output: 'partial', error: 'TIMEOUT' },
    ],
  }
  const text = formatWinboxText(value)
  const lines = text.split('\n')

  assert.equal(lines[0], '# WinBox 192.0.2.10:8291 user=admin authenticated=false 34ms')
  assert.equal(lines[1], '## /system resource print')
  assert.equal(lines[2], 'uptime: 1d')
  assert.equal(lines[3], '## /system license print  [FAILED: TIMEOUT]')
  assert.equal(lines[4], 'partial')
  assert.equal(lines.at(-1), '[truncated]')
})

test('formatWinboxText handles a non-object value without throwing', () => {
  assert.equal(formatWinboxText(null), '')
  assert.equal(formatWinboxText(undefined), '')
  assert.equal(formatWinboxText('nope'), '')
})

test('redactSecrets removes every known secret and tolerates empty input', () => {
  assert.equal(redactSecrets('pw=abc and abc', ['abc']), 'pw=<redacted> and <redacted>')
  assert.equal(
    redactSecrets('pw=a and longersecret', ['a', 'longersecret']),
    'pw=<redacted> <redacted>nd <redacted>',
  )
  assert.equal(redactSecrets('nothing here', []), 'nothing here')
  assert.equal(redactSecrets(null, [null, '']), '')
})

// ---------------------------------------------------------------------------
// 3. Read-only gate: allowlist and denylist
// ---------------------------------------------------------------------------

const ALLOWED_COMMANDS = [
  '/export',
  '/export terse',
  '/export hide-sensitive',
  '/print',
  '/system resource print',
  '/system identity print',
  '/system health print',
  '/system routerboard print',
  '/system license print',
  '/interface print',
  '/interface ethernet print',
  '/interface ethernet print detail',
  '/interface wireless scan',
  '/ip address print',
  '/ip route print',
  '/ip route print where dst-address=0.0.0.0/0',
  '/ipv6 route print',
  '/routing ospf neighbor print',
  '/mpls ldp neighbor print',
  '/queue simple print',
  '/log print',
  '/ping 8.8.8.8 count=4',
  '/traceroute 1.1.1.1',
  '/tool ping 8.8.8.8',
  '/tool profile',
  '/file print',
  '/user print',
  '/snmp print',
  '/certificate print',
  '/ppp active print',
  '/ppp secret print',
  '/caps-man registration-table print',
  '/container print',
  // RouterOS keywords are case-insensitive; the read-only path family follows.
  '/IP ROUTE PRINT',
  '/System Resource PRINT',
]

const DENIED_COMMANDS = [
  '/ip address add address=192.0.2.1/24 interface=ether1',
  '/ip service disable telnet',
  '/ip dns set servers=8.8.8.8',
  '/ip firewall filter remove 0',
  '/ip route delete 0',
  '/interface ethernet set ether1 disabled=yes',
  '/user add name=evil',
  '/file remove 0',
  '/system reboot',
  '/system shutdown',
  '/system reset-configuration',
  '/system backup save name=before-change',
  '/system backup load name=before-change',
  '/system package update install',
  '/certificate import file=cert.pfx',
  '/queue simple rename 0 name=test',
  '/export file=/tmp/backup',
  '/export show-sensitive',
  '/interface print; /system reboot',
  '/interface print\n/system reboot',
  '/tool sniffer start\n/system reboot',
  '',
  '   ',
  123,
  // QA regression: uppercase verbs must not bypass the deny rule.
  '/ip route ADD distance=1 gateway=1.1.1.1',
  '/interface SET ether1 disabled=yes',
  '/ip firewall filter ADD chain=input action=drop',
  '/ip address ADD address=192.0.2.1/24 interface=ether1',
  '/queue simple ADD name=q1 max-limit=1M/1M',
  // QA regression: verbs that were previously missing from DANGEROUS_VERBS.
  '/ip route insert 0 gateway=1.1.1.1',
  '/system script RUN print',
  '/system script run print',
  '/tool fetch url=http://example.com/x',
  '/system backup save name=print',
  '/system backup load name=print',
  // QA regression: export options are matched case-insensitively.
  '/export FILE=/tmp/x',
  '/export SHOW-SENSITIVE',
  '/export hide-sensitive file=x',
  // QA regression (M1): `file=` on a print command writes device storage.
  '/ip address print file=backup',
  '/ip route print file=route.txt',
]

test('checkReadOnly allows the documented read-only commands', () => {
  for (const command of ALLOWED_COMMANDS) {
    assert.deepEqual(checkReadOnly(command), { ok: true }, `expected allowed: ${String(command)}`)
  }
  assert.ok(ALLOWED_COMMANDS.length >= 10)
})

test('checkReadOnly rejects writes, injection, unsafe exports and junk', () => {
  for (const command of DENIED_COMMANDS) {
    const verdict = checkReadOnly(command)
    assert.equal(verdict.ok, false, `expected denied: ${String(command)}`)
    assert.equal(typeof verdict.reason, 'string')
    assert.ok(verdict.reason.length > 0)
  }
  assert.ok(DENIED_COMMANDS.length >= 10)
})

test('checkReadOnly reports the offending write verb in the reason', () => {
  assert.match(checkReadOnly('/ip service disable telnet').reason, /disable/)
  assert.match(checkReadOnly('/system reboot').reason, /reboot/)
  assert.match(checkReadOnly('/ip address add address=1.1.1.1/32 interface=ether1').reason, /add/)
  assert.match(checkReadOnly('/export file=/tmp/x').reason, /export/)
  assert.match(checkReadOnly('/ip route print; /system reboot').reason, /;/)
})

test('checkReadOnly is case-insensitive and anchors the print family (QA regression)', () => {
  // Uppercase verbs are still writes.
  assert.match(checkReadOnly('/ip route ADD distance=1 gateway=1.1.1.1').reason, /ADD/i)
  // Verb-shaped values cannot smuggle a write through the print allowlist.
  assert.equal(checkReadOnly('/system backup save name=print').ok, false)
  assert.equal(checkReadOnly('/system backup load name=print').ok, false)
  assert.equal(checkReadOnly('/system script run print').ok, false)
  // A real `print` command word still passes, including arguments after it.
  assert.deepEqual(checkReadOnly('/ip route print where dst-address=0.0.0.0/0'), { ok: true })
  assert.deepEqual(checkReadOnly('/IP ROUTE PRINT'), { ok: true })
  assert.deepEqual(checkReadOnly('/interface ethernet print detail'), { ok: true })
  // `file=` output redirection is a write even on a print command.
  assert.equal(checkReadOnly('/ip address print file=backup').ok, false)
  assert.match(checkReadOnly('/ip address print file=backup').reason, /file=/)
})

// ---------------------------------------------------------------------------
// 4. Read-only preflight: blocked before any network / credentials access
// ---------------------------------------------------------------------------

test('blocked commands fail with READ_ONLY_BLOCKED before the client is created', async (t) => {
  const client = createFakeClient()
  const { factory, state } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })
  // A deliberately non-existent credentials file proves the gate runs first.
  const missing = makeMissingFile(t)

  const error = await captureError(
    tool.execute(
      baseArgs(missing, {
        commands: ['/system resource print', '/ip service disable telnet'],
      }),
      {},
    ),
  )

  assert.equal(error.code, 'READ_ONLY_BLOCKED')
  assert.match(error.message, /只读门禁/)
  assert.match(error.message, /2\) \/ip service disable telnet/)
  assert.match(error.message, /allowWrite=true/)
  assert.equal(state.calls, 0, 'client factory must not be called')
  assert.equal(client.calls.connect, 0)
  assert.equal(client.calls.runCommand.length, 0)
})

test('read-only preflight validates every command, not just the first', async (t) => {
  const client = createFakeClient()
  const { factory, state } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })

  const error = await captureError(
    tool.execute(
      baseArgs(file, {
        commands: ['/system resource print', '/system identity print', '/ip service disable telnet'],
      }),
      {},
    ),
  )

  assert.equal(error.code, 'READ_ONLY_BLOCKED')
  assert.match(error.message, /3\) \/ip service disable telnet/)
  assert.equal(state.calls, 0)
})

// ---------------------------------------------------------------------------
// 5. Happy path with an injected fake client
// ---------------------------------------------------------------------------

test('execute runs the read-only session and returns the documented value', async (t) => {
  const file = makeCredentialsFile(t, {
    [`${HOST}:${PORT}`]: { username: 'admin', password: PASSWORD },
  })
  const client = createFakeClient({
    outputs: {
      '/system resource print': { output: 'uptime: 1d\r\ncpu-load: 3\r\n' },
      '/interface print': 'ether1 ether2',
    },
  })
  const { factory, state } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const value = await tool.execute(
    baseArgs(file, { commands: ['/system resource print', '/interface print'] }),
    {},
  )

  assert.equal(value.host, HOST)
  assert.equal(value.port, PORT)
  assert.equal(value.username, 'admin')
  assert.equal(value.authenticated, true)
  assert.equal(typeof value.durationMs, 'number')
  assert.ok(value.durationMs >= 0)
  assert.deepEqual(value.commands, [
    { command: '/system resource print', ok: true, output: 'uptime: 1d\ncpu-load: 3\n' },
    { command: '/interface print', ok: true, output: 'ether1 ether2' },
  ])
  assert.equal(value.truncated, undefined)

  assert.equal(state.calls, 1)
  assert.equal(state.options[0].host, HOST)
  assert.equal(state.options[0].port, PORT)
  assert.equal(state.options[0].connectTimeoutMs, 10_000)

  assert.equal(client.calls.connect, 1)
  assert.deepEqual(client.calls.authenticate, [{ username: 'admin', password: PASSWORD }])
  assert.deepEqual(client.calls.openTerminal, [{ cols: 200, rows: 1000 }])
  assert.deepEqual(
    client.calls.runCommand.map((call) => call.command),
    ['/system resource print', '/interface print'],
  )
  for (const call of client.calls.runCommand) {
    assert.equal(typeof call.options.idleTimeoutMs, 'number')
    assert.ok(call.options.idleTimeoutMs >= 500)
    assert.equal(typeof call.options.onOutput, 'function')
  }
  assert.equal(client.calls.close, 1, 'client.close() must be called')
})

test('execute trims commands and defaults the port to 8291', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const client = createFakeClient({ outputs: { '/log print': '' } })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const value = await tool.execute(
    {
      host: `  ${HOST}  `,
      commands: ['/log print'],
      credentialsFile: file,
    },
    {},
  )

  assert.equal(value.host, HOST)
  assert.equal(value.port, 8291)
  assert.equal(value.commands[0].command, '/log print')
  assert.equal(value.username, 'admin')
})

// ---------------------------------------------------------------------------
// 6. Argument validation
// ---------------------------------------------------------------------------

test('execute rejects malformed commands arguments', async () => {
  const invalid = [
    undefined,
    [],
    [1, 2, 3],
    ['/system resource print', ''],
    ['/system resource print', '   '],
    ['/system resource print\n/system reboot'],
    ['/system resource print; /system reboot'],
    Array.from({ length: 31 }, () => '/system resource print'),
  ]
  for (const commands of invalid) {
    const tool = createWinboxTool({ clientFactory: () => createFakeClient() })
    const error = await captureError(tool.execute({ host: HOST, commands }, {}))
    assert.equal(error.code, 'UNSUPPORTED', `commands=${JSON.stringify(commands)}`)
    assert.match(error.message, /commands/)
  }
})

test('execute rejects a missing or empty host', async () => {
  for (const args of [null, undefined, {}, { host: '   ', commands: ['/log print'] }]) {
    const tool = createWinboxTool({ clientFactory: () => createFakeClient() })
    const error = await captureError(tool.execute(args, {}))
    assert.equal(error.code, 'UNSUPPORTED')
    assert.match(error.message, /host/)
  }
})

// ---------------------------------------------------------------------------
// 7. Credentials: lookup order, username precedence, env, errors
// ---------------------------------------------------------------------------

test('resolveCredentials prefers host:port over host over default', async (t) => {
  const file = makeCredentialsFile(t, {
    default: { username: 'from-default', password: 'default-pw' },
    [HOST]: { username: 'from-host', password: 'host-pw' },
    [`${HOST}:${PORT}`]: { username: 'from-host-port', password: PASSWORD },
  })

  const credentials = await resolveCredentials({ host: HOST, port: PORT, credentialsFile: file })
  assert.equal(credentials.key, `${HOST}:${PORT}`)
  assert.equal(credentials.username, 'from-host-port')
  assert.equal(credentials.password, PASSWORD)
  assert.equal(credentials.source, file)
})

test('resolveCredentials falls back to the host key and then to default', async (t) => {
  const hostFile = makeCredentialsFile(t, {
    default: { username: 'from-default', password: 'default-pw' },
    [HOST]: { username: 'from-host', password: 'host-pw' },
  })
  const hostCredentials = await resolveCredentials({
    host: HOST,
    port: PORT,
    credentialsFile: hostFile,
    env: {},
  })
  assert.equal(hostCredentials.key, HOST)
  assert.equal(hostCredentials.username, 'from-host')

  const defaultFile = makeCredentialsFile(t, {
    default: { username: 'from-default', password: 'default-pw' },
  })
  const defaultCredentials = await resolveCredentials({
    host: '198.51.100.7',
    port: PORT,
    credentialsFile: defaultFile,
    env: {},
  })
  assert.equal(defaultCredentials.key, 'default')
  assert.equal(defaultCredentials.username, 'from-default')
})

test('resolveCredentials lets credentialKey override the host entries', async (t) => {
  const file = makeCredentialsFile(t, {
    default: { username: 'from-default', password: 'default-pw' },
    [`${HOST}:${PORT}`]: { username: 'from-host-port', password: PASSWORD },
    'lab-device': { username: 'lab-user', password: 'lab-pw' },
  })

  const credentials = await resolveCredentials({
    host: HOST,
    port: PORT,
    credentialsFile: file,
    credentialKey: 'lab-device',
    env: {},
  })
  assert.equal(credentials.key, 'lab-device')
  assert.equal(credentials.username, 'lab-user')
  assert.equal(credentials.password, 'lab-pw')
})

test('resolveCredentials errors with CREDENTIALS_ERROR when the explicit key is absent', async (t) => {
  const file = makeCredentialsFile(t, {
    default: { username: 'admin', password: PASSWORD },
  })

  const error = await captureError(
    resolveCredentials({ host: HOST, credentialsFile: file, credentialKey: 'missing-key', env: {} }),
  )
  assert.equal(error.code, 'CREDENTIALS_ERROR')
  assert.match(error.message, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(error.message, /missing-key/)
  assert.ok(!error.message.includes(PASSWORD), 'must not echo file contents')
})

test('resolveCredentials errors with CREDENTIALS_ERROR for a missing file', async (t) => {
  const missing = makeMissingFile(t)
  const error = await captureError(resolveCredentials({ host: HOST, port: PORT, credentialsFile: missing, env: {} }))
  assert.equal(error.code, 'CREDENTIALS_ERROR')
  assert.ok(error.message.includes(missing))
  assert.match(error.message, new RegExp(`${HOST}:${PORT}`))
})

test('resolveCredentials maps invalid JSON to CREDENTIALS_ERROR without echoing contents', async (t) => {
  const file = makeCredentialsFile(t, null, {
    raw: `{"default": {"username": "admin", "password": "${PASSWORD}"`,
    mode: 0o600,
  })
  const error = await captureError(resolveCredentials({ host: HOST, credentialsFile: file, env: {} }))
  assert.equal(error.code, 'CREDENTIALS_ERROR')
  assert.match(error.message, /JSON/)
  assert.ok(error.message.includes(file))
  assert.ok(!error.message.includes(PASSWORD), 'file contents must not leak into the error')
})

test('resolveCredentials rejects a non-object file and entries without a password', async (t) => {
  const arrayFile = makeCredentialsFile(t, null, { raw: '[]' })
  const arrayError = await captureError(resolveCredentials({ host: HOST, credentialsFile: arrayFile, env: {} }))
  assert.equal(arrayError.code, 'CREDENTIALS_ERROR')

  const noPasswordFile = makeCredentialsFile(t, { default: { username: 'admin' } })
  const noPasswordError = await captureError(
    resolveCredentials({ host: HOST, credentialsFile: noPasswordFile, env: {} }),
  )
  assert.equal(noPasswordError.code, 'CREDENTIALS_ERROR')
  assert.match(noPasswordError.message, /password/)
})

test('a username in the file wins; the username argument is only a fallback', async (t) => {
  const file = makeCredentialsFile(t, {
    default: { username: 'file-user', password: PASSWORD },
    'no-user': { password: PASSWORD },
  })
  const fromFile = await resolveCredentials({ host: HOST, credentialsFile: file, username: 'arg-user', env: {} })
  assert.equal(fromFile.username, 'file-user')

  const fromArg = await resolveCredentials({ host: HOST, credentialsFile: file, username: 'arg-user', credentialKey: 'no-user', env: {} })
  assert.equal(fromArg.username, 'arg-user')
})

test('DSH_WINBOX_CREDENTIALS is used when credentialsFile is not given', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'env-user', password: PASSWORD } })
  const fromEnv = await resolveCredentials({
    host: HOST,
    env: { DSH_WINBOX_CREDENTIALS: file },
  })
  assert.equal(fromEnv.source, file)
  assert.equal(fromEnv.username, 'env-user')

  const explicit = makeCredentialsFile(t, { default: { username: 'option-user', password: PASSWORD } })
  const fromOption = await resolveCredentials({
    host: HOST,
    credentialsFile: explicit,
    env: { DSH_WINBOX_CREDENTIALS: file },
  })
  assert.equal(fromOption.source, explicit)
  assert.equal(fromOption.username, 'option-user')
})

test('execute surfaces CREDENTIALS_ERROR when only writes were allowed but no credentials exist', async (t) => {
  const missing = makeMissingFile(t)
  const client = createFakeClient()
  const { factory, state } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const error = await captureError(
    tool.execute(
      baseArgs(missing, { commands: ['/ip service disable telnet'], allowWrite: true }),
      {},
    ),
  )
  assert.equal(error.code, 'CREDENTIALS_ERROR')
  assert.match(error.message, /只读门禁|凭据/)
  assert.equal(state.calls, 0)
})

// ---------------------------------------------------------------------------
// 8. Credentials file permissions warning
// ---------------------------------------------------------------------------

test('a group/other-readable credentials file yields the chmod warning in render text only', async (t) => {
  const file = makeCredentialsFile(
    t,
    { default: { username: 'admin', password: PASSWORD } },
    { mode: 0o644 },
  )
  const client = createFakeClient({ outputs: { '/system identity print': 'name: lab' } })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const value = await tool.execute(baseArgs(file, { commands: ['/system identity print'] }), {})
  const text = tool.output.render({}, value)[0].text

  assert.match(text, /\[warn\] credentials file is readable by group\/others; chmod 600/)
  assert.equal(text.split('\n').at(-1), '[warn] credentials file is readable by group/others; chmod 600')
  // The warning is rendering metadata, not part of the serialised tool value.
  assert.ok(!JSON.stringify(value).includes('readable by group/others'))
})

test('a 0600 credentials file does not emit the warning', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } }, { mode: 0o600 })
  const client = createFakeClient({ outputs: { '/system identity print': 'name: lab' } })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const value = await tool.execute(baseArgs(file, { commands: ['/system identity print'] }), {})
  const text = tool.output.render({}, value)[0].text
  assert.ok(!text.includes('readable by group/others'))
  assert.ok(!JSON.stringify(value).includes(PASSWORD))
})

// ---------------------------------------------------------------------------
// 9. Secret leakage scan: value, render text and error messages
// ---------------------------------------------------------------------------

test('the WinBox password never leaks into the value or the rendered text', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const client = createFakeClient({
    outputs: {
      '/system identity print': `name: lab\nbackup-password: ${PASSWORD}\n`,
    },
  })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const value = await tool.execute(baseArgs(file, { commands: ['/system identity print'] }), {})
  const rendered = tool.output.render({}, value)[0].text

  assert.ok(!JSON.stringify(value).includes(PASSWORD), 'value must not contain the password')
  assert.ok(!rendered.includes(PASSWORD), 'render text must not contain the password')
  assert.match(value.commands[0].output, /<redacted>/)
})

test('a password echoed by a client error is redacted before being thrown', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const client = createFakeClient({
    authenticate: () => {
      throw codedError(`authentication failed for password ${PASSWORD}`, 'AUTH_FAILED')
    },
  })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const error = await captureError(tool.execute(baseArgs(file), {}))
  assert.equal(error.code, 'AUTH_FAILED')
  assert.match(error.message, /authentication failed/)
  assert.match(error.message, /<redacted>/)
  assert.ok(!error.message.includes(PASSWORD))
  assert.ok(!String(error).includes(PASSWORD))
  assert.ok(!JSON.stringify(error).includes(PASSWORD))
})

// ---------------------------------------------------------------------------
// 10. Error mapping and cleanup
// ---------------------------------------------------------------------------

test('client failures map to WinboxError codes and close() still runs', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })

  const connectClient = createFakeClient({
    connect: () => {
      throw codedError('connection refused', 'CONNECT_FAILED')
    },
  })
  const connectFactory = createFactory(connectClient)
  const tool = createWinboxTool({ clientFactory: connectFactory.factory })
  const connectError = await captureError(tool.execute(baseArgs(file), {}))
  assert.equal(connectError.code, 'CONNECT_FAILED')
  assert.equal(connectClient.calls.close, 1)

  const authClient = createFakeClient({
    authenticate: () => {
      throw new Error('bad credentials')
    },
  })
  const authFactory = createFactory(authClient)
  const authTool = createWinboxTool({ clientFactory: authFactory.factory })
  const authError = await captureError(authTool.execute(baseArgs(file), {}))
  assert.equal(authError.code, 'AUTH_FAILED')
  assert.equal(authClient.calls.close, 1)

  const legacyClient = createFakeClient({
    authenticate: () => {
      throw codedError('legacy auth requested', 'LEGACY_AUTH_UNSUPPORTED')
    },
  })
  const legacyTool = createWinboxTool({ clientFactory: createFactory(legacyClient).factory })
  const legacyError = await captureError(legacyTool.execute(baseArgs(file), {}))
  assert.equal(legacyError.code, 'LEGACY_AUTH_UNSUPPORTED')
})

test('a failing client factory is reported as CONNECT_FAILED without creating a client', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const tool = createWinboxTool({
    clientFactory: () => {
      throw codedError('socket exploded', 'CONNECT_FAILED')
    },
  })
  const error = await captureError(tool.execute(baseArgs(file), {}))
  assert.equal(error.code, 'CONNECT_FAILED')
  assert.match(error.message, /socket exploded/)
})

test('a client object missing the required methods is rejected as UNSUPPORTED', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const tool = createWinboxTool({ clientFactory: () => ({ connect: async () => {} }) })
  const error = await captureError(tool.execute(baseArgs(file), {}))
  assert.equal(error.code, 'UNSUPPORTED')
  assert.match(error.message, /connect/)
})

// ---------------------------------------------------------------------------
// 11. Single-command timeout does not abort the remaining commands
// ---------------------------------------------------------------------------

test('a TIMEOUT on one command keeps the session and the following commands alive', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const client = createFakeClient({
    runCommand: (command, { onOutput }) => {
      if (command === '/system resource print') {
        onOutput('uptime: 1d')
        throw codedError('idle timeout', 'TIMEOUT')
      }
      return 'ether1'
    },
  })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const value = await tool.execute(
    baseArgs(file, { commands: ['/system resource print', '/interface print'] }),
    {},
  )

  assert.equal(value.commands.length, 2)
  assert.deepEqual(value.commands[0], {
    command: '/system resource print',
    ok: false,
    output: 'uptime: 1d',
    error: 'TIMEOUT',
  })
  assert.deepEqual(value.commands[1], {
    command: '/interface print',
    ok: true,
    output: 'ether1',
  })
  assert.equal(client.calls.runCommand.length, 2)
  assert.equal(client.calls.close, 1)
})

// ---------------------------------------------------------------------------
// 12. allowWrite bypasses the gate
// ---------------------------------------------------------------------------

test('allowWrite=true lets mutating commands through (and they still run)', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const client = createFakeClient({ outputs: { '/ip service disable telnet': '' } })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const value = await tool.execute(
    baseArgs(file, { commands: ['/ip service disable telnet'], allowWrite: true }),
    {},
  )

  assert.equal(value.commands[0].ok, true)
  assert.deepEqual(client.calls.runCommand.map((call) => call.command), ['/ip service disable telnet'])
})

test('allowWrite=false (default) blocks the same mutating command', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const client = createFakeClient()
  const { factory, state } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const error = await captureError(tool.execute(baseArgs(file, { commands: ['/ip service disable telnet'] }), {}))
  assert.equal(error.code, 'READ_ONLY_BLOCKED')
  assert.equal(state.calls, 0)
  assert.equal(client.calls.runCommand.length, 0)
})

// ---------------------------------------------------------------------------
// 13. Output truncation
// ---------------------------------------------------------------------------

test('long output is cut to maxOutputChars and flagged with truncated', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const client = createFakeClient({ outputs: { '/interface print': 'abcdefghij' } })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })

  const value = await tool.execute(baseArgs(file, { commands: ['/interface print'], maxOutputChars: 5 }), {})
  assert.equal(value.commands[0].output, 'abcde')
  assert.equal(value.truncated, true)

  const text = tool.output.render({}, value)[0].text
  assert.equal(text.split('\n').at(-1), '[truncated]')
})

test('the combined output is capped at 200000 characters', async (t) => {
  const file = makeCredentialsFile(t, { default: { username: 'admin', password: PASSWORD } })
  const chunk = 'x'.repeat(10_000)
  const client = createFakeClient({ runCommand: () => chunk })
  const { factory } = createFactory(client)
  const tool = createWinboxTool({ clientFactory: factory })
  const commands = Array.from({ length: 30 }, () => '/interface print')

  const value = await tool.execute(baseArgs(file, { commands }), {})
  const total = value.commands.reduce((sum, item) => sum + item.output.length, 0)
  assert.equal(total, 200_000)
  assert.equal(value.truncated, true)
  assert.equal(value.commands.length, 30)
})

// ---------------------------------------------------------------------------
// 14. Packaging / dependency hygiene
// ---------------------------------------------------------------------------

test('lib/mikrotik-tool.mjs has no @deepseek-ai import (raw ToolDefinition only)', () => {
  const source = readFileSync(new URL('../lib/mikrotik-tool.mjs', import.meta.url), 'utf8')
  assert.ok(!/from\s+['"]@deepseek-ai\//.test(source))
  assert.ok(!/import\s+['"]@deepseek-ai\//.test(source))
  assert.ok(!/require\(\s*['"]@deepseek-ai\//.test(source))
})
