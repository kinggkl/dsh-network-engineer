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
 *
 * The companion "网络工程师助手" agent preset is declared in
 * `cordis.patch.yml` as a `@deepseek-ai/dsh-agent-preset` row and needs no
 * code here.
 *
 * The plugin imports nothing but Node builtins and its own modules: a
 * third-party plugin cannot rely on `@deepseek-ai/*` packages resolving from
 * its own directory — they are nested inside the dsh installation — so every
 * registry is reached through `ctx` alone.
 *
 * @module dsh-network-engineer
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createWinboxTool } from './lib/mikrotik-tool.mjs'

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
 * Register the MikroTik WinBox terminal tool on `ctx.tools`.
 *
 * The tool is best-effort: hosts whose harness has no `tools` service (or
 * whose registration fails) keep the knowledge-base skill and only lose the
 * WinBox capability, with a warning. The plugin must never fail to load
 * because a companion tool could not register.
 *
 * @param ctx - plugin context.
 * @param options - `createTool` override for tests.
 * @returns `registered` plus the tool name, or `skipped` plus the reason.
 */
export function registerWinboxTool(ctx, options = {}) {
  const createTool = options.createTool ?? (() => createWinboxTool())
  const tools = ctx?.tools
  if (tools?.register === undefined) {
    ctx.logger?.warn?.('network-engineer: tools registry unavailable; mt_winbox_exec not registered')
    return { status: 'skipped', reason: 'tools-unavailable' }
  }

  let tool
  try {
    tool = createTool()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    ctx.logger?.warn?.(`network-engineer: cannot build ${WINBOX_TOOL_NAME}: ${reason}`)
    return { status: 'skipped', reason: 'tool-build-failed' }
  }

  try {
    const dispose = tools.register(tool)
    ctx.logger?.info?.(`network-engineer: registered global tool "${tool.name ?? WINBOX_TOOL_NAME}" (MikroTik WinBox, read-only by default)`)
    return { status: 'registered', name: tool.name ?? WINBOX_TOOL_NAME, dispose }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    ctx.logger?.warn?.(`network-engineer: cannot register ${WINBOX_TOOL_NAME}: ${reason}`)
    return { status: 'skipped', reason: 'tool-registration-failed' }
  }
}

/**
 * Register the bundled knowledge-base skill and the WinBox terminal tool.
 * @param ctx - plugin context; registrations are disposed with it.
 */
export function apply(ctx) {
  registerBundledSkill(ctx, defaultRoots())
  registerWinboxTool(ctx)
}
