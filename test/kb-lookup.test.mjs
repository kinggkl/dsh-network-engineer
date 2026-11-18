// Unit tests for the kb_lookup tool (lib/kb-lookup.mjs) and its best-effort
// registration in index.js.
//
// The unit tests never touch the packaged knowledge base: a temporary fixture
// tree exercises the index scan (ignored root files, non-matching file names,
// files whose vendor prefix disagrees with their directory), the outline scan
// (fenced code blocks must not contribute headings), section lookup, the
// section cap, and every rejected-argument path. A final pair of tests runs the
// same code against the real kb/ to pin the 18-vendor / 138-document layout.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  SECTION_CHAR_LIMIT,
  buildKbIndex,
  createKbLookupTool,
  extractSection,
  lookupKb,
  outlineOf,
  parseDocument,
} from '../lib/kb-lookup.mjs'
import { registerKbLookupTool } from '../index.js'
import { VENDORS, pathOf } from './_helpers.mjs'

// The long section is generated so the fixture stays readable; it must exceed
// SECTION_CHAR_LIMIT by a comfortable margin.
const OVERLONG_SECTION = 'x'.repeat(SECTION_CHAR_LIMIT + 500)

const SYSTEM_DOC = `---
vendor: alpha
os: AlphaOS
topic: system
verified: high
updated: 2026-11-17
sources:
  - https://example.invalid/alpha/system
---

# alpha 系统管理

## 命令速查

| 命令 | 说明 |
| --- | --- |
| show version | 查看版本 |

## Quick start

正文段落。

\`\`\`text
## 围栏里的假标题
show running-config
\`\`\`

## 陷阱

围栏外的正文。
`

const STATIC_ROUTE_DOC = `---
vendor: alpha
os: AlphaOS
topic: static-route
verified: high
updated: 2026-11-17
---

# alpha 静态路由

## 命令速查

\`ip route 0.0.0.0/0 192.0.2.1\`

## 典型示例

示例正文。

## 超长章节

${OVERLONG_SECTION}
`

/**
 * Build the temporary knowledge-base fixture:
 *   kb/README.md                        (root file: ignored)
 *   kb/alpha/alpha-01-system.md         (valid)
 *   kb/alpha/alpha-05-static-route.md   (valid, overlong section)
 *   kb/alpha/notes.md                   (no <vendor>-<NN>-<topic> shape: skipped)
 *   kb/alpha/gamma-03-interface.md      (prefix != directory: skipped)
 */
function makeFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-kb-lookup-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const kbRoot = join(root, 'kb')
  mkdirSync(join(kbRoot, 'alpha'), { recursive: true })
  writeFileSync(join(kbRoot, 'README.md'), '# alpha 知识库索引\n\n- alpha/alpha-01-system.md\n')
  writeFileSync(join(kbRoot, 'alpha', 'alpha-01-system.md'), SYSTEM_DOC)
  writeFileSync(join(kbRoot, 'alpha', 'alpha-05-static-route.md'), STATIC_ROUTE_DOC)
  writeFileSync(join(kbRoot, 'alpha', 'notes.md'), '# not a document\n')
  writeFileSync(join(kbRoot, 'alpha', 'gamma-03-interface.md'), '# wrong vendor\n')
  return { root, kbRoot, index: buildKbIndex(kbRoot) }
}

/** Find every `minimum` / `maximum` key anywhere in a schema-like value. */
function findRangeKeys(value, trail = []) {
  if (value === null || typeof value !== 'object') return []
  const hits = []
  for (const [key, child] of Object.entries(value)) {
    if (key === 'minimum' || key === 'maximum') hits.push([...trail, key].join('.'))
    hits.push(...findRangeKeys(child, [...trail, key]))
  }
  return hits
}

/** Minimal plugin context with recording tool registry and logger. */
function createFakeContext({ register } = {}) {
  const toolRegistrations = []
  const warnings = []
  const infos = []
  return {
    toolRegistrations,
    warnings,
    infos,
    ctx: {
      tools: {
        register(tool) {
          toolRegistrations.push(tool)
          if (typeof register === 'function') return register(tool)
          return () => {}
        },
      },
      logger: {
        warn: (message) => warnings.push(message),
        info: (message) => infos.push(message),
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Index scan
// ---------------------------------------------------------------------------

test('buildKbIndex lists only well-formed documents inside their own vendor directory', (t) => {
  const { index } = makeFixture(t)
  assert.deepEqual(index.vendors(), ['alpha'])
  const entries = index.entries()
  assert.equal(entries.length, 2)
  assert.deepEqual(
    entries.map((entry) => entry.file),
    ['alpha/alpha-01-system.md', 'alpha/alpha-05-static-route.md'],
  )
  assert.deepEqual(
    entries.map((entry) => [entry.seq, entry.topic, entry.title, entry.verified]),
    [
      ['01', 'system', 'alpha 系统管理', 'high'],
      ['05', 'static-route', 'alpha 静态路由', 'high'],
    ],
  )
})

test('vendor-only lookup lists the vendor documents and reads no section', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, { vendor: 'alpha' })
  assert.equal(result.ok, true)
  assert.equal(result.vendor, 'alpha')
  assert.equal(result.matches.length, 2)
  assert.deepEqual(result.matches.map((match) => match.seq), ['01', '05'])
  assert.deepEqual(result.outline, [])
  assert.equal(result.section, '')
  assert.equal(result.truncated, false)
})

test('vendor lookup is case-insensitive', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, { vendor: 'ALPHA' })
  assert.equal(result.ok, true)
  assert.equal(result.vendor, 'alpha')
  assert.equal(result.matches.length, 2)
})

test('topic lookup accepts a two-digit sequence and a slug', (t) => {
  const { index, kbRoot } = makeFixture(t)

  const bySeq = lookupKb(index, kbRoot, { vendor: 'alpha', topic: '05' })
  assert.equal(bySeq.ok, true)
  assert.equal(bySeq.matches.length, 1)
  assert.equal(bySeq.matches[0].file, 'alpha/alpha-05-static-route.md')
  assert.deepEqual(bySeq.outline, ['命令速查', '典型示例', '超长章节'])
  assert.equal(bySeq.section, '')

  const bySlug = lookupKb(index, kbRoot, { vendor: 'alpha', topic: 'static-route' })
  assert.equal(bySlug.ok, true)
  assert.deepEqual(bySlug.matches, bySeq.matches)
  assert.deepEqual(bySlug.outline, bySeq.outline)

  const bySeq01 = lookupKb(index, kbRoot, { vendor: 'alpha', topic: '01' })
  assert.equal(bySeq01.matches[0].file, 'alpha/alpha-01-system.md')
})

test('outline skips ## headings inside fenced code blocks', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, { vendor: 'alpha', topic: '01' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.outline, ['命令速查', 'Quick start', '陷阱'])
  assert.ok(!result.outline.includes('围栏里的假标题'))
})

test('outlineOf / extractSection agree on the fenced-block rule', (t) => {
  const { index } = makeFixture(t)
  const body = parseDocument(SYSTEM_DOC).body
  assert.deepEqual(outlineOf(body), ['命令速查', 'Quick start', '陷阱'])
  assert.equal(extractSection(body, '陷阱').text.startsWith('## 陷阱'), true)
  assert.equal(extractSection(body, '围栏里的假标题'), null)
  // The fenced line has to be part of the preceding section, not a new one.
  assert.match(extractSection(body, 'Quick start').text, /## 围栏里的假标题/)
  assert.ok(index.entries().length === 2)
})

// ---------------------------------------------------------------------------
// Section reads
// ---------------------------------------------------------------------------

test('section lookup matches a case-insensitive heading substring', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, { vendor: 'alpha', topic: '01', section: 'QUICK' })
  assert.equal(result.ok, true)
  assert.equal(result.section.startsWith('## Quick start'), true)
  assert.match(result.section, /正文段落/)
  assert.equal(result.truncated, false)
  assert.deepEqual(result.outline, ['命令速查', 'Quick start', '陷阱'])
})

test('section lookup accepts a Chinese substring and returns only that section', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, { vendor: 'alpha', topic: '05', section: '命令' })
  assert.equal(result.ok, true)
  assert.equal(result.section.startsWith('## 命令速查'), true)
  assert.match(result.section, /ip route 0\.0\.0\.0\/0 192\.0\.2\.1/)
  assert.ok(!result.section.includes('## 典型示例'))
})

test('an unknown section reports an error but still returns the outline', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, { vendor: 'alpha', topic: '01', section: '不存在的章节' })
  assert.equal(result.ok, false)
  assert.match(result.error, /no section matching/)
  assert.deepEqual(result.outline, ['命令速查', 'Quick start', '陷阱'])
  assert.equal(result.section, '')
})

test('section without topic is an error', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, { vendor: 'alpha', section: '命令速查' })
  assert.equal(result.ok, false)
  assert.match(result.error, /section requires topic/)
})

test('an overlong section is truncated to exactly SECTION_CHAR_LIMIT characters', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, { vendor: 'alpha', topic: '05', section: '超长章节' })
  assert.equal(result.ok, true)
  assert.equal(result.truncated, true)
  assert.equal(result.section.length, SECTION_CHAR_LIMIT)
  assert.equal(SECTION_CHAR_LIMIT, 6000)
  assert.ok(result.section.startsWith('## 超长章节'))
})

// ---------------------------------------------------------------------------
// Rejected arguments
// ---------------------------------------------------------------------------

test('unknown vendors are rejected, including path-like values', (t) => {
  const { index, kbRoot } = makeFixture(t)
  for (const vendor of ['nope', '../etc', 'alpha/../etc', '..']) {
    const result = lookupKb(index, kbRoot, { vendor })
    assert.equal(result.ok, false, `${vendor} must be rejected`)
    assert.match(result.error, /unknown vendor/)
    assert.equal(result.matches.length, 0)
  }
})

test('topic traversal and unknown topics are reported as not found', (t) => {
  const { index, kbRoot } = makeFixture(t)
  for (const topic of ['../../x', '../alpha-01-system', '99', 'nope']) {
    const result = lookupKb(index, kbRoot, { vendor: 'alpha', topic })
    assert.equal(result.ok, false, `${topic} must not resolve`)
    assert.match(result.error, /no document for topic/)
    assert.equal(result.matches.length, 0)
  }
})

test('non-string arguments are rejected before any lookup', (t) => {
  const { index, kbRoot } = makeFixture(t)

  const badVendor = lookupKb(index, kbRoot, { vendor: 42 })
  assert.equal(badVendor.ok, false)
  assert.match(badVendor.error, /vendor must be a string/)

  const badTopic = lookupKb(index, kbRoot, { vendor: 'alpha', topic: 5 })
  assert.equal(badTopic.ok, false)
  assert.match(badTopic.error, /topic must be a string/)

  const badSection = lookupKb(index, kbRoot, { vendor: 'alpha', topic: '01', section: [] })
  assert.equal(badSection.ok, false)
  assert.match(badSection.error, /section must be a string/)
})

test('a missing vendor argument is reported', (t) => {
  const { index, kbRoot } = makeFixture(t)
  const result = lookupKb(index, kbRoot, {})
  assert.equal(result.ok, false)
  assert.match(result.error, /vendor is required/)
})

// ---------------------------------------------------------------------------
// Tool contract
// ---------------------------------------------------------------------------

test('createKbLookupTool returns the documented raw ToolDefinition', (t) => {
  const { kbRoot } = makeFixture(t)
  const tool = createKbLookupTool({ kbRoot })

  assert.equal(tool.name, 'kb_lookup')
  assert.match(tool.description, /read-only/i)
  assert.equal(tool.parameters.type, 'object')
  assert.equal(tool.parameters.additionalProperties, false)
  assert.deepEqual(tool.parameters.required, ['vendor'])
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ['section', 'topic', 'vendor'])
  assert.deepEqual(findRangeKeys(tool.parameters), [])
  assert.deepEqual(findRangeKeys(tool.output.schema), [])

  assert.equal(tool.output.schema.type, 'object')
  assert.equal(tool.output.schema.additionalProperties, false)
  assert.deepEqual(
    [...tool.output.schema.required].sort(),
    ['matches', 'ok', 'outline', 'section', 'truncated', 'vendor'],
  )
  assert.equal(tool.isConcurrencySafe({}), true)
  assert.equal(typeof tool.execute, 'function')
})

test('execute never throws, whatever the arguments look like', (t) => {
  const { kbRoot } = makeFixture(t)
  const tool = createKbLookupTool({ kbRoot })
  const calls = [
    () => tool.execute(),
    () => tool.execute(undefined, {}),
    () => tool.execute(null, {}),
    () => tool.execute('nope', {}),
    () => tool.execute([], {}),
    () => tool.execute({ vendor: 42 }, {}),
    () => tool.execute({ vendor: '../etc' }, {}),
    () => tool.execute({ vendor: 'alpha', topic: '../../x' }, {}),
    () => tool.execute({ vendor: 'alpha', topic: '05', section: '没有' }, {}),
  ]
  for (const call of calls) {
    const result = call()
    assert.equal(typeof result, 'object')
    assert.equal(typeof result.ok, 'boolean')
    assert.ok(Array.isArray(result.matches))
    assert.ok(Array.isArray(result.outline))
    assert.equal(typeof result.section, 'string')
    assert.equal(typeof result.truncated, 'boolean')
  }

  const listed = tool.execute({ vendor: 'alpha' })
  assert.equal(listed.ok, true)
  assert.equal(listed.matches.length, 2)
})

test('output.render returns exactly one text block', (t) => {
  const { kbRoot } = makeFixture(t)
  const tool = createKbLookupTool({ kbRoot })

  const listed = tool.execute({ vendor: 'alpha' })
  const renderedList = tool.output.render({ vendor: 'alpha' }, listed)
  assert.ok(Array.isArray(renderedList))
  assert.equal(renderedList.length, 1)
  assert.equal(renderedList[0].type, 'text')
  assert.equal(typeof renderedList[0].text, 'string')
  assert.match(renderedList[0].text, /kb_lookup vendor=alpha/)

  const failed = tool.execute({ vendor: 'nope' })
  const renderedError = tool.output.render({ vendor: 'nope' }, failed)
  assert.equal(renderedError.length, 1)
  assert.equal(renderedError[0].type, 'text')
  assert.match(renderedError[0].text, /kb_lookup failed:/)

  const sectioned = tool.execute({ vendor: 'alpha', topic: '05', section: '超长章节' })
  const renderedSection = tool.output.render({}, sectioned)
  assert.equal(renderedSection.length, 1)
  assert.match(renderedSection[0].text, /truncated at 6000 characters/)
})

// ---------------------------------------------------------------------------
// Registration in index.js
// ---------------------------------------------------------------------------

test('registerKbLookupTool() fails loudly when the tools registry is unavailable', () => {
  assert.throws(() => registerKbLookupTool({ logger: {} }), /tools registry unavailable; cannot register kb_lookup/)
})

test('registerKbLookupTool() fails loudly when the tool cannot be built', () => {
  const { ctx } = createFakeContext()
  assert.throws(
    () =>
      registerKbLookupTool(ctx, {
        createTool: () => {
          throw new Error('boom-build')
        },
      }),
    /cannot build kb_lookup: boom-build/,
  )
})

test('registerKbLookupTool() fails loudly when registration throws', () => {
  const { ctx } = createFakeContext({
    register: () => {
      throw new Error('boom-register')
    },
  })
  assert.throws(
    () => registerKbLookupTool(ctx, { createTool: () => ({ name: 'kb_lookup' }) }),
    /cannot register kb_lookup: boom-register/,
  )
})

test('registerKbLookupTool() registers the tool and returns its disposer', (t) => {
  const { kbRoot } = makeFixture(t)
  const dispose = () => {}
  const { ctx, toolRegistrations, infos } = createFakeContext({ register: () => dispose })

  const result = registerKbLookupTool(ctx, { createTool: () => createKbLookupTool({ kbRoot }) })
  assert.equal(result.status, 'registered')
  assert.equal(result.name, 'kb_lookup')
  assert.equal(result.dispose, dispose)
  assert.equal(toolRegistrations.length, 1)
  assert.equal(toolRegistrations[0].name, 'kb_lookup')
  assert.equal(infos.length, 1)
  assert.match(infos[0], /registered global tool "kb_lookup"/)
})

test('registerKbLookupTool() defaults to the packaged knowledge base', () => {
  const { ctx, toolRegistrations } = createFakeContext()
  const result = registerKbLookupTool(ctx)
  assert.equal(result.status, 'registered')
  assert.equal(result.name, 'kb_lookup')
  assert.equal(toolRegistrations.length, 1)
  const tool = toolRegistrations[0]
  assert.equal(tool.name, 'kb_lookup')
  assert.equal(tool.execute({ vendor: 'huawei' }).matches.length, 8)
})

// ---------------------------------------------------------------------------
// The real knowledge base
// ---------------------------------------------------------------------------

test('buildKbIndex sees exactly 18 vendors and 138 documents', () => {
  const index = buildKbIndex(pathOf('kb'))
  assert.equal(index.vendors().length, 18)
  assert.deepEqual(index.vendors(), [...VENDORS].sort())
  assert.equal(index.entries().length, 138)
})

test('lookupKb outlines huawei 05 and reads its 命令速查 section', () => {
  const kbRoot = pathOf('kb')
  const index = buildKbIndex(kbRoot)
  const result = lookupKb(index, kbRoot, { vendor: 'huawei', topic: '05' })
  assert.equal(result.ok, true)
  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].topic, 'static-route')
  assert.equal(result.outline.length, 7)

  const section = lookupKb(index, kbRoot, { vendor: 'huawei', topic: '05', section: '命令速查' })
  assert.equal(section.ok, true)
  assert.ok(section.section.length > 0)
  assert.ok(section.section.startsWith('## 命令速查'))
})
