/**
 * 网络工程师助手（network-command-kb）for DeepSeek Harness.
 *
 * Registers two capabilities on the plugin context:
 *
 * 1. The bundled `network-command-kb` skill on `ctx.skills`. The skill
 *    instructs the agent to search the 96 command reference documents shipped
 *    in this package's `kb/` directory. The harness exposes the skill's
 *    resource base to the agent when the skill loads, so the knowledge base
 *    stays portable with the plugin and the `kb/...` paths in SKILL.md resolve
 *    against this package root.
 * 2. The global `mt_winbox_exec` tool on `ctx.tools`: an encrypted MikroTik
 *    WinBox terminal (port 8291, EC-SRP5 + M2 + AES-128-CBC) for devices that
 *    expose the CLI only through WinBox. Read-only commands are enforced by
 *    default; write commands require `allowWrite: true` and are documented as
 *    high-risk.
 * 3. The global `kb_lookup` tool on `ctx.tools`: read-only, section-level
 *    access to the same knowledge base (vendor → outline → one section).
 *
 * The companion "网络工程师助手" agent preset is declared in
 * `cordis.patch.yml` as a `@deepseek-ai/dsh-agent-preset` row and needs no
 * code here.
 *
 * The plugin statically imports nothing but Node builtins and its own modules,
 * so the unit tests run under a bare `node --test` and every registry is
 * reached through `ctx` alone. Verified against DSH 0.2.2-rc.3: a linked
 * bundle that declares `@deepseek-ai/*` under `peerDependencies` can import
 * the host's copy (see docs/user/develop/basic/publish.md), so the only host
 * package used — `@deepseek-ai/schemastery`, for the {@link Config} schema —
 * is an optional peer imported dynamically below.
 *
 * @module dsh-network-engineer
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createWinboxTool } from './lib/mikrotik-tool.mjs'
import { createKbLookupTool, KB_LOOKUP_TOOL_NAME } from './lib/kb-lookup.mjs'

/** Deployment-level defaults; `cordis.yml` rows override them per field. */
export const DEFAULT_CONFIG = Object.freeze({
  skill: Object.freeze({ enabled: true }),
  kbLookup: Object.freeze({ enabled: true }),
  winbox: Object.freeze({ enabled: true, allowWrite: true }),
})

/**
 * The plugin `Config` schema (Schemastery), exported so Cordis validates and
 * defaults the row's `config` while the plugin loads. Left `undefined` when the
 * host's Schemastery cannot be imported (bare Node, unit tests): Cordis then
 * passes the raw config through and {@link resolveConfig} fills the defaults.
 */
export let Config
try {
  const { default: Schema } = await import('@deepseek-ai/schemastery')
  Config = Schema.object({
    skill: Schema.object({
      enabled: Schema.boolean().default(true).description('Register the network-command-kb skill.'),
    }),
    kbLookup: Schema.object({
      enabled: Schema.boolean().default(true).description('Register the read-only kb_lookup tool.'),
    }),
    winbox: Schema.object({
      enabled: Schema.boolean().default(true).description('Register the mt_winbox_exec WinBox terminal tool.'),
      allowWrite: Schema.boolean()
        .default(true)
        .description('Deployment gate: when false, mt_winbox_exec stays read-only even if a call passes allowWrite=true.'),
    }),
  })
} catch {
  Config = undefined
}

/**
 * Merge a (possibly partial or absent) raw config over {@link DEFAULT_CONFIG}.
 * @param config - the row's `config` value as handed to `apply`.
 * @returns the complete, normalised configuration.
 */
export function resolveConfig(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const section = (key) => ({ ...DEFAULT_CONFIG[key], ...(raw[key] !== null && typeof raw[key] === 'object' ? raw[key] : {}) })
  return { skill: section('skill'), kbLookup: section('kbLookup'), winbox: section('winbox') }
}

/** Cordis plugin name used by loader diagnostics. */
export const name = 'network-engineer-kb'

/** The registries this plugin registers into. */
export const inject = ['skills', 'tools']

/** Stable tool name referenced by docs and tests. */
export const WINBOX_TOOL_NAME = 'mt_winbox_exec'

const packageRoot = dirname(fileURLToPath(import.meta.url))

/**
 * The skill/knowledge-base roots of the packaged plugin.
 * @returns the absolute paths {@link registerBundledSkill} reads.
 */
export function defaultRoots() {
  const skillDir = resolve(packageRoot, 'skills', 'network-command-kb')
  return {
    packageRoot,
    skillDir,
    skillFile: join(skillDir, 'SKILL.md'),
    kbDir: resolve(packageRoot, 'kb'),
  }
}

/**
 * Split a `SKILL.md` into its frontmatter block and body.
 * @param content - the raw file text.
 * @returns the frontmatter text (empty when absent) and the trimmed body.
 */
export function splitFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (match === null) return { frontmatter: '', body: content.trim() }
  return { frontmatter: match[1], body: match[2].trim() }
}

/**
 * Read one-line scalar frontmatter keys. The bundled SKILL.md deliberately
 * keeps `name` and `description` on single lines, so no block-scalar support is
 * needed here.
 * @param frontmatter - the frontmatter text without its `---` delimiters.
 * @returns the parsed string values by key.
 */
export function parseFields(frontmatter) {
  const fields = {}
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (match !== null && match[2] !== '') fields[match[1]] = match[2].trim()
  }
  return fields
}

/**
 * Register a bundled knowledge-base skill from explicit roots.
 *
 * This is the testable core of the plugin: `apply()` calls it with
 * {@link defaultRoots}, while tests call it with temporary fixture roots to
 * exercise the missing-file fallbacks.
 *
 * The resource base is the package root, not the skill directory. SKILL.md
 * refers to `kb/...` paths relative to the package; pointing `resourceBase` at
 * `skills/network-command-kb` was the upstream bug tracked as
 * sososilencing/dsh-network-engineer#3, and this fork fixes it.
 *
 * @param ctx - plugin context; the registration is disposed with it.
 * @param roots - absolute paths of the package, skill directory, SKILL.md and knowledge base.
 * @returns the registration result: `registered` plus the skill name, or `skipped` plus the reason.
 */
export function registerBundledSkill(ctx, roots = defaultRoots()) {
  let raw
  try {
    raw = readFileSync(roots.skillFile, 'utf8')
  } catch (error) {
    // A missing SKILL.md only disables the skill, so warn and keep the plugin
    // loadable; the preset row in cordis.patch.yml is unaffected.
    const reason = error instanceof Error ? error.message : String(error)
    ctx.logger.warn(`network-engineer: cannot read SKILL.md under ${roots.skillDir}: ${reason}`)
    return { status: 'skipped', reason: 'unreadable-skill-file' }
  }

  const { frontmatter, body } = splitFrontmatter(raw)
  const fields = frontmatter === '' ? {} : parseFields(frontmatter)
  if (fields.name === undefined || fields.description === undefined || body === '') {
    ctx.logger.warn('network-engineer: SKILL.md requires non-empty name, description and body; skill not registered')
    return { status: 'skipped', reason: 'invalid-skill-file' }
  }

  if (!existsSync(roots.kbDir)) {
    ctx.logger.warn(`network-engineer: knowledge base directory is missing at ${roots.kbDir}; the skill still loads but its documents are unavailable`)
  }

  const dispose = ctx.skills.register({
    name: fields.name,
    description: fields.description,
    content: body,
    source: 'bundled',
    path: roots.skillFile,
    resourceBase: { kind: 'directory', path: roots.packageRoot },
  })

  ctx.logger.info(`network-engineer: registered skill "${fields.name}" with knowledge base at ${roots.kbDir}`)
  return { status: 'registered', name: fields.name, dispose }
}

/**
 * Register one tool, failing loudly.
 *
 * `inject = ['tools']` guarantees the registry exists, so a missing registry,
 * a build failure or a registration error (for example a tool-name collision,
 * which the registry rejects on purpose) is a real fault. It is thrown so the
 * host marks the plugin as failed instead of leaving it half-loaded; the
 * effects registered earlier in `apply` are disposed with the plugin.
 *
 * @param ctx - plugin context.
 * @param label - the tool name used in diagnostics.
 * @param createTool - builds the raw ToolDefinition.
 * @param description - short capability note for the info log.
 * @returns `registered` plus the tool name and disposer.
 */
function registerToolOrThrow(ctx, label, createTool, description) {
  const tools = ctx?.tools
  if (tools?.register === undefined) {
    throw new Error(`network-engineer: tools registry unavailable; cannot register ${label}`)
  }

  let tool
  try {
    tool = createTool()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`network-engineer: cannot build ${label}: ${reason}`, { cause: error })
  }

  let dispose
  try {
    dispose = tools.register(tool)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`network-engineer: cannot register ${label}: ${reason}`, { cause: error })
  }
  ctx.logger?.info?.(`network-engineer: registered global tool "${tool.name ?? label}" (${description})`)
  return { status: 'registered', name: tool.name ?? label, dispose }
}

/**
 * Register the MikroTik WinBox terminal tool on `ctx.tools`.
 *
 * @param ctx - plugin context.
 * @param options - `createTool` override for tests; `allowWrite` is the deployment write gate.
 * @returns `registered` plus the tool name; throws when it cannot be registered.
 */
export function registerWinboxTool(ctx, options = {}) {
  const createTool = options.createTool ?? (() => createWinboxTool({ writeAllowed: options.allowWrite !== false }))
  return registerToolOrThrow(ctx, WINBOX_TOOL_NAME, createTool, 'MikroTik WinBox, read-only by default')
}

/**
 * Register the read-only `kb_lookup` tool on `ctx.tools`.
 *
 * @param ctx - plugin context.
 * @param options - `createTool` override for tests (receives no arguments).
 * @returns `registered` plus the tool name; throws when it cannot be registered.
 */
export function registerKbLookupTool(ctx, options = {}) {
  const createTool = options.createTool ?? (() => createKbLookupTool({ kbRoot: defaultRoots().kbDir }))
  return registerToolOrThrow(ctx, KB_LOOKUP_TOOL_NAME, createTool, 'read-only knowledge base lookup')
}

/**
 * Register the bundled knowledge-base skill, the WinBox terminal tool and the
 * kb_lookup tool, each behind its `Config` switch.
 * @param ctx - plugin context; registrations are disposed with it.
 * @param config - the validated row config (see {@link Config}).
 */
export function apply(ctx, config) {
  const resolved = resolveConfig(config)
  if (resolved.skill.enabled) registerBundledSkill(ctx, defaultRoots())
  if (resolved.winbox.enabled) registerWinboxTool(ctx, { allowWrite: resolved.winbox.allowWrite })
  if (resolved.kbLookup.enabled) registerKbLookupTool(ctx)
}
