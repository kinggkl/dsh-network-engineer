// Knowledge base structural tests: the same contract tools/kb-validate.sh enforces,
// plus the machine-readable checks that need JavaScript.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'

import { pathOf, read, parseFrontmatter, sections, tableStats, SECTIONS, TOPICS, VENDORS, topicsFor } from './_helpers.mjs'

const UPDATED_DATES = new Set(['2026-10-15', '2026-10-30', '2026-10-31', '2026-11-04', '2026-11-11'])
const TOPIC_CODES = Object.keys(TOPICS)
const DOCS = []
for (const vendor of VENDORS) {
  const topics = topicsFor(vendor)
  for (const [code, topic] of Object.entries(topics)) {
    DOCS.push({ vendor, code, topic, file: `kb/${vendor}/${vendor}-${code}-${topic}.md` })
  }
}

const OFFICIAL_DOMAINS = {
  huawei: ['support.huawei.com'],
  h3c: ['h3c.com'],
  ruijie: ['ruijie.com.cn'],
  'cisco-ios': ['cisco.com'],
  'cisco-nxos': ['cisco.com'],
  juniper: ['juniper.net', 'networkingdocs.hpe.com'],
  arista: ['arista.com'],
  fortinet: ['docs.fortinet.com', 'support.fortinet.com.cn'],
  zte: ['csl.zte.com.cn', 'zte.com.cn'],
  vyos: ['docs.vyos.io', 'vyos.io'],
  mikrotik: ['help.mikrotik.com', 'wiki.mikrotik.com'],
  proxmox: ['pve.proxmox.com', 'proxmox.com'],
  ubuntu: ['ubuntu.com', 'documentation.ubuntu.com', 'help.ubuntu.com'],
  debian: ['debian.org', 'wiki.debian.org', 'manpages.debian.org'],
  centos: ['centos.org', 'docs.centos.org', 'rockylinux.org', 'docs.rockylinux.org'],
  rosz: ['rosz.cn'],
}

test('knowledge base contains all 17 platforms', () => {
  const dirs = readdirSync(pathOf('kb'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  assert.deepEqual(dirs, [...VENDORS].sort())
})

test('each vendor directory holds exactly its declared topics', () => {
  for (const vendor of VENDORS) {
    const files = readdirSync(pathOf(`kb/${vendor}`))
      .filter((name) => name.endsWith('.md'))
      .sort()
    const expected = Object.entries(topicsFor(vendor))
      .map(([code, topic]) => `${vendor}-${code}-${topic}.md`)
      .sort()
    assert.deepEqual(files, expected, `${vendor} topic files`)
  }
})

for (const doc of DOCS) {
  test(`doc structure: ${doc.file}`, () => {
    const text = read(doc.file)
    assert.ok(text.endsWith('\n'), 'file must end with a newline')
    assert.ok(!text.includes('\r\n'), 'file must use LF newlines')

    const parsed = parseFrontmatter(text)
    assert.ok(parsed !== null, 'frontmatter block present')
    const { fields } = parsed

    for (const key of ['vendor', 'os', 'topic', 'devices', 'keywords', 'sources', 'verified', 'updated']) {
      assert.ok(fields[key] !== undefined, `frontmatter lacks ${key}`)
    }
    assert.ok(Array.isArray(fields.keywords), 'keywords parsed as a list')
    assert.ok(fields.keywords.length >= 6 && fields.keywords.length <= 12, `keywords count ${fields.keywords.length}`)
    assert.ok(['high', 'medium'].includes(fields.verified), `verified ${fields.verified}`)
    assert.ok(UPDATED_DATES.has(fields.updated), `updated ${fields.updated}`)
    assert.ok(Array.isArray(fields.sources) && fields.sources.length >= 2, 'sources has at least two URLs')
    for (const source of fields.sources) assert.match(source, /^https?:\/\//)
    if (OFFICIAL_DOMAINS[doc.vendor] !== undefined) {
      const hasOfficialSource = fields.sources.some((source) =>
        OFFICIAL_DOMAINS[doc.vendor].some((domain) => source.includes(domain)),
      )
      if (fields.verified === 'high') {
        assert.ok(hasOfficialSource, `${doc.vendor} high-verified doc needs at least one official source (${OFFICIAL_DOMAINS[doc.vendor].join(' / ')})`)
      } else {
        // medium docs are allowed to rest on public material, but must say so.
        assert.ok(hasOfficialSource || /以官方(手册|文档)/.test(text), `${doc.vendor} medium doc needs an official source or an explicit "以官方手册为准" note`)
      }
    }

    const NETWORK_TOPIC_TOKENS = {
      '01': /系统|管理/,
      '02': /VLAN|二层/,
      '03': /接口/,
      '04': /聚合/,
      '05': /静态路由|路由/,
      '06': /OSPF/,
      '07': /ACL|访问控制|防火墙|过滤/,
      '08': /远程|诊断/,
    }
    const LINUX_TOPIC_TOKENS = {
      '01': /系统|管理|包/,
      '02': /网络/,
      '03': /磁盘|存储|LVM|文件系统/,
      '04': /服务|systemd|日志/,
      '05': /用户|SSH|权限/,
      '06': /防火墙/,
      '07': /容器|虚拟化/,
      '08': /排障|诊断|性能/,
    }
    const PROXMOX_TOPIC_TOKENS = {
      '01': /系统|升级|管理/,
      '02': /备份|恢复|存储/,
      '03': /集群|节点/,
      '04': /存储/,
      '05': /虚拟机|VM|qm/,
      '06': /容器|LXC|pct/,
      '07': /网络/,
      '08': /高可用|HA|排障|诊断/,
    }
    const ROSZ_TOPIC_TOKENS = {
      '01': /平台|MCP|接入|概览/,
      '02': /运维|排障|诊断|只读/,
    }
    const TOPIC_TOKENS_BY_VENDOR = {
      ubuntu: LINUX_TOPIC_TOKENS,
      debian: LINUX_TOPIC_TOKENS,
      centos: LINUX_TOPIC_TOKENS,
      proxmox: PROXMOX_TOPIC_TOKENS,
      rosz: ROSZ_TOPIC_TOKENS,
    }
    const VENDOR_TOKENS = {
      huawei: /华为/,
      h3c: /新华三/,
      ruijie: /锐捷/,
      dptech: /迪普/,
      'cisco-ios': /思科/,
      'cisco-nxos': /思科/,
      juniper: /瞻博/,
      arista: /Arista/,
      fortinet: /飞塔/,
      zte: /中兴/,
      vyos: /VyOS/,
      mikrotik: /MikroTik/,
      proxmox: /Proxmox/,
      ubuntu: /Ubuntu/,
      debian: /Debian/,
      centos: /CentOS|Rocky/,
      rosz: /RosZ/,
    }
    assert.match(fields.vendor, VENDOR_TOKENS[doc.vendor], `${doc.file}: vendor field disagrees with its directory`)
    const topicTokens = TOPIC_TOKENS_BY_VENDOR[doc.vendor] ?? NETWORK_TOPIC_TOKENS
    const topicToken = topicTokens[doc.code]
    assert.match(fields.topic, topicToken, `${doc.file}: topic field disagrees with its filename topic`)

    const lines = text.split('\n').length - 1
    assert.ok(lines >= 60 && lines <= 130, `line count ${lines} outside 60–130`)

    const { ordered, map } = sections(text)
    const positions = SECTIONS.map((heading) => {
      const found = ordered.findIndex((actual) => actual.startsWith(heading))
      assert.notEqual(found, -1, `missing section ${heading}`)
      return found
    })
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(positions[index] > positions[index - 1], `section order broken at ${SECTIONS[index]}`)
    }
    for (const heading of SECTIONS) {
      const matches = ordered.filter((actual) => actual.startsWith(heading))
      assert.equal(matches.length, 1, `fixed section ${heading} must appear exactly once (got ${matches.length})`)
      const body = [...map.entries()].find(([actual]) => actual.startsWith(heading))[1].filter((line) => line.trim() !== '')
      assert.ok(body.length >= 2, `fixed section ${heading} body is empty or too short`)
    }

    // v0.1.2: every Huawei document must carry one platform-difference section
    // between the pitfalls and high-risk sections, with a table, and the keyword.
    if (doc.vendor === 'huawei') {
      // Count raw headings: helper's Map collapses duplicate headings, so the
      // uniqueness check must not rely on it (validator catches duplicates too).
      const platformCount = (text.match(/^## 平台差异（交换机 vs 路由器）$/gm) ?? []).length
      assert.equal(platformCount, 1, 'huawei doc must carry exactly one 平台差异 section')
      const platformHeadings = ordered.filter((actual) => actual.startsWith('## 平台差异'))
      const platformIndex = ordered.indexOf(platformHeadings[0])
      const trapIndex = ordered.findIndex((actual) => actual.startsWith('## 陷阱与版本差异'))
      const riskIndex = ordered.findIndex((actual) => actual.startsWith('## 高危操作'))
      assert.ok(platformIndex > trapIndex, '平台差异 section must follow 陷阱与版本差异')
      assert.ok(platformIndex < riskIndex, '平台差异 section must precede 高危操作')
      const platformBody = map.get(platformHeadings[0]).filter((line) => line.trim() !== '')
      assert.ok(platformBody.length >= 3, '平台差异 body is too short')
      assert.ok(platformBody.some((line) => line.startsWith('|')), '平台差异 body lacks a table')
      assert.ok(fields.keywords.includes('平台差异'), 'huawei keywords must include 平台差异')
    }

    const quick = [...map.entries()].find(([heading]) => heading.startsWith('## 命令速查'))?.[1].join('\n') ?? ''
    const quickStats = tableStats(quick)
    assert.ok(quickStats.dataRows >= 8, `quick table has only ${quickStats.dataRows} rows`)
    assert.equal(quickStats.columnMismatches, 0, 'quick table column mismatch')

    const fences = (text.match(/^```/gm) ?? []).length
    assert.ok(fences >= 2 && fences % 2 === 0, 'code fences are balanced')

    const highRisk = [...map.entries()].find(([heading]) => heading.startsWith('## 高危操作'))?.[1].join('\n') ?? ''
    assert.ok(highRisk.includes('⚠️'), 'high-risk section carries ⚠️')
    const bullets = highRisk.split('\n').filter((line) => line.startsWith('- '))
    assert.ok(bullets.length >= 1, 'high-risk section has bullets')
    for (const bullet of bullets) assert.ok(bullet.startsWith('- ⚠️'), `bullet lacks ⚠️ prefix: ${bullet.slice(0, 40)}`)

    const references = [...map.entries()].find(([heading]) => heading.startsWith('## 参考来源'))?.[1].join('\n') ?? ''
    const links = (references.match(/\]\(https?:\/\//g) ?? []).length
    assert.ok(links >= 2, `reference links ${links} < 2`)
  })
}

test('kb/README.md indexes all platforms and totals 130 documents', () => {
  const readme = read('kb/README.md')
  for (const vendor of VENDORS) {
    const rowPattern = new RegExp(`^\\| \`${vendor}/\` \\|`, 'm')
    assert.ok(rowPattern.test(readme), `kb/README.md platform index table lacks a ${vendor}/ row`)
  }
  assert.match(readme, /130/)
  assert.match(readme, /17 平台|十七平台/)
})

test('SKILL.md and locale metadata describe the 130-document knowledge base', () => {
  const skill = read('skills/network-command-kb/SKILL.md')
  assert.match(skill, /130 篇/)
  assert.match(skill, /17 平台/)
  for (const vendor of VENDORS) assert.ok(skill.includes(`kb/${vendor}/`), `SKILL.md lacks kb/${vendor}/`)
  for (const locale of ['en', 'zh']) {
    assert.match(JSON.parse(read(`locale/${locale}.json`)).meta.description, /130/)
  }
  assert.ok(statSync(pathOf('tools/kb-validate.sh')).size > 1000)
})
