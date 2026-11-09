// Preset composition tests: the part of upstream issue #3 that lived in cordis.patch.yml.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { read } from './_helpers.mjs'

const require = createRequire(import.meta.url)
let yaml
try {
  yaml = require('js-yaml')
} catch {
  yaml = null
}

const pkg = JSON.parse(read('package.json'))

const REQUIRED_PRESET_PLUGINS = [
  'persona',
  'present',
  'tool-jobs',
  'agent-instructions',
  'time-context',
  'tool-bash',
  'tool-pwsh',
  'tool-fs',
  'tool-fs-search',
  'skill-filesystem',
  'tool-skill',
  'tool-ask-user',
  'tool-todo',
  'tool-web',
]

const VENDOR_LABELS = ['华为', '新华三', '锐捷', '迪普', '思科', '瞻博', 'Arista', '飞塔', '中兴', 'VyOS', 'MikroTik']

// js-yaml is a declared devDependency; a missing install must fail, not silently skip.
const skipWithoutYaml = {}
test('devDependency js-yaml is installed', () => {
  assert.notEqual(yaml, null, 'run npm install before npm test')
})

// The Loader's `!!js` tag is not part of js-yaml's default schema; register it so
// the patch parses exactly the way the Loader would hand it the expression.
function loadPatch() {
  const jsTag = new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    resolve: () => true,
    construct: (data) => ({ __jsExpr: String(data) }),
  })
  return yaml.load(read('cordis.patch.yml'), { schema: yaml.DEFAULT_SCHEMA.extend([jsTag]) })
}

test('cordis.patch.yml parses as a YAML patch list', skipWithoutYaml, () => {
  const patch = loadPatch()
  assert.ok(Array.isArray(patch))
  assert.equal(patch.length, 2)
})

test('plugin row matches the package name and avoids upstream row ids', skipWithoutYaml, () => {
  const patch = loadPatch()
  const rows = patch.flatMap((entry) => entry.insert ?? [])
  const pluginRow = rows.find((row) => row.id === 'network-engineer-kb')
  assert.ok(pluginRow)
  assert.equal(pluginRow.name, pkg.name)
  assert.notEqual(pluginRow.id, 'network-engineer')
  assert.notEqual(pluginRow.name, 'dsh-network-engineer')
  for (const row of rows) assert.ok(!['network-engineer', 'preset-network-engineer'].includes(row.id))
})

test('all inserted row ids are unique (duplicate ids would mask a missing row)', skipWithoutYaml, () => {
  const patch = loadPatch()
  const ids = []
  const visit = (rows) => {
    for (const row of rows) {
      ids.push(row.id)
      if (row.group === true && Array.isArray(row.config)) visit(row.config)
      if (Array.isArray(row.config?.plugins)) visit(row.config.plugins)
    }
  }
  for (const entry of patch) visit(entry.insert ?? [])
  assert.deepEqual([...new Set(ids)], ids, `duplicate row ids: ${ids.join(', ')}`)
  assert.ok(ids.includes('tool-jobs'), 'tool-jobs row is missing')
  assert.ok(ids.includes('present'), 'present row is missing')
})

test('preset row declares the 网络工程师助手 preset with a full tool chain', skipWithoutYaml, () => {
  const patch = loadPatch()
  const rows = patch.flatMap((entry) => entry.insert ?? [])
  const presetRow = rows.find((row) => row.id === 'preset-network-engineer-kb')
  assert.ok(presetRow)
  assert.equal(presetRow.name, '@deepseek-ai/dsh-agent-preset')
  const config = presetRow.config
  assert.equal(config.id, 'network-engineer-kb')
  assert.equal(config.name, '网络工程师助手')
  assert.equal(typeof config.order, 'number')
  assert.match(config.description, /12 厂商/)
  assert.match(config.description, /mt_winbox_exec/)
  assert.ok(Array.isArray(config.plugins))

  const ids = config.plugins.map((row) => row.id)
  for (const id of REQUIRED_PRESET_PLUGINS) assert.ok(ids.includes(id), `preset is missing ${id}`)
  // upstream 0.1.0 shipped only persona + compaction + 4 tool rows; the fixed
  // composition must be visibly larger and include the skill tool chain.
  assert.ok(ids.length >= 14, `preset has only ${ids.length} plugin rows`)

  const compaction = config.plugins.find((row) => row.id === 'compaction')
  assert.equal(compaction.group, true)
  const children = compaction.config.map((row) => row.name)
  assert.ok(children.includes('@deepseek-ai/dsh-compaction-basic'))
  assert.ok(children.includes('@deepseek-ai/dsh-command-compact'))
  assert.ok(children.includes('@deepseek-ai/dsh-compaction-tool-result-pruner'))

  const bash = config.plugins.find((row) => row.id === 'tool-bash')
  const pwsh = config.plugins.find((row) => row.id === 'tool-pwsh')
  assert.deepEqual(Object.keys(bash.disabled).sort(), ['__jsExpr'])
  assert.deepEqual(Object.keys(pwsh.disabled).sort(), ['__jsExpr'])
  assert.match(bash.disabled.__jsExpr, /win32/)
  assert.match(pwsh.disabled.__jsExpr, /win32/)
})

test('persona covers all 12 vendors and only registered template variables', skipWithoutYaml, () => {
  const patch = loadPatch()
  const rows = patch.flatMap((entry) => entry.insert ?? [])
  const preset = rows.find((row) => row.id === 'preset-network-engineer-kb').config
  const persona = preset.plugins.find((row) => row.id === 'persona').config.prefix

  for (const label of VENDOR_LABELS) assert.ok(persona.includes(label), `persona is missing ${label}`)
  assert.match(persona, /96 篇/)
  assert.match(persona, /network-command-kb/)
  assert.match(persona, /VyOS 是 configure/)
  assert.match(persona, /RouterOS v7 与 v6/)
  assert.match(persona, /mt_winbox_exec/)
  assert.match(persona, /winbox\.json/)
  assert.match(persona, /LEGACY_AUTH_UNSUPPORTED/)
  // {{cwd}} was never a registered persona variable; keep it out.
  assert.doesNotMatch(persona, /\{\{cwd\}\}/)
  for (const variable of persona.match(/\{\{[^}]+\}\}/g) ?? []) {
    assert.ok(['{{model}}'].includes(variable), `unexpected persona variable ${variable}`)
  }
  assert.equal(preset.plugins.find((row) => row.id === 'persona').config.suffix, undefined)
})

test('every preset plugin name is a bare DSH package specifier', skipWithoutYaml, () => {
  const patch = loadPatch()
  const rows = patch.flatMap((entry) => entry.insert ?? [])
  const preset = rows.find((row) => row.id === 'preset-network-engineer-kb').config
  const names = []
  const visit = (plugins) => {
    for (const row of plugins) {
      if (row.name === 'cordis:group') visit(row.config)
      else names.push(row.name)
    }
  }
  visit(preset.plugins)
  for (const name of names) {
    assert.ok(name.startsWith('@deepseek-ai/'), `${name} is not a DSH package`)
    assert.doesNotMatch(name, /\s/, 'plugin names must not contain whitespace')
  }
  assert.ok(names.includes('@deepseek-ai/dsh-tool-skill'))
  assert.ok(names.includes('@deepseek-ai/dsh-tool-fs-search'))
  assert.ok(names.includes('@deepseek-ai/dsh-agent-instructions'))
})
