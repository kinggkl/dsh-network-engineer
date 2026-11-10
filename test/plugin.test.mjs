// Plugin unit tests: the index.js contract that fixes upstream issue #3,
// including the degraded paths (missing SKILL.md, invalid frontmatter,
// missing knowledge base) exercised through temporary fixture roots.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as plugin from '../index.js'
import { packageRoot, read, VENDORS, topicsFor } from './_helpers.mjs'

function createFakeContext() {
  const registrations = []
  const toolRegistrations = []
  const warnings = []
  const infos = []
  const ctx = {
    skills: {
      register(skill) {
        registrations.push(skill)
        return () => {}
      },
    },
    tools: {
      register(tool) {
        toolRegistrations.push(tool)
        return () => {}
      },
    },
    logger: {
      warn: (message) => warnings.push(message),
      info: (message) => infos.push(message),
    },
  }
  return { ctx, registrations, toolRegistrations, warnings, infos }
}

function makeFixture({ skillFile, kb = true }) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-network-engineer-test-'))
  const skillDir = join(root, 'skills', 'network-command-kb')
  mkdirSync(skillDir, { recursive: true })
  if (kb) mkdirSync(join(root, 'kb'), { recursive: true })
  if (skillFile !== undefined) writeFileSync(join(skillDir, 'SKILL.md'), skillFile)
  return {
    root,
    roots: {
      packageRoot: root,
      skillDir,
      skillFile: join(skillDir, 'SKILL.md'),
      kbDir: join(root, 'kb'),
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

test('plugin metadata: name and inject', () => {
  assert.equal(plugin.name, 'network-engineer-kb')
  assert.deepEqual(plugin.inject, ['skills', 'tools'])
  assert.equal(plugin.WINBOX_TOOL_NAME, 'mt_winbox_exec')
})

test('defaultRoots() resolves the packaged skill and knowledge base', () => {
  const roots = plugin.defaultRoots()
  assert.equal(roots.packageRoot, packageRoot)
  assert.equal(roots.skillFile, join(packageRoot, 'skills', 'network-command-kb', 'SKILL.md'))
  assert.equal(roots.kbDir, join(packageRoot, 'kb'))
  assert.ok(existsSync(roots.skillFile))
})

test('apply() registers the bundled network-command-kb skill', () => {
  const { ctx, registrations } = createFakeContext()
  plugin.apply(ctx)

  assert.equal(registrations.length, 1)
  const skill = registrations[0]
  assert.equal(skill.name, 'network-command-kb')
  assert.match(skill.description, /130 篇/)
  assert.match(skill.description, /17 平台/)
  assert.equal(skill.source, 'bundled')
  assert.match(skill.content, /网络命令知识库使用说明/)
  assert.equal(skill.path, join(packageRoot, 'skills', 'network-command-kb', 'SKILL.md'))
})

test('apply() registers the global mt_winbox_exec tool', () => {
  const { ctx, toolRegistrations } = createFakeContext()
  plugin.apply(ctx)

  assert.equal(toolRegistrations.length, 1)
  const tool = toolRegistrations[0]
  assert.equal(tool.name, 'mt_winbox_exec')
  assert.match(tool.description, /WinBox/)
  assert.match(tool.description, /MikroTik/)
  assert.equal(tool.parameters.type, 'object')
  assert.ok(tool.parameters.properties.host)
  assert.ok(tool.parameters.properties.commands)
  assert.deepEqual(tool.parameters.required, ['host', 'commands'])
  assert.equal(tool.output.schema.type, 'object')
  const rendered = tool.output.render({ host: '192.0.2.1' }, { ok: true, host: '192.0.2.1', port: 8291, commands: [], outputs: [], durationMs: 1, bytes: 0 })
  assert.ok(Array.isArray(rendered))
  assert.equal(rendered[0].type, 'text')
  assert.equal(typeof rendered[0].text, 'string')
  assert.equal(tool.isConcurrencySafe({}), false)
  assert.equal(typeof tool.execute, 'function')
  assert.equal(typeof tool.timeoutMs, 'number')
})

test('resourceBase points at the package root, not the skill directory (upstream issue #3)', () => {
  const { ctx, registrations } = createFakeContext()
  plugin.apply(ctx)

  const base = registrations[0].resourceBase
  assert.equal(base.kind, 'directory')
  assert.equal(base.path, packageRoot)
  // SKILL.md resolves `kb/...` against the resource base, so the KB has to be there.
  assert.ok(existsSync(join(base.path, 'kb')))
  // 网络设备厂商按 06 号文档验在包根；Linux/Proxmox 按各自 06 主题；RosZ 只有 01/02，按 01 验。
  for (const vendor of VENDORS) {
    const topics = topicsFor(vendor)
    const code = topics['06'] === undefined ? '01' : '06'
    const probe = `${vendor}-${code}-${topics[code]}.md`
    assert.ok(existsSync(join(base.path, 'kb', vendor, probe)), `${vendor} missing ${probe}`)
  }
  assert.match(read('skills/network-command-kb/SKILL.md'), /resource base 是插件包根目录/)
})

test('apply() registers exactly one skill and one tool per call and is re-entrant', () => {
  const { ctx, registrations, toolRegistrations } = createFakeContext()
  plugin.apply(ctx)
  plugin.apply(ctx)
  assert.equal(registrations.length, 2)
  assert.deepEqual(
    registrations.map((skill) => skill.name),
    ['network-command-kb', 'network-command-kb'],
  )
  assert.equal(toolRegistrations.length, 2)
  assert.deepEqual(
    toolRegistrations.map((tool) => tool.name),
    ['mt_winbox_exec', 'mt_winbox_exec'],
  )
})

test('registerWinboxTool() degrades to a warning when the tools registry is unavailable', () => {
  const { ctx, warnings } = createFakeContext()
  delete ctx.tools
  const result = plugin.registerWinboxTool(ctx)
  assert.deepEqual(result, { status: 'skipped', reason: 'tools-unavailable' })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /tools registry unavailable/)
})

test('registerWinboxTool() degrades to a warning when the tool cannot be built or registered', () => {
  const broken = createFakeContext()
  const build = plugin.registerWinboxTool(broken.ctx, {
    createTool: () => {
      throw new Error('boom-build')
    },
  })
  assert.deepEqual(build, { status: 'skipped', reason: 'tool-build-failed' })
  assert.match(broken.warnings[0], /cannot build mt_winbox_exec: boom-build/)

  const rejected = createFakeContext()
  rejected.ctx.tools.register = () => {
    throw new Error('duplicate tool')
  }
  const registration = plugin.registerWinboxTool(rejected.ctx, {
    createTool: () => ({ name: 'mt_winbox_exec' }),
  })
  assert.deepEqual(registration, { status: 'skipped', reason: 'tool-registration-failed' })
  assert.match(rejected.warnings[0], /cannot register mt_winbox_exec: duplicate tool/)
})

test('registerWinboxTool() returns the tool registration disposer', () => {
  let disposed = false
  const { ctx } = createFakeContext()
  ctx.tools.register = () => () => {
    disposed = true
  }
  const result = plugin.registerWinboxTool(ctx, { createTool: () => ({ name: 'mt_winbox_exec' }) })
  assert.equal(result.status, 'registered')
  assert.equal(result.name, 'mt_winbox_exec')
  result.dispose()
  assert.equal(disposed, true)
})

test('skill body never leaks the upstream 80-document wording', () => {
  const { ctx, registrations } = createFakeContext()
  plugin.apply(ctx)
  assert.doesNotMatch(registrations[0].description, /80 篇/)
  assert.doesNotMatch(registrations[0].description, /十厂商/)
})

test('missing SKILL.md is a warning, not a throw (plugin stays loadable)', () => {
  const fixture = makeFixture({ skillFile: undefined })
  try {
    const { ctx, registrations, warnings } = createFakeContext()
    const result = plugin.registerBundledSkill(ctx, fixture.roots)
    assert.deepEqual(result, { status: 'skipped', reason: 'unreadable-skill-file' })
    assert.equal(registrations.length, 0)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /cannot read SKILL\.md/)
  } finally {
    fixture.cleanup()
  }
})

test('invalid SKILL.md frontmatter is a warning, not a throw', () => {
  const fixture = makeFixture({ skillFile: '---\ndescription: 没有 name\n---\n\n正文\n' })
  try {
    const { ctx, registrations, warnings } = createFakeContext()
    const result = plugin.registerBundledSkill(ctx, fixture.roots)
    assert.deepEqual(result, { status: 'skipped', reason: 'invalid-skill-file' })
    assert.equal(registrations.length, 0)
    assert.match(warnings[0], /requires non-empty name, description and body/)
  } finally {
    fixture.cleanup()
  }
})

test('missing knowledge base still registers the skill but warns', () => {
  const fixture = makeFixture({
    skillFile: '---\nname: fixture-skill\ndescription: fixture description\n---\n\n# Fixture\n',
    kb: false,
  })
  try {
    const { ctx, registrations, warnings } = createFakeContext()
    const result = plugin.registerBundledSkill(ctx, fixture.roots)
    assert.equal(result.status, 'registered')
    assert.equal(result.name, 'fixture-skill')
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].resourceBase.path, fixture.root)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /knowledge base directory is missing/)
  } finally {
    fixture.cleanup()
  }
})

test('registerBundledSkill() returns the skill registration disposer', () => {
  let disposed = false
  const { ctx } = createFakeContext()
  ctx.skills.register = () => () => {
    disposed = true
  }
  const result = plugin.registerBundledSkill(ctx, plugin.defaultRoots())
  assert.equal(result.status, 'registered')
  result.dispose()
  assert.equal(disposed, true)
})
