// Package manifest, exports, display metadata and attribution tests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

import { packageRoot, pathOf, read } from './_helpers.mjs'

const pkg = JSON.parse(read('package.json'))

test('package identity and version', () => {
  assert.equal(pkg.name, '@kinggkl/dsh-network-engineer')
  assert.equal(pkg.version, '0.1.5')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.license, 'MIT')
  assert.match(pkg.description, /130 篇/)
  assert.match(pkg.description, /17 平台/)
  assert.match(pkg.description, /WinBox/)
})

test('dsh bundle patch is declared and exists', () => {
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(statSync(pathOf('cordis.patch.yml')).isFile())
})

test('exports expose runtime, locale and icon subpaths', () => {
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.equal(pkg.exports['./icon'], './icon.svg')
})

test('files whitelist covers every runtime asset', () => {
  const required = [
    'index.js',
    'cordis.patch.yml',
    'lib/mikrotik-tool.mjs',
    'lib/winbox/client.mjs',
    'lib/winbox/THIRD_PARTY_LICENSE',
    'skills/network-command-kb/SKILL.md',
    'kb/huawei/huawei-01-system.md',
    'kb/vyos/vyos-01-system.md',
    'kb/mikrotik/mikrotik-08-remote-diagnostics.md',
    'kb/ubuntu/ubuntu-01-system.md',
    'kb/debian/debian-08-diagnostics.md',
    'kb/centos/centos-02-network.md',
    'kb/proxmox/proxmox-08-ha-diagnostics.md',
    'kb/rosz/rosz-01-platform.md',
  ]
  const globs = pkg.files
  const covered = (path) =>
    globs.some((glob) => {
      if (glob.endsWith('/**')) return path.startsWith(glob.slice(0, -3) + '/')
      if (glob.includes('*')) {
        const pattern = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$')
        return pattern.test(path)
      }
      return glob === path
    })
  for (const path of required) assert.ok(covered(path), `${path} is not covered by package.json files`)
  for (const name of ['README.md', 'NOTICE.md', 'CHANGELOG.md', 'LICENSE', 'icon.svg', 'locale/en.json', 'locale/zh.json']) {
    assert.ok(globs.some((glob) => glob === name || glob === 'locale/*.json' && name.startsWith('locale/')), `${name} missing from files`)
  }
})

test('locale resources carry display title and description', () => {
  for (const locale of ['en', 'zh']) {
    const doc = JSON.parse(read(`locale/${locale}.json`))
    assert.ok(typeof doc.meta.title === 'string' && doc.meta.title.length >= 3, `${locale} title`)
    assert.ok(typeof doc.meta.description === 'string' && doc.meta.description.length >= 10, `${locale} description`)
    assert.match(doc.meta.description, /130/)
    assert.match(doc.meta.description, /17/)
  }
  assert.match(JSON.parse(read('locale/zh.json')).meta.description, /VyOS/)
  assert.match(JSON.parse(read('locale/zh.json')).meta.description, /MikroTik/)
})

test('icon.svg is a self-contained SVG within the size limit', () => {
  const bytes = readFileSync(pathOf('icon.svg'))
  assert.ok(bytes.byteLength < 256 * 1024, 'icon must stay under 256 KiB')
  const text = bytes.toString('utf8')
  assert.match(text, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.match(text, /viewBox="0 0 64 64"/)
  assert.doesNotMatch(text, /<script/i)
})

test('attribution to the upstream project is present', () => {
  const readme = read('README.md')
  const notice = read('NOTICE.md')
  const license = read('LICENSE')
  for (const doc of [readme, notice]) {
    assert.match(doc, /sososilencing\/dsh-network-engineer/)
    assert.match(doc, /MIT/)
  }
  assert.match(notice, /致谢/)
  assert.match(notice, /issue #3|#3/)
  assert.match(license, /MIT License/)
  assert.match(license, /Copyright \(c\) 2026 dsh-network-engineer contributors/)
})

test('WinBox port attribution is present', () => {
  const notice = read('NOTICE.md')
  const thirdParty = read('lib/winbox/THIRD_PARTY_LICENSE')
  assert.match(notice, /subixonfire\/winbox-terminal-protocol/)
  assert.match(notice, /winbox_terminal_client\.py/)
  assert.match(thirdParty, /MIT License/)
  assert.match(thirdParty, /Copyright \(c\) 2026 subixonfire@gmail\.com/)
  assert.match(thirdParty, /JavaScript port/)
})

test('npm pack tarball contains every runtime asset and no test/dev files', () => {
  // Keep npm's cache inside the platform temp area: a sandboxed test run may not
  // be allowed to write to the user's ~/.npm cache.
  const cacheDir = mkdtempSync(join(tmpdir(), 'dsh-npm-cache-'))
  let output
  try {
    output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: packageRoot,
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: cacheDir },
    })
  } finally {
    rmSync(cacheDir, { recursive: true, force: true })
  }
  const files = JSON.parse(output)[0].files.map((entry) => entry.path)
  const required = [
    'index.js',
    'cordis.patch.yml',
    'lib/mikrotik-tool.mjs',
    'lib/winbox/client.mjs',
    'lib/winbox/THIRD_PARTY_LICENSE',
    'skills/network-command-kb/SKILL.md',
    'kb/huawei/huawei-06-ospf.md',
    'kb/zte/zte-01-system.md',
    'kb/vyos/vyos-05-static-route.md',
    'kb/mikrotik/mikrotik-07-acl.md',
    'kb/ubuntu/ubuntu-01-system.md',
    'kb/debian/debian-08-diagnostics.md',
    'kb/centos/centos-02-network.md',
    'kb/proxmox/proxmox-08-ha-diagnostics.md',
    'kb/rosz/rosz-01-platform.md',
    'kb/README.md',
    'locale/en.json',
    'locale/zh.json',
    'icon.svg',
    'README.md',
    'NOTICE.md',
    'CHANGELOG.md',
    'LICENSE',
  ]
  for (const path of required) assert.ok(files.includes(path), `npm pack is missing ${path}`)
  assert.equal(files.filter((path) => path.startsWith('kb/') && path.endsWith('.md')).length, 131, 'kb/ should ship 130 docs + README')
  for (const path of files) {
    assert.ok(!path.startsWith('test/'), `test files must not be packed: ${path}`)
    assert.ok(!path.startsWith('node_modules/'), `node_modules must not be packed: ${path}`)
    assert.ok(!path.startsWith('tools/'), `dev tools must not be packed: ${path}`)
  }
})

test('dev script and tooling entries are wired', () => {
  assert.equal(pkg.scripts.test, 'node --test test/')
  assert.equal(pkg.scripts.validate, 'bash tools/kb-validate.sh kb')
  assert.ok(pkg.devDependencies['js-yaml'])
  assert.ok(statSync(pathOf('tools/kb-validate.sh')).isFile())
  assert.ok(statSync(pathOf('test/kb.test.mjs')).isFile())
  assert.equal(packageRoot.length > 0, true)
})
