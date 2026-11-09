/**
 * `mt_winbox_exec` — raw DSH ToolDefinition for running RouterOS CLI commands
 * over the MikroTik WinBox terminal protocol.
 *
 * This module is the *tool layer* only. The wire protocol lives in
 * `./winbox/client.mjs` (`createClient` / `WinboxError` / `runSession`); it is
 * loaded lazily and injected through `createWinboxTool({ clientFactory })` so
 * the unit tests never touch a network or a real device.
 *
 * Safety contract (see findings/winbox-tool-spec.md §1–§3):
 * - read-only by default: every command is checked against an allowlist before
 *   a client is even created; `allowWrite: true` disables that gate;
 * - the password never appears in the tool value, rendered text, error
 *   messages or logs — command output and errors are redacted with it;
 * - credentials come from a user-provided JSON file (never from stdout), and
 *   the error messages only mention the path and the expected keys.
 *
 * This file imports Node builtins only: third-party DSH plugins cannot resolve
 * `@deepseek-ai/*` from their own directory, so DSH APIs are injected by the
 * host through `ctx` (see index.js) rather than imported here.
 *
 * @module dsh-network-engineer/lib/mikrotik-tool
 */

import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Model-facing tool name. */
export const WINBOX_TOOL_NAME = 'mt_winbox_exec'

/** WinBox listens on TCP/8291 by default. */
export const DEFAULT_WINBOX_PORT = 8291

/** Framework-level timeout for one tool call (spec §1). */
export const TOOL_TIMEOUT_MS = 120_000

/** Hard ceiling for the combined stdout kept in one value. */
const TOTAL_OUTPUT_LIMIT = 200_000

/** Default single-command output ceiling. */
const DEFAULT_MAX_OUTPUT_CHARS = 60_000

/** Symbol carrying the (non-serialised) credentials-file warning into render(). */
const WARNING = Symbol('dsh.winbox.warning')

/** Codes `WinboxError` is allowed to carry (spec §4). */
const WINBOX_ERROR_CODES = new Set([
  'CONNECT_FAILED',
  'AUTH_FAILED',
  'LEGACY_AUTH_UNSUPPORTED',
  'PROTOCOL_ERROR',
  'TIMEOUT',
  'CLOSED',
  'READ_ONLY_BLOCKED',
  'CREDENTIALS_ERROR',
  'UNSUPPORTED',
])

/** Default credentials file when neither the option nor the env var is set. */
const DEFAULT_CREDENTIALS_FILE = () => join(homedir(), '.dsh', 'secrets', 'winbox.json')

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Local stand-in for `WinboxError`. It is also the fallback when
 * `./winbox/client.mjs` is absent (unit tests of this layer must not depend on
 * the protocol module being on disk).
 */
class ToolWinboxError extends Error {
  /**
   * @param {string} code one of {@link WINBOX_ERROR_CODES}.
   * @param {string} message already redacted message.
   * @param {unknown} [details] optional structured details (never a password).
   */
  constructor(code, message, details) {
    super(message)
    this.name = 'WinboxError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

/** Cached prototype of the protocol layer's `WinboxError` (or the local one). */
let cachedErrorPrototype = null

/**
 * Resolve the prototype of the protocol layer's `WinboxError` once.
 * When `lib/winbox/client.mjs` does not exist yet (parallel implementation),
 * the local stand-in is used; the tool keeps working and integration later
 * yields `instanceof WinboxError` as expected.
 * @returns {Promise<object>} prototype object to attach to thrown errors.
 */
async function resolveErrorPrototype() {
  if (cachedErrorPrototype !== null) return cachedErrorPrototype
  try {
    const mod = await import('./winbox/client.mjs')
    const Ctor = mod?.WinboxError
    if (typeof Ctor === 'function' && Ctor.prototype instanceof Error) {
      cachedErrorPrototype = Ctor.prototype
      return cachedErrorPrototype
    }
  } catch {
    // Protocol module not available (yet): fall back to the local class.
  }
  cachedErrorPrototype = ToolWinboxError.prototype
  return cachedErrorPrototype
}

/**
 * Build a redacted `WinboxError`-shaped error. The message must already be
 * safe (no password); callers redact before calling.
 * @param {string} code error code.
 * @param {string} message safe, user-facing message.
 * @param {unknown} [details] optional details.
 * @returns {Promise<Error>} error to throw.
 */
async function makeWinboxError(code, message, details) {
  const error = new ToolWinboxError(code, message, details)
  const proto = await resolveErrorPrototype()
  if (proto !== ToolWinboxError.prototype) Object.setPrototypeOf(error, proto)
  // Re-assert own fields in case the protocol prototype defines accessors.
  error.name = 'WinboxError'
  error.code = code
  if (details !== undefined) error.details = details
  return error
}

/**
 * Map an arbitrary client failure onto a redacted `WinboxError`.
 * @param {unknown} error thrown by the client.
 * @param {string[]} secrets strings that must never leak.
 * @param {string} stage `create|connect|auth|terminal|command`.
 * @returns {Promise<Error>} redacted error.
 */
async function wrapClientFailure(error, secrets, stage) {
  const rawCode = typeof error?.code === 'string' ? error.code : undefined
  const code = rawCode !== undefined && WINBOX_ERROR_CODES.has(rawCode) ? rawCode : defaultCodeForStage(stage)
  const rawMessage = typeof error?.message === 'string' && error.message !== '' ? error.message : String(error ?? 'unknown WinBox failure')
  const message = redactSecrets(rawMessage, secrets)
  return makeWinboxError(code, message)
}

/**
 * Stage-specific fallback error code.
 * @param {string} stage session stage.
 * @returns {string} code.
 */
function defaultCodeForStage(stage) {
  if (stage === 'create' || stage === 'connect') return 'CONNECT_FAILED'
  if (stage === 'auth') return 'AUTH_FAILED'
  return 'PROTOCOL_ERROR'
}

// ---------------------------------------------------------------------------
// Secret handling
// ---------------------------------------------------------------------------

/**
 * Replace every occurrence of a secret with `<redacted>`.
 * All secrets are replaced in one pass, so a short secret cannot corrupt the
 * placeholder produced for a longer one (e.g. secrets `a` and `longsecret`).
 * @param {unknown} text text to sanitise.
 * @param {string|string[]} secrets secret(s) to remove.
 * @returns {string} sanitised text.
 */
export function redactSecrets(text, secrets) {
  const output = typeof text === 'string' ? text : String(text ?? '')
  const list = (Array.isArray(secrets) ? secrets : [secrets])
    .filter((secret) => typeof secret === 'string' && secret.length > 0)
    .sort((a, b) => b.length - a.length)
  if (list.length === 0) return output
  const pattern = new RegExp(list.map(escapeRegExp).join('|'), 'g')
  return output.replace(pattern, '<redacted>')
}

/**
 * Escape a literal string for {@link RegExp}.
 * @param {string} text literal text.
 * @returns {string} regex source.
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

/**
 * Expand a leading `~` in a user-supplied path.
 * @param {string} path input path.
 * @returns {string} absolute path.
 */
function expandHome(path) {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Resolve the credentials-file path: explicit option > env var > default.
 * @param {string|undefined} credentialsFile explicit path.
 * @param {Record<string, string|undefined>} env environment source.
 * @returns {string} path to read.
 */
function resolveCredentialsPath(credentialsFile, env) {
  if (typeof credentialsFile === 'string' && credentialsFile.trim() !== '') return expandHome(credentialsFile.trim())
  const fromEnv = env?.DSH_WINBOX_CREDENTIALS
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return expandHome(fromEnv.trim())
  return DEFAULT_CREDENTIALS_FILE()
}

/** @param {object} object candidate. @param {string} key property name. @returns {boolean} own property present. */
function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

/** @param {unknown} value candidate number. @param {number} fallback default. @param {number} min lower bound. @param {number} max upper bound. @returns {number} clamped integer. */
function clampInt(value, fallback, min, max) {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.min(max, Math.max(min, number))
}

/**
 * Resolve WinBox credentials from the user-provided JSON file.
 *
 * Lookup order: `credentialKey` (when given, it must exist) >
 * `` `${host}:${port}` `` > `host` > `default`. A username stored in the file
 * wins over the `username` argument (which is only a display/lookup override).
 * Errors are `CREDENTIALS_ERROR` and mention only the path and expected keys,
 * never the file contents.
 *
 * @param {object} [options] lookup options.
 * @param {string} options.host device address.
 * @param {number} [options.port] WinBox port.
 * @param {string} [options.username] fallback login user.
 * @param {string} [options.credentialsFile] explicit JSON file path.
 * @param {string} [options.credentialKey] explicit key inside the JSON file.
 * @param {Record<string, string|undefined>} [options.env] environment source.
 * @returns {Promise<{username: string, password: string, key: string, source: string, warn?: string}>} credentials.
 */
export async function resolveCredentials({
  host,
  port = DEFAULT_WINBOX_PORT,
  username,
  credentialsFile,
  credentialKey,
  env = process.env,
} = {}) {
  const filePath = resolveCredentialsPath(credentialsFile, env)
  const hostText = typeof host === 'string' ? host.trim() : ''
  const portNumber = clampInt(port, DEFAULT_WINBOX_PORT, 1, 65_535)
  const wantExplicitKey = typeof credentialKey === 'string' && credentialKey.trim() !== ''
  const expectedKeys = wantExplicitKey
    ? [credentialKey.trim()]
    : [`${hostText}:${portNumber}`, hostText, 'default']
  const expectedText = expectedKeys.filter((key) => key !== '').map((key) => `"${key}"`).join(' / ')

  let text
  try {
    text = await readFile(filePath, 'utf8')
  } catch (error) {
    const reason = error?.code === 'ENOENT' ? '不存在' : `无法读取（${error?.code ?? 'READ_ERROR'}）`
    throw await makeWinboxError(
      'CREDENTIALS_ERROR',
      `WinBox 凭据文件${reason}: ${filePath}；期望键: ${expectedText || '（未提供 host）'}。可用 credentialsFile 参数或 DSH_WINBOX_CREDENTIALS 指定路径。`,
    )
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw await makeWinboxError(
      'CREDENTIALS_ERROR',
      `WinBox 凭据文件不是合法 JSON: ${filePath}；期望键: ${expectedText || 'default'}（不回显文件内容）。`,
    )
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw await makeWinboxError(
      'CREDENTIALS_ERROR',
      `WinBox 凭据文件顶层必须是 JSON 对象: ${filePath}；期望键: ${expectedText || 'default'}（不回显文件内容）。`,
    )
  }

  let key
  let entry
  if (wantExplicitKey) {
    key = credentialKey.trim()
    if (!hasOwn(data, key)) {
      throw await makeWinboxError(
        'CREDENTIALS_ERROR',
        `WinBox 凭据文件 ${filePath} 中不存在 credentialKey "${key}"；可用键需与 credentialKey 完全一致（不回显文件内容）。`,
      )
    }
    entry = data[key]
  } else {
    const candidates = [`${hostText}:${portNumber}`, hostText, 'default']
    for (const candidate of candidates) {
      if (candidate !== '' && hasOwn(data, candidate)) {
        key = candidate
        entry = data[candidate]
        break
      }
    }
    if (key === undefined) {
      throw await makeWinboxError(
        'CREDENTIALS_ERROR',
        `WinBox 凭据文件 ${filePath} 中没有匹配条目；期望键: ${expectedText || 'default'}（不回显文件内容）。`,
      )
    }
  }

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw await makeWinboxError(
      'CREDENTIALS_ERROR',
      `WinBox 凭据条目 "${key}" 必须是包含 username/password 的对象（${filePath}）。`,
    )
  }
  if (typeof entry.password !== 'string' || entry.password.length === 0) {
    throw await makeWinboxError(
      'CREDENTIALS_ERROR',
      `WinBox 凭据条目 "${key}" 缺少非空字符串 password（${filePath}）。`,
    )
  }

  const entryUsername = typeof entry.username === 'string' && entry.username.trim() !== '' ? entry.username : undefined
  const fallbackUsername = typeof username === 'string' && username.trim() !== '' ? username.trim() : 'admin'
  const finalUsername = entryUsername ?? fallbackUsername

  let warn
  try {
    const info = await stat(filePath)
    if ((info.mode & 0o044) !== 0) warn = '[warn] credentials file is readable by group/others; chmod 600'
  } catch {
    // Stat is best-effort: never fail a session because the warning could not be computed.
  }

  const credentials = { username: finalUsername, password: entry.password, key, source: filePath }
  if (warn !== undefined) credentials.warn = warn
  return credentials
}

// ---------------------------------------------------------------------------
// Read-only gate
// ---------------------------------------------------------------------------

/** Characters that would let one parameter smuggle extra commands. */
const INJECTION_RE = /[\r\n;]/

/** Verbs that mutate RouterOS state; a match rejects the command. */
const DANGEROUS_VERBS = [
  'set',
  'add',
  'remove',
  'disable',
  'enable',
  'reset',
  'reboot',
  'shutdown',
  'import',
  'restore',
  'format',
  'clear',
  'uninstall',
  'downgrade',
  'upgrade',
  'rename',
  'move',
  'copy',
  'make',
  'delete',
  'install',
  'insert',
  'run',
  'start',
  'stop',
  'load',
  'save',
  'fetch',
  'erase',
  'unset',
  'execute',
  'flush',
  'sign',
  'purge',
  'edit',
]

/** Whole-word match of a mutating verb (RouterOS CLI keywords are case-insensitive). */
const DANGEROUS_VERB_RE = new RegExp(`\\b(${DANGEROUS_VERBS.join('|')})\\b`, 'i')

/** `/export` options that leave pure read-only land (spec §3). */
const UNSAFE_EXPORT_RE = /\b(file|show-sensitive)\b/i

/**
 * Read-only allowlist from spec §3 (prefix-matched, after the deny rules).
 * `/interface`, `/ip`, `/routing`, `/queue`, ... are allowed wholesale because
 * any mutating sub-command inside them is caught by {@link DANGEROUS_VERB_RE}.
 */
const READ_ONLY_PATTERNS = [
  /^\/export\b/i,
  /^\/print\b/,
  /^\/ping\b/,
  /^\/traceroute\b/,
  /^\/log\b/,
  /^\/system (resource|identity|health|routerboard|clock|license|package)\b/,
  /^\/interface\b/,
  /^\/ip\b/,
  /^\/ipv6\b/,
  /^\/routing\b/,
  /^\/mpls\b/,
  /^\/queue\b/,
  /^\/tool (ping|traceroute|torch|sniffer|profile|bandwidth-test)\b/,
  /^\/file print\b/,
  /^\/user print\b/,
  /^\/snmp print\b/,
  /^\/certificate print\b/,
  /^\/ppp (active|secret) print\b/,
  /^\/caps-man\b.*print/,
  /^\/interface wireless\b.*(print|scan|monitor)/,
  /^\/container print\b/,
]

/**
 * Read-only `print` family: a path command whose command word is `print`
 * (arguments after `print` are allowed). Anchoring on the command word stops
 * values such as `/system backup save name=print` or `/system script run print`
 * from slipping through, because those verbs are denied before this helper runs.
 * @param {string} text trimmed command.
 * @returns {boolean} whether it is a plain `... print ...` command.
 */
function isPrintCommand(text) {
  const tokens = text.split(/\s+/)
  if (tokens.length === 0 || !tokens[0].startsWith('/')) return false
  const printIndex = tokens.findIndex((token) => token.toLowerCase() === 'print')
  if (printIndex < 1) return false
  // Everything before the `print` word must be a RouterOS menu path.
  return tokens
    .slice(0, printIndex)
    .every((token) => /^\/?[A-Za-z0-9_.-]+$/.test(token))
}

/**
 * Check one command against the read-only gate.
 * @param {string} command single-line RouterOS CLI command.
 * @returns {{ok: true} | {ok: false, reason: string}} verdict.
 */
export function checkReadOnly(command) {
  if (typeof command !== 'string') return { ok: false, reason: '命令不是字符串' }
  if (INJECTION_RE.test(command)) {
    return { ok: false, reason: "命令包含换行或 ';'（疑似多命令注入，禁止）" }
  }
  const text = command.trim()
  if (text === '') return { ok: false, reason: '空命令' }
  const lower = text.toLowerCase()

  if (/^\/export\b/.test(lower) && UNSAFE_EXPORT_RE.test(lower)) {
    return { ok: false, reason: "'/export' 带 file= 或 show-sensitive 选项不在只读允许范围（只读模式放行 /export 与 /export hide-sensitive）" }
  }
  // `file=` on a read command (`/ip address print file=...`) still writes device storage.
  if (/\bfile\s*=/i.test(lower)) {
    return { ok: false, reason: "命令带 file= 选项（会写设备存储），只读模式禁止" }
  }
  const verb = text.match(DANGEROUS_VERB_RE)
  if (verb !== null) return { ok: false, reason: `命中写操作动词 "${verb[1]}"` }

  if (!READ_ONLY_PATTERNS.some((pattern) => pattern.test(text)) && !isPrintCommand(text)) {
    return { ok: false, reason: '不在只读允许清单内' }
  }
  return { ok: true }
}

/**
 * Build the READ_ONLY_BLOCKED message listing rejected commands.
 * @param {Array<{index: number, command: string, reason: string}>} rejected rejected rows.
 * @returns {string} error message.
 */
function buildGateMessage(rejected) {
  const lines = rejected.map(({ index, command, reason }) => `  ${index}) ${command} —— ${reason}`)
  return [
    `只读门禁拒绝 ${rejected.length} 条命令（allowWrite=false，未连接设备）：`,
    ...lines,
    '确认风险后显式传 allowWrite=true；改配置前先执行 /export 备份，并在维护窗口操作。',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/**
 * Normalise raw terminal output to a plain string with `\n` newlines.
 * @param {unknown} raw value returned by the client.
 * @param {string} partial output collected through `onOutput`.
 * @returns {string} text.
 */
function normalizeCommandOutput(raw, partial) {
  let text
  if (typeof raw === 'string') text = raw
  else if (raw !== null && typeof raw === 'object' && typeof raw.output === 'string') text = raw.output
  else if (raw !== null && typeof raw === 'object' && typeof raw.text === 'string') text = raw.text
  else text = partial
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * Apply the per-command and total output budgets.
 * @param {string} text output text.
 * @param {number} perCommandLimit single-command ceiling.
 * @param {number} budget remaining total budget.
 * @returns {{text: string, truncated: boolean}} capped text and whether it was cut.
 */
function consumeOutputBudget(text, perCommandLimit, budget) {
  const limit = Math.max(0, Math.min(perCommandLimit, budget))
  if (text.length <= limit) return { text, truncated: false }
  return { text: text.slice(0, limit), truncated: true }
}

/**
 * Render the tool value as plain text (spec §1 format).
 * @param {object} value tool value returned by `execute`.
 * @returns {string} rendered text.
 */
export function formatWinboxText(value) {
  if (value === null || typeof value !== 'object') return ''
  const lines = [
    `# WinBox ${value.host}:${value.port} user=${value.username} authenticated=${Boolean(value.authenticated)} ${value.durationMs}ms`,
  ]
  const commands = Array.isArray(value.commands) ? value.commands : []
  for (const item of commands) {
    const failed = item.ok === true ? '' : `  [FAILED: ${item.error ?? 'UNKNOWN'}]`
    lines.push(`## ${item.command}${failed}`)
    if (typeof item.output === 'string' && item.output.length > 0) lines.push(item.output.replace(/\n$/, ''))
  }
  if (value.truncated === true) lines.push('[truncated]')
  const warn = value[WARNING]
  if (typeof warn === 'string' && warn !== '') lines.push(warn)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// JSON Schema definitions (raw ToolDefinition, no @deepseek-ai/* imports)
// ---------------------------------------------------------------------------

const PARAMETERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['host', 'commands'],
  properties: {
    host: {
      type: 'string',
      minLength: 1,
      description: 'MikroTik device address (IPv4/IPv6 literal or DNS name).',
    },
    port: {
      type: 'number',
      minimum: 1,
      maximum: 65535,
      default: DEFAULT_WINBOX_PORT,
      description: 'WinBox TCP port (default 8291).',
    },
    username: {
      type: 'string',
      description: 'Login user override used for display/lookup; a username stored in the credentials file wins.',
    },
    commands: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: { type: 'string', minLength: 1, pattern: '^[^\\r\\n;]+$' },
      description: 'RouterOS CLI commands, one per entry (single line; no ";" or newlines).',
    },
    allowWrite: {
      type: 'boolean',
      default: false,
      description: 'Must be true to run mutating commands. Run /export first and use a maintenance window.',
    },
    credentialsFile: {
      type: 'string',
      description: 'Path to the JSON credentials file (default: DSH_WINBOX_CREDENTIALS or ~/.dsh/secrets/winbox.json).',
    },
    credentialKey: {
      type: 'string',
      description: 'Explicit key inside the JSON credentials file (overrides host:port / host / default lookup).',
    },
    commandTimeoutMs: {
      type: 'number',
      minimum: 500,
      maximum: 120000,
      default: 5000,
      description: 'Per-command idle timeout while waiting for the next prompt (ms).',
    },
    timeoutMs: {
      type: 'number',
      minimum: 1000,
      maximum: 300000,
      default: 60000,
      description: 'Whole-session timeout (ms).',
    },
    maxOutputChars: {
      type: 'number',
      minimum: 1,
      maximum: TOTAL_OUTPUT_LIMIT,
      default: DEFAULT_MAX_OUTPUT_CHARS,
      description: 'Per-command output ceiling; overall value is capped at 200000 chars.',
    },
  },
}

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['host', 'port', 'username', 'authenticated', 'durationMs', 'commands'],
  properties: {
    host: { type: 'string' },
    port: { type: 'number' },
    username: { type: 'string' },
    authenticated: { type: 'boolean' },
    durationMs: { type: 'number' },
    commands: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'ok', 'output'],
        properties: {
          command: { type: 'string' },
          ok: { type: 'boolean' },
          output: { type: 'string' },
          error: { type: 'string' },
        },
      },
    },
    truncated: { type: 'boolean' },
  },
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Default client factory: lazily load the protocol layer that task-27 ships.
 * @param {object} options client options.
 * @returns {Promise<object>} client instance.
 */
async function defaultClientFactory(options) {
  let mod
  try {
    mod = await import('./winbox/client.mjs')
  } catch (error) {
    throw await makeWinboxError(
      'UNSUPPORTED',
      `WinBox 协议模块不可用（lib/winbox/client.mjs）：${redactSecrets(error?.message ?? error, [])}`,
    )
  }
  if (typeof mod?.createClient !== 'function') {
    throw await makeWinboxError('UNSUPPORTED', 'lib/winbox/client.mjs 未导出 createClient()，请检查插件安装是否完整。')
  }
  return mod.createClient(options)
}

/**
 * Validate the `commands` argument shape (1–30 non-empty single-line strings).
 * @param {unknown} commands raw argument.
 * @returns {string[]} normalised commands.
 */
function normalizeCommands(commands) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('WINBOX_COMMANDS_INVALID: commands 必须是非空数组（1–30 条 RouterOS 单行命令）')
  }
  if (commands.length > 30) {
    throw new Error(`WINBOX_COMMANDS_INVALID: commands 最多 30 条，当前 ${commands.length} 条`)
  }
  return commands.map((command, index) => {
    if (typeof command !== 'string') {
      throw new Error(`WINBOX_COMMANDS_INVALID: commands[${index}] 必须是字符串`)
    }
    if (INJECTION_RE.test(command)) {
      throw new Error(`WINBOX_COMMANDS_INVALID: commands[${index}] 含换行或 ";"，一次调用只允许单行命令`)
    }
    const trimmed = command.trim()
    if (trimmed === '') throw new Error(`WINBOX_COMMANDS_INVALID: commands[${index}] 是空命令`)
    return trimmed
  })
}

/**
 * Run the session for one tool call.
 * @param {object} args tool arguments.
 * @param {((options: object) => object|Promise<object>)|undefined} clientFactory injected client factory.
 * @returns {Promise<object>} output value matching {@link OUTPUT_SCHEMA}.
 */
async function executeWinbox(args, clientFactory) {
  const startedAt = Date.now()
  if (args === null || typeof args !== 'object') {
    throw await makeWinboxError('UNSUPPORTED', 'mt_winbox_exec 需要对象参数（host、commands 必填）。')
  }

  const host = typeof args.host === 'string' ? args.host.trim() : ''
  if (host === '') throw await makeWinboxError('UNSUPPORTED', 'mt_winbox_exec 参数 host 必填（设备 IP 或 DNS 名）。')

  let commands
  try {
    commands = normalizeCommands(args.commands)
  } catch (error) {
    throw await makeWinboxError('UNSUPPORTED', String(error?.message ?? error).replace(/^WINBOX_COMMANDS_INVALID: /, ''))
  }

  const port = clampInt(args.port, DEFAULT_WINBOX_PORT, 1, 65_535)
  const commandTimeoutMs = clampInt(args.commandTimeoutMs, 5000, 500, 120_000)
  const timeoutMs = clampInt(args.timeoutMs, 60_000, 1000, 300_000)
  const maxOutputChars = clampInt(args.maxOutputChars, DEFAULT_MAX_OUTPUT_CHARS, 1, TOTAL_OUTPUT_LIMIT)

  // Read-only gate: preflight every command before any credentials/client work.
  if (args.allowWrite !== true) {
    const rejected = []
    commands.forEach((command, index) => {
      const verdict = checkReadOnly(command)
      if (verdict.ok !== true) rejected.push({ index: index + 1, command, reason: verdict.reason })
    })
    if (rejected.length > 0) throw await makeWinboxError('READ_ONLY_BLOCKED', buildGateMessage(rejected))
  }

  const credentials = await resolveCredentials({
    host,
    port,
    username: args.username,
    credentialsFile: args.credentialsFile,
    credentialKey: args.credentialKey,
  })
  const secrets = [credentials.password]

  const factory = typeof clientFactory === 'function' ? clientFactory : defaultClientFactory
  const deadline = startedAt + timeoutMs
  const results = []
  let truncated = false
  let budget = TOTAL_OUTPUT_LIMIT
  let authenticated = false
  let client = null
  let stage = 'create'

  try {
    client = await factory({ host, port, connectTimeoutMs: Math.min(10_000, timeoutMs) })
    if (client === null || typeof client !== 'object') {
      throw await makeWinboxError('UNSUPPORTED', 'WinBox client 工厂没有返回 client 对象。')
    }
    if (typeof client.connect !== 'function' || typeof client.authenticate !== 'function' || typeof client.runCommand !== 'function') {
      throw await makeWinboxError(
        'UNSUPPORTED',
        'WinBox client 对象缺少 connect()/authenticate()/openTerminal()/runCommand() 接口，无法继续。',
      )
    }

    stage = 'connect'
    await client.connect()

    stage = 'auth'
    await client.authenticate({ username: credentials.username, password: credentials.password })
    authenticated = true

    stage = 'terminal'
    if (typeof client.openTerminal === 'function') await client.openTerminal({ cols: 200, rows: 1000 })

    /**
     * Cap + redact one command's output: the WinBox password must never reach
     * the value or the rendered text, even if the device echoes it (e.g. a
     * careless `/export`).
     * @param {string} text normalised output.
     * @returns {{text: string, truncated: boolean}} capped, redacted text.
     */
    const finalizeOutput = (text) => {
      const capped = consumeOutputBudget(text, maxOutputChars, budget)
      budget -= capped.text.length
      truncated = truncated || capped.truncated
      return { text: redactSecrets(capped.text, secrets), truncated: capped.truncated }
    }

    stage = 'command'
    for (const command of commands) {
      const redactedCommand = redactSecrets(command, secrets)
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        results.push({ command: redactedCommand, ok: false, output: '', error: 'TIMEOUT' })
        continue
      }
      const idleTimeoutMs = Math.max(500, Math.min(commandTimeoutMs, remainingMs))
      let partial = ''
      try {
        const raw = await client.runCommand(command, {
          idleTimeoutMs,
          onOutput: (chunk) => {
            if (chunk !== undefined && chunk !== null) partial += String(chunk)
          },
        })
        const capped = finalizeOutput(normalizeCommandOutput(raw, partial))
        results.push({ command: redactedCommand, ok: true, output: capped.text })
      } catch (error) {
        if (typeof error?.code === 'string' && error.code === 'TIMEOUT') {
          const rawPartial = error?.output ?? error?.partial ?? partial
          const capped = finalizeOutput(normalizeCommandOutput(rawPartial, partial))
          results.push({ command: redactedCommand, ok: false, output: capped.text, error: 'TIMEOUT' })
          continue
        }
        throw error
      }
    }
  } catch (error) {
    throw await wrapClientFailure(error, secrets, stage)
  } finally {
    if (client !== null && typeof client?.close === 'function') {
      try {
        await client.close()
      } catch {
        // close() is documented idempotent; never mask the original failure.
      }
    }
  }

  const value = {
    host,
    port,
    username: credentials.username,
    authenticated,
    durationMs: Math.max(0, Date.now() - startedAt),
    commands: results,
  }
  if (truncated) value.truncated = true
  if (typeof credentials.warn === 'string') {
    Object.defineProperty(value, WARNING, { value: credentials.warn, enumerable: false })
  }
  return value
}

/**
 * Create the raw `mt_winbox_exec` ToolDefinition.
 * @param {object} [options] factory options.
 * @param {(options: object) => object|Promise<object>} [options.clientFactory] protocol client factory injection point for tests.
 * @returns {object} raw DSH ToolDefinition.
 */
export function createWinboxTool({ clientFactory } = {}) {
  return {
    name: WINBOX_TOOL_NAME,
    description:
      'Run RouterOS CLI commands on a MikroTik device over WinBox (default port 8291), for cases where SSH/API are unreachable. Read-only by default: mutating commands are blocked unless allowWrite=true (run /export first and use a maintenance window). Requires RouterOS >= 6.43 (EC-SRP5; legacy auth unsupported). Credentials come from a JSON file (credentialsFile, DSH_WINBOX_CREDENTIALS, or ~/.dsh/secrets/winbox.json).',
    parameters: PARAMETERS_SCHEMA,
    timeoutMs: TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => false,
    output: {
      schema: OUTPUT_SCHEMA,
      /**
       * Render the value as a human/model readable text block (spec §1).
       * @param {object} _args tool arguments.
       * @param {object} value value returned by execute().
       * @returns {Array<{type: 'text', text: string}>} content blocks.
       */
      render: (_args, value) => [{ type: 'text', text: formatWinboxText(value) }],
    },
    /**
     * Execute the tool call.
     * @param {object} args tool arguments.
     * @param {object} [_exec] host execution context (unused).
     * @returns {Promise<object>} value matching the output schema.
     */
    execute: (args, _exec) => executeWinbox(args, clientFactory),
  }
}
