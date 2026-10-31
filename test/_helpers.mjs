// Shared helpers for the dsh-network-engineer test suite.
// Kept dependency-free so the tests can run with a bare `node --test`.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Vendors in the order the knowledge base documents them. */
export const VENDORS = [
  'huawei',
  'h3c',
  'ruijie',
  'dptech',
  'cisco-ios',
  'cisco-nxos',
  'juniper',
  'arista',
  'fortinet',
  'zte',
  'vyos',
  'mikrotik',
]

/** The eight fixed topics. */
export const TOPICS = {
  '01': 'system',
  '02': 'vlan-l2',
  '03': 'interface',
  '04': 'link-aggregation',
  '05': 'static-route',
  '06': 'ospf',
  '07': 'acl',
  '08': 'remote-diagnostics',
}

/** Fixed section headings, in order. The high-risk one additionally carries ⚠️. */
export const SECTIONS = ['## 命令速查', '## 典型示例', '## 陷阱与版本差异', '## 高危操作', '## 参考来源']

/** Read a UTF-8 file under the package root. */
export function read(relativePath) {
  return readFileSync(resolve(packageRoot, relativePath), 'utf8')
}

/** Absolute path of a package file. */
export function pathOf(relativePath) {
  return resolve(packageRoot, relativePath)
}

/** Parse the `sources:` / `keywords:` list styles plus scalar keys of a frontmatter block. */
export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (match === null) return null
  const fields = {}
  let current = null
  for (const line of match[1].split(/\r?\n/)) {
    const scalar = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (scalar !== null) {
      current = scalar[1]
      const value = scalar[2].trim()
      if (value.startsWith('[')) {
        fields[current] = value
          .replace(/^\[/, '')
          .replace(/\]$/, '')
          .split(',')
          .map((item) => item.trim().replace(/^["']|["']$/g, ''))
          .filter((item) => item !== '')
      } else if (current === 'sources' || current === 'keywords') {
        fields[current] = []
      } else {
        fields[current] = value.replace(/^["']|["']$/g, '')
      }
      continue
    }
    const item = line.match(/^\s+-\s*(.*)$/)
    if (item !== null && current !== null && Array.isArray(fields[current])) {
      fields[current].push(item[1].trim().replace(/^["']|["']$/g, ''))
    }
  }
  return { fields, body: match[2] }
}

/**
 * Table statistics for every contiguous Markdown table inside one section body.
 * @returns {{ tables: number, dataRows: number, columnMismatches: number }}
 */
export function tableStats(sectionText) {
  const lines = sectionText.split(/\r?\n/)
  const result = { tables: 0, dataRows: 0, columnMismatches: 0 }
  let tableHeaderColumns = 0
  let previousWasTable = false
  for (const line of lines) {
    if (!line.startsWith('|')) {
      previousWasTable = false
      continue
    }
    const columns = line.replace(/\\\|/g, '').replace(/[^|]/g, '').length
    if (!previousWasTable) {
      result.tables += 1
      tableHeaderColumns = columns
      previousWasTable = true
      continue
    }
    if (/^\|\s*:?-{2,}/.test(line.replace(/\\\|/g, ''))) continue
    result.dataRows += 1
    if (columns !== tableHeaderColumns) result.columnMismatches += 1
  }
  return result
}

/** Split a doc into its `## ` sections keyed by heading text. */
export function sections(text) {
  const map = new Map()
  let current = '__preamble__'
  map.set(current, [])
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      current = line
      map.set(current, [])
      continue
    }
    map.get(current).push(line)
  }
  const ordered = []
  for (const key of map.keys()) ordered.push(key)
  return { map, ordered: ordered.filter((key) => key.startsWith('## ')) }
}
