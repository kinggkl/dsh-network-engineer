/**
 * 网络工程师助手（network-command-kb）for DeepSeek Harness.
 *
 * Registers the bundled `network-command-kb` skill on `ctx.skills`. The skill
 * instructs the agent to search the 96 command reference documents shipped in
 * this package's `kb/` directory. The harness exposes the skill's resource base
 * to the agent when the skill loads, so the knowledge base stays portable with
 * the plugin and the `kb/...` paths in SKILL.md resolve against this package
 * root.
 *
 * The companion "网络工程师助手" agent preset is declared in
 * `cordis.patch.yml` as a `@deepseek-ai/dsh-agent-preset` row and needs no
 * code here.
 *
 * The plugin imports nothing but Node builtins: a third-party plugin cannot
 * rely on `@deepseek-ai/*` packages resolving from its own directory — they
 * are nested inside the dsh installation — so every registry is reached
 * through `ctx` alone.
 *
 * @module dsh-network-engineer
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'network-engineer-kb'

/** The registry this plugin registers into. */
export const inject = ['skills']

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
 * Register the bundled knowledge-base skill.
 * @param ctx - plugin context; the registration is disposed with it.
 */
export function apply(ctx) {
  registerBundledSkill(ctx, defaultRoots())
}
