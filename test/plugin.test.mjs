// Plugin unit tests: the index.js contract that fixes upstream issue #3,
// including the degraded paths (missing SKILL.md, invalid frontmatter,
// missing knowledge base) exercised through temporary fixture roots.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as plugin from '../index.js'
import { packageRoot, read, VENDORS } from './_helpers.mjs'

function createFakeContext() {
  const registrations = []
  const warnings = []
  const infos = []
  const ctx = {
    skills: {
      register(skill) {
        registrations.push(skill)
        return () => {}
      },
    },
    logger: {
      warn: (message) => warnings.push(message),
      info: (message) => infos.push(message),
    },
  }
  return { ctx, registrations, warnings, infos }
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
  assert.deepEqual(plugin.inject, ['skills'])
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
  assert.match(skill.description, /96 篇/)
  assert.match(skill.description, /12 厂商/)
  assert.equal(skill.source, 'bundled')
  assert.match(skill.content, /网络命令知识库使用说明/)
  assert.equal(skill.path, join(packageRoot, 'skills', 'network-command-kb', 'SKILL.md'))
})

test('resourceBase points at the package root, not the skill directory (upstream issue #3)', () => {
  const { ctx, registrations } = createFakeContext()
  plugin.apply(ctx)

  const base = registrations[0].resourceBase
  assert.equal(base.kind, 'directory')
  assert.equal(base.path, packageRoot)
  // SKILL.md resolves `kb/...` against the resource base, so the KB has to be there.
  assert.ok(existsSync(join(base.path, 'kb')))
  for (const vendor of VENDORS) assert.ok(existsSync(join(base.path, 'kb', vendor, `${vendor}-06-ospf.md`)), vendor)
  assert.match(read('skills/network-command-kb/SKILL.md'), /resource base 是插件包根目录/)
})

test('apply() registers exactly one skill per call and is re-entrant', () => {
  const { ctx, registrations } = createFakeContext()
  plugin.apply(ctx)
  plugin.apply(ctx)
  assert.equal(registrations.length, 2)
  assert.deepEqual(
    registrations.map((skill) => skill.name),
    ['network-command-kb', 'network-command-kb'],
  )
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
