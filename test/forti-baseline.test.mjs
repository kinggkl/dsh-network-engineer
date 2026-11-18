// 巡检剧本回归：playbooks/fortigate-audit.md ↔ .checks.json ↔ 夹具 ↔ forti-trim 四方一致。
// 目的不是测工具语法，而是锁住「裁剪后审计结论仍可推出」——红线 4 的唯一硬验收。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

import { pathOf, read } from './_helpers.mjs'

const TOOL = pathOf('tools/forti-trim.sh')
const CHECKS_PATH = 'playbooks/fortigate-audit.checks.json'
const PLAYBOOK_PATH = 'playbooks/fortigate-audit.md'

const checks = JSON.parse(read(CHECKS_PATH))
const playbook = read(PLAYBOOK_PATH)
const fixtureRel = checks.fixture
const fixtureText = read(fixtureRel)
const FIXTURE = pathOf(fixtureRel)

function trim(args = [], input) {
  const result = spawnSync('bash', [TOOL, ...args], { input, encoding: 'utf8' })
  assert.equal(result.error, undefined, String(result.error))
  assert.equal(result.status, 0, result.stderr)
  return { stdout: result.stdout, stderr: result.stderr }
}

function count(text, pattern) {
  const re = new RegExp(pattern, 'gm')
  return (text.match(re) ?? []).length
}

const trimmed = trim([FIXTURE]).stdout

test('判据表结构：ID 唯一、编号连续、严重度合法、manual 必须写理由', () => {
  const ids = checks.checks.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length, 'ID 不能重复')
  assert.equal(ids.length, 33, 'v1 剧本固定 33 条')
  assert.deepEqual(ids, ids.map((_, index) => `F-${String(index + 1).padStart(2, '0')}`), 'ID 必须 F-01…F-33 连续')
  for (const item of checks.checks) {
    assert.match(item.severity, /^P[012]$/, `${item.id} 的 severity 非法`)
    assert.ok(item.title.length > 0, `${item.id} 缺 title`)
    assert.match(item.kb, /^kb\/fortinet\/fortinet-\d{2}-[a-z-]+\.md$/, `${item.id} 的 kb 引用格式不对`)
    if (item.manual === true) {
      assert.ok((item.manualReason ?? '').length > 20, `${item.id} 标了 manual 必须写清为什么`)
      assert.equal(item.assert.length, 0, `${item.id} 标了 manual 就不要留 assert`)
    } else {
      assert.ok(item.assert.length > 0, `${item.id} 必须有至少一条 assert`)
    }
  }
})

test('剧本与判据表一一对应：md 里的每条 F-xx 都在 json 里，反之亦然', () => {
  const inMarkdown = new Set([...playbook.matchAll(/^\| (F-\d{2}) \|/gm)].map((match) => match[1]))
  const inJson = new Set(checks.checks.map((item) => item.id))
  assert.deepEqual([...inMarkdown].sort(), [...inJson].sort(), 'md 与 json 的检查项必须完全一致')
})

test('红线 4：每条非人工判据的证据行在裁剪后都还在（与原始计数 1:1）', () => {
  for (const item of checks.checks) {
    if (item.manual === true) continue
    for (const rule of item.assert) {
      const rawCount = count(fixtureText, rule.pattern)
      const keptCount = count(trimmed, rule.pattern)
      if (rule.kind === 'present') {
        assert.ok(keptCount >= (rule.min ?? 1), `${item.id} 证据「${rule.pattern}」裁剪后只剩 ${keptCount} 处（需 ≥${rule.min ?? 1}）`)
        const allowLoss = rule.allowLoss ?? 0
        assert.ok(
          keptCount >= rawCount - allowLoss,
          `${item.id} 证据「${rule.pattern}」被裁掉了 ${rawCount - keptCount} 处（红线 4 不允许，allowLoss=${allowLoss}）`,
        )
      } else {
        assert.equal(rawCount, 0, `${item.id} 断言「${rule.pattern}」不应出现，但夹具里有 ${rawCount} 处——夹具与判据不一致`)
        assert.equal(keptCount, 0, `${item.id} 断言「${rule.pattern}」不应出现，裁剪版里有 ${keptCount} 处`)
      }
    }
  }
})

test('裁剪确实发生：四棵子树只剩骨架，正文不再进入上下文', () => {
  // 骨架在 names 模式下是 `#   config ...` 注释行，所以判据是「正文标记消失」而不是「config 字样消失」
  const bodies = {
    'system replacemsg': 'set buffer "<html><head><title>Login',
    'vpn certificate': 'MIIEpAIBAAKCAQEAfake',
    'ips sensor': 'set comment "default sensor"',
    'application list': 'set other-application-log enable',
  }
  for (const [family, bodyMarker] of Object.entries(bodies)) {
    assert.ok(fixtureText.includes(`config ${family}`), `夹具应包含 ${family}`)
    assert.ok(fixtureText.includes(bodyMarker), `夹具里 ${family} 缺少正文标记 ${bodyMarker}`)
    assert.ok(!trimmed.includes(bodyMarker), `${family} 的正文没被折叠掉`)
    assert.ok(trimmed.includes(`# ⟪折叠⟫ ${family}：`), `${family} 缺少骨架行`)
  }
  assert.match(trimmed, /# ⟪折叠⟫ application list：\d+ 行 \/ \d+ 个对象/)
})

test('噪声删除与密钥掩码在审计夹具上同样生效', () => {
  assert.ok(!trimmed.includes('set uuid 0d6bd8e0-'))
  assert.ok(!trimmed.includes('set snmp-index'))
  assert.ok(!trimmed.includes('set color 1'))
  assert.ok(!trimmed.includes('AK1jFAKEENC'), 'ENC 密文不得进入裁剪版')
  assert.match(trimmed, /set password ENC \*\*\*/)
  assert.match(trimmed, /set passphrase ENC \*\*\*/)
  assert.ok(!trimmed.includes('MIIEpAIBAAKCAQEAfake'), 'PEM 正文不得进入裁剪版')
  assert.ok(!trimmed.includes('MIICfakecert'))
})

test('裁剪报告的可核对字段齐全（人看报告就能判断有没有丢东西）', () => {
  const { stderr } = trim([FIXTURE])
  assert.match(stderr, /红线 1 fail-open/)
  assert.match(stderr, /红线 2：原始回显未归档/)
  assert.match(stderr, /证据\s+allowaccess \d+\/\d+、vap security \d+\/\d+、pmf \d+\/\d+、static distance \d+\/\d+、policy action \d+\/\d+、utm-status \d+\/\d+/)
  // 六个证据点的保留数必须等于原始数（标签含空格，用正则取 name 与 a/b）
  const evidence = stderr.match(/证据\s+(.+)/)?.[1] ?? ''
  const pairs = [...evidence.matchAll(/([a-z][a-z .-]*?) (\d+)\/(\d+)/g)]
  assert.equal(pairs.length, 6, `应解析出 6 个证据点，实际 ${pairs.length}：${evidence}`)
  for (const [, name, kept, original] of pairs) {
    assert.equal(kept, original, `${name} 的保留数 ${kept}/${original} 不等于 1:1`)
  }
})

test('审计夹具裁剪后落在默认预算内，且体积确实缩小', () => {
  const { stdout, stderr } = trim([FIXTURE])
  assert.ok(stdout.length < fixtureText.length, '裁剪版必须更小')
  assert.match(stderr, /在 --max-bytes 20\.0 KB 预算内/)
  // 夹具是「审计证据密度很高」的片段，可折叠占比远低于真实全量配置（实测约 60–70%），
  // 因此这里只守住「明显变小」这个下限，不用真实设备的比例当断言。
  const ratio = stdout.length / fixtureText.length
  assert.ok(ratio < 0.92, `裁剪比 ${(ratio * 100).toFixed(1)}% 偏高，说明夹具里可折叠/噪声占比不足`)
})
