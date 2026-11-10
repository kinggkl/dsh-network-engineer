// Cross-document consistency: vendor lists, counts and routing-priority literals must
// agree between README, SKILL.md, persona and the corresponding knowledge base docs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { read, VENDORS } from './_helpers.mjs'

const require = createRequire(import.meta.url)
let yaml
try {
  yaml = require('js-yaml')
} catch {
  yaml = null
}

// Routing priority literals that every doc/README/persona statement must agree on.
// Vendor -> tokens that MUST appear in kb/<vendor>/<vendor>-05-static-route.md.
const STATIC_ROUTE_TOKENS = {
  huawei: ['preference 60'],
  h3c: ['静态 60'],
  ruijie: ['静态 1'],
  dptech: ['缺省 1'],
  'cisco-ios': ['静态 1'],
  'cisco-nxos': ['静态 1'],
  juniper: ['静态 5'],
  arista: ['administrative distance = 1'],
  fortinet: ['set distance 10'],
  zte: ['华为的 60'],
  vyos: ['distance 为 **1**'],
  mikrotik: ['静态缺省 1'],
}

// README priority table rows, checked verbatim so a doc-only edit cannot drift.
const README_TABLE_ROWS = [
  '| 华为 VRP / 新华三 Comware | preference 60 | preference 10 |',
  '| 锐捷 RGOS / Cisco IOS-IOS-XE / NX-OS / Arista EOS | AD 1 | AD 110 |',
  '| Juniper Junos | preference 5 | preference 10（外部 150） |',
  '| Fortinet FortiOS | distance 10 | distance 110 |',
  '| VyOS（FRR） | distance 1 | distance 110 |',
  '| 迪普 / 中兴 / MikroTik |',
]

test('each vendor static-route doc states its own priority literal', () => {
  for (const [vendor, tokens] of Object.entries(STATIC_ROUTE_TOKENS)) {
    const text = read(`kb/${vendor}/${vendor}-05-static-route.md`)
    for (const token of tokens) assert.ok(text.includes(token), `${vendor}-05 is missing "${token}"`)
  }
})

test('README priority table keeps the verified cross-vendor literals', () => {
  const readme = read('README.md')
  for (const row of README_TABLE_ROWS) assert.ok(readme.includes(row), `README is missing row: ${row}`)
  assert.ok(readme.includes('不能直接比大小'))
  assert.ok(readme.includes('98 篇'))
})

test('persona repeats the same multi-system routing constants', () => {
  if (yaml === null) return
  const jsTag = new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    resolve: () => true,
    construct: (data) => ({ __jsExpr: String(data) }),
  })
  const patch = yaml.load(read('cordis.patch.yml'), { schema: yaml.DEFAULT_SCHEMA.extend([jsTag]) })
  const preset = patch.flatMap((entry) => entry.insert ?? []).find((row) => row.id === 'preset-network-engineer-kb')
  const persona = preset.config.plugins.find((row) => row.id === 'persona').config.prefix
  for (const fragment of ['静态 60、OSPF 10', '静态 1、OSPF 110', '静态 5、OSPF 10', '静态 10、OSPF 110', '静态 1、OSPF 110']) {
    assert.ok(persona.includes(fragment), `persona lacks ${fragment}`)
  }
  for (const vendor of VENDORS) {
    assert.ok(persona.includes(`kb/${vendor}/`) || persona.includes(`${vendor}/（`), `persona lists no ${vendor} directory`)
  }
})

test('vendor list is identical across README, SKILL.md and package keywords', () => {
  const packageJson = JSON.parse(read('package.json'))
  const readme = read('README.md')
  const skill = read('skills/network-command-kb/SKILL.md')
  const keywordText = packageJson.keywords.join(' ')
  for (const vendor of VENDORS) {
    assert.ok(read(`kb/${vendor}/${vendor}-01-system.md`).length > 0)
    const keywordNeedle = vendor.startsWith('cisco-') ? 'cisco' : vendor
    assert.ok(keywordText.includes(keywordNeedle), `package.json keywords lack ${vendor}`)
    assert.ok(readme.includes(`${vendor}/`), `README lists no ${vendor}/`)
    assert.ok(skill.includes(`kb/${vendor}/`), `SKILL.md lists no kb/${vendor}/`)
  }
  assert.match(packageJson.description, /98 篇/)
  assert.match(readme, /13 厂商/)
  assert.match(skill, /98 篇/)
})
