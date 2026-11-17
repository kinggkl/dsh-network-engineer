// forti-trim 工具测试：交接单 findings/forti-trim-handoff.md 的 6 条红线逐条验证。
// 工具实现在 tools/forti-trim.py，本测试只通过 tools/forti-trim.sh 调用，与真实用法一致。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { pathOf, read } from './_helpers.mjs'

const TOOL = pathOf('tools/forti-trim.sh')
const WORKSPACE_TOOL = pathOf('../../../tools/forti-trim.sh')
const FIXTURE = pathOf('test/fixtures/forti/fortinet-full-config-sample.txt')
const FIXTURE_TEXT = read('test/fixtures/forti/fortinet-full-config-sample.txt')

function run(args = [], input) {
  const result = spawnSync('bash', [TOOL, ...args], { input, encoding: 'utf8' })
  assert.equal(result.error, undefined, String(result.error))
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

let cached = null
/** 默认参数裁剪夹具：绝大多数断言都基于这一份结果。 */
function baseline() {
  if (cached === null) cached = run([FIXTURE])
  return cached
}

test('包装脚本可执行，插件内与工作区两个入口版本一致', () => {
  const version = run(['--version'])
  assert.equal(version.status, 0)
  assert.match(version.stdout.trim(), /^forti-trim \d+\.\d+\.\d+$/)
  assert.ok(statSync(TOOL).mode & 0o111, 'tools/forti-trim.sh 需要可执行位')
  if (!existsSync(WORKSPACE_TOOL)) return
  const workspace = spawnSync('bash', [WORKSPACE_TOOL, '--version'], { encoding: 'utf8' })
  assert.equal(workspace.status, 0)
  assert.equal(workspace.stdout.trim(), version.stdout.trim())
})

test('红线 3：uuid 类噪声行删除，报告分项计数', () => {
  const { status, stdout, stderr } = baseline()
  assert.equal(status, 0)
  for (const noise of ['set uuid', 'set snmp-index', 'set color']) {
    assert.ok(!stdout.includes(noise), `裁剪版不应残留 ${noise}`)
  }
  assert.match(stderr, /噪声 15 行（uuid 10 \/ snmp-index 3 \/ color 2）/)
  // 噪声行的父对象必须还在，删的是键值不是对象
  assert.match(stdout, /^ {4}edit "lan"$/m)
})

test('红线 3：ENC 密文掩码、键名保留', () => {
  const { stdout, stderr } = baseline()
  assert.match(stdout, /^ {8}set password ENC \*\*\*$/m)
  assert.match(stdout, /^ {8}set psksecret ENC \*\*\*$/m)
  assert.ok(!/AK\d*jFAKE/.test(stdout), '裁剪版不应带出 ENC 密文')
  assert.match(stderr, /ENC 3 处/)
})

test('红线 3：PEM 证书/私钥折叠成一行占位', () => {
  const { status, stdout, stderr } = run(['--no-fold', FIXTURE])
  assert.equal(status, 0)
  assert.equal((stdout.match(/⟪PEM 已掩码/g) ?? []).length, 2)
  assert.ok(!stdout.includes('MIIEpAIBAAKCAQEAfake'), '裁剪版不应带出 PEM base64 正文')
  assert.match(stderr, /PEM 2 段/)
})

test('红线 3：四棵子树折叠成骨架行并给出对象数', () => {
  const { stdout, stderr } = baseline()
  for (const family of ['system replacemsg', 'ips sensor', 'application list', 'vpn certificate']) {
    assert.ok(stdout.includes(`# ⟪折叠⟫ ${family}：`), `缺少 ${family} 的折叠骨架行`)
    assert.match(stderr, new RegExp(`折叠\\s+${family}`))
  }
  assert.match(stderr, /system replacemsg\s+12 行 \/\s+2 个对象/)
  assert.match(stderr, /ips sensor\s+13 行 \/\s+1 个对象（set status disable 2 处）/)
})

test('红线 5：折叠保留块名骨架，不是一句话统计', () => {
  const { stdout } = baseline()
  assert.match(stdout, /^#   config system replacemsg admin "admin-login"$/m)
  assert.match(stdout, /^#   config system replacemsg alertmail "alertmail-lib"$/m)
  assert.match(stdout, /^#   edit "Fortinet_SSL"$/m)
  assert.match(stdout, /^#   edit "block-p2p"$/m)
})

test('红线 1 fail-open：名单外子树、截断块原样保留', () => {
  const { stdout, stderr } = baseline()
  // 名字前缀相同但不在折叠名单：replacemsg-group 必须完整保留
  assert.match(stdout, /^config system replacemsg-group$/m)
  assert.ok(stdout.includes('set buffer "keep me"'))
  // 未知/新增子树、大数据量子树都不许动
  assert.match(stdout, /^config system vne-interface$/m)
  assert.match(stdout, /^config firewall internet-service-name$/m)
  assert.match(stdout, /^config switch-controller managed-switch$/m)
  // 文件尾被截断的折叠候选块：不折叠、逐行保留
  assert.ok(stdout.includes('config system replacemsg utm "utm-av"'))
  assert.ok(stdout.includes('truncated capture starts here'))
  assert.match(stderr, /被截断的折叠候选块 1 个/)
})

test('红线 4：六类证据点一个没删（保留/原始 全部 1:1）', () => {
  const { stdout, stderr } = baseline()
  const evidence = {
    allowaccess: [3, 3],
    'vap security': [2, 2],
    pmf: [2, 2],
    'static distance': [2, 2],
    'policy action': [2, 2],
    'utm-status': [2, 2],
  }
  for (const [name, [kept, original]] of Object.entries(evidence)) {
    assert.equal(kept, original, `${name} 的保留数应与原始数一致`)
    assert.match(stderr, new RegExp(`${name} ${kept}/${original}`))
  }
  assert.match(stderr, /保留\/原始/)
  // 逐项确认这些行确实在裁剪版里
  assert.ok(stdout.includes('set allowaccess ping https http snmp fabric speed-test'))
  assert.equal((stdout.match(/set pmf disable/g) ?? []).length, 2)
  assert.equal((stdout.match(/set distance 1/g) ?? []).length, 2)
  assert.ok(stdout.includes('set action accept'))
  assert.ok(stdout.includes('set action deny'))
  assert.equal((stdout.match(/set utm-status /g) ?? []).length, 2)
})

test('红线 2：原始回显先落盘，且与输入逐字节一致', () => {
  const dir = mkdtempSync(join(tmpdir(), 'forti-trim-raw-'))
  try {
    const result = run(['--host', 'fw-test', '--raw-archive', dir, FIXTURE])
    assert.equal(result.status, 0)
    assert.match(result.stderr, /归档\s+\S+fw-test-.*\.txt/)
    const files = readdirSync(dir)
    assert.equal(files.length, 1)
    assert.match(files[0], /^fw-test-\d{8}-\d{6}-fortinet-full-config-sample\.txt$/)
    assert.deepEqual(readFileSync(join(dir, files[0])), readFileSync(FIXTURE))
    // 归档不改变裁剪结果
    assert.equal(result.stdout, baseline().stdout)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('归档安全：恶意 host 不能逃出归档目录，目录 0700、文件 0600', () => {
  const dir = mkdtempSync(join(tmpdir(), 'forti-trim-sec-'))
  try {
    // 归档目录嵌套两层，使未净化的 ../../ 若生效会落在 dir/a/ 下，便于断言
    const archive = join(dir, 'a', 'b', 'raw')
    const result = run(['--host', '../../escape', '--raw-archive', archive, FIXTURE])
    assert.equal(result.status, 0)
    assert.deepEqual(readdirSync(join(dir, 'a')), ['b'], '归档文件不应逃逸到 a/ 下')
    const files = readdirSync(archive)
    assert.equal(files.length, 1)
    assert.deepEqual(readFileSync(join(archive, files[0])), readFileSync(FIXTURE))
    assert.equal(statSync(join(archive, files[0])).mode & 0o777, 0o600)
    assert.equal(statSync(archive).mode & 0o777, 0o700)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('红线 2：没给 --raw-archive 时明确告警', () => {
  const { stderr } = baseline()
  assert.match(stderr, /红线 2：原始回显未归档/)
})

test('超预算只告警不丢行；--fail-on-budget 才把退出码改成 3', () => {
  const warn = run(['--max-bytes', '1024', FIXTURE])
  assert.equal(warn.status, 0)
  assert.match(warn.stderr, /超出 --max-bytes 1\.0 KB/)
  assert.equal(warn.stdout, baseline().stdout, '超预算不允许再删内容')

  const strict = run(['--max-bytes', '1024', '--fail-on-budget', FIXTURE])
  assert.equal(strict.status, 3)
  assert.equal(strict.stdout, baseline().stdout)
})

test('默认 20KB 预算在夹具上达标', () => {
  const { stderr } = baseline()
  assert.match(stderr, /在 --max-bytes 20\.0 KB 预算内/)
})

test('--skeleton none/edits 只改骨架形态，不改处置口径', () => {
  const none = run(['--skeleton', 'none', FIXTURE])
  assert.equal(none.status, 0)
  assert.ok(none.stdout.includes('# ⟪折叠⟫ system replacemsg：'))
  assert.ok(!none.stdout.includes('#   config system replacemsg admin'))
  assert.match(none.stderr, /system replacemsg\s+12 行 \/\s+2 个对象/)

  const edits = run(['--skeleton', 'edits', FIXTURE])
  assert.equal(edits.status, 0)
  assert.match(edits.stdout, /^config ips sensor$/m)
  assert.match(edits.stdout, /^ {4}edit "default"$/m)
  assert.match(edits.stdout, /^config system replacemsg admin "admin-login"$/m)
})

test('stdin 与文件输入等价；--quiet 不出报告；-o 落盘', () => {
  const viaStdin = run([], FIXTURE_TEXT)
  assert.equal(viaStdin.status, 0)
  assert.equal(viaStdin.stdout, baseline().stdout)

  const quiet = run(['--quiet', FIXTURE])
  assert.equal(quiet.status, 0)
  assert.equal(quiet.stderr, '')
  assert.equal(quiet.stdout, baseline().stdout)

  const dir = mkdtempSync(join(tmpdir(), 'forti-trim-out-'))
  try {
    const target = join(dir, 'audit.txt')
    const saved = run(['-o', target, FIXTURE])
    assert.equal(saved.status, 0)
    assert.equal(saved.stdout, '')
    assert.equal(readFileSync(target, 'utf8'), baseline().stdout)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('--keep-noise/--no-mask/--no-fold 是逃生阀，能恢复原始内容', () => {
  assert.match(run(['--keep-noise', FIXTURE]).stdout, /set uuid 0d6bd8e0-/)
  assert.match(run(['--no-mask', FIXTURE]).stdout, /ENC AK1jFAKE/)
  assert.ok(run(['--no-fold', FIXTURE]).stdout.includes('config ips sensor'))
})

test('空输入报错退出，不产出空文件', () => {
  const empty = run([], '')
  assert.equal(empty.status, 2)
  assert.match(empty.stderr, /输入为空/)
  assert.equal(empty.stdout, '')
})
