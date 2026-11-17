/**
 * kb_lookup: read-only, section-level access to the packaged knowledge base.
 *
 * The model locates a document by vendor and topic, reads the `## ` outline,
 * and then fetches a single section instead of a whole ~7 KB file. Nothing is
 * cached across calls beyond a lazily built file index; the knowledge base is
 * small (about 1 MB) and the OS page cache already covers repeated reads.
 *
 * Path safety: every file path comes from the directory scan performed by
 * {@link buildKbIndex}. User input is only ever matched against scanned
 * entries, never joined into a path.
 *
 * @module lib/kb-lookup
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Stable tool name referenced by the skill and tests. */
export const KB_LOOKUP_TOOL_NAME = 'kb_lookup'

/** Maximum characters returned for one section (SPEC: longer sections are truncated). */
export const SECTION_CHAR_LIMIT = 6000

/** Maximum length accepted for any string argument. */
const MAX_INPUT_CHARS = 200

/** `<vendor>-<NN>-<topic>.md`; the vendor group must equal the directory name. */
const FILE_PATTERN = /^(.+)-(\d{2})-(.+)\.md$/

/**
 * Parse the frontmatter `verified` field and the document body.
 * @param {string} text raw Markdown.
 * @returns {{verified: string, body: string, title: string}} parsed fields.
 */
export function parseDocument(text) {
  const lines = text.split(/\r?\n/)
  let verified = ''
  let bodyStart = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) {
      for (const line of lines.slice(1, end)) {
        const match = line.match(/^verified:\s*(.*)$/)
        if (match !== null) verified = match[1].trim()
      }
      bodyStart = end + 1
    }
  }
  const body = lines.slice(bodyStart).join('\n')
  const titleLine = body.split('\n').find((line) => line.startsWith('# '))
  const title = titleLine === undefined ? '' : titleLine.slice(2).trim()
  return { verified, body, title }
}

/**
 * Locate level-2 headings, ignoring anything inside fenced code blocks.
 * @param {string} body document body without frontmatter.
 * @returns {{lines: string[], headings: Array<{title: string, start: number}>}} split lines and headings.
 */
function scanHeadings(body) {
  const lines = body.split('\n')
  const headings = []
  let inFence = false
  lines.forEach((line, index) => {
    if (/^```/.test(line)) {
      inFence = !inFence
      return
    }
    if (!inFence && line.startsWith('## ')) {
      headings.push({ title: line.slice(3).trim(), start: index })
    }
  })
  return { lines, headings }
}

/**
 * Level-2 outline of a document body.
 * @param {string} body document body.
 * @returns {string[]} heading titles in document order.
 */
export function outlineOf(body) {
  return scanHeadings(body).headings.map((heading) => heading.title)
}

/**
 * Extract the first `## ` section whose title contains `query` (case-insensitive).
 * @param {string} body document body.
 * @param {string} query substring of the section title.
 * @returns {{title: string, text: string}|null} the section, or null when nothing matches.
 */
export function extractSection(body, query) {
  const { lines, headings } = scanHeadings(body)
  const needle = query.trim().toLowerCase()
  const index = headings.findIndex((heading) => heading.title.toLowerCase().includes(needle))
  if (index === -1) return null
  const start = headings[index].start
  const end = index + 1 < headings.length ? headings[index + 1].start : lines.length
  return {
    title: headings[index].title,
    text: lines.slice(start, end).join('\n').trimEnd(),
  }
}

/**
 * Cap a section to {@link SECTION_CHAR_LIMIT} characters.
 * @param {string} text section text.
 * @returns {{text: string, truncated: boolean}} capped text and whether it was cut.
 */
export function capSection(text) {
  if (text.length <= SECTION_CHAR_LIMIT) return { text, truncated: false }
  return { text: text.slice(0, SECTION_CHAR_LIMIT), truncated: true }
}

/**
 * Vendor directories directly under the knowledge-base root.
 * @param {string} kbRoot absolute path of kb/.
 * @returns {string[]} sorted vendor directory names (hidden directories excluded).
 */
function listVendorDirs(kbRoot) {
  return readdirSync(kbRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

/**
 * Build a lazily scanned index of the knowledge base.
 *
 * The scan runs on first use and is kept for the life of the index. Files that
 * do not match `<vendor>-<NN>-<topic>.md` inside their own vendor directory are
 * skipped, as are root-level files such as kb/README.md.
 *
 * @param {string} kbRoot absolute path of the kb/ directory.
 * @returns {{vendors: () => string[], entries: () => Array<object>}} index accessors.
 */
export function buildKbIndex(kbRoot) {
  let entries = null
  const load = () => {
    if (entries !== null) return entries
    entries = []
    for (const vendor of listVendorDirs(kbRoot)) {
      for (const file of readdirSync(join(kbRoot, vendor)).sort()) {
        const match = FILE_PATTERN.exec(file)
        if (match === null || match[1] !== vendor) continue
        const absPath = join(kbRoot, vendor, file)
        if (!statSync(absPath).isFile()) continue
        const parsed = parseDocument(readFileSync(absPath, 'utf8'))
        entries.push({
          vendor,
          file: `${vendor}/${file}`,
          absPath,
          seq: match[2],
          topic: match[3],
          title: parsed.title,
          verified: parsed.verified,
        })
      }
    }
    return entries
  }
  return {
    vendors: () => [...new Set(load().map((entry) => entry.vendor))].sort(),
    entries: () => load(),
  }
}

/**
 * Read one scanned entry's body, refusing any path outside kbRoot.
 * @param {string} kbRoot absolute path of kb/.
 * @param {object} entry an index entry.
 * @returns {string} document body.
 */
function readEntryBody(kbRoot, entry) {
  const rel = relative(resolve(kbRoot), resolve(entry.absPath))
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('path escapes the knowledge base')
  }
  return parseDocument(readFileSync(entry.absPath, 'utf8')).body
}

/**
 * Validate one optional string argument.
 * @param {unknown} value raw argument.
 * @param {string} name argument name for the error message.
 * @returns {{value: string, error: string}} normalised value, or an error message.
 */
function stringArg(value, name) {
  if (value === undefined || value === null) return { value: '', error: '' }
  if (typeof value !== 'string') return { value: '', error: `${name} must be a string` }
  const trimmed = value.trim()
  if (trimmed.length > MAX_INPUT_CHARS) {
    return { value: '', error: `${name} must be at most ${MAX_INPUT_CHARS} characters` }
  }
  return { value: trimmed, error: '' }
}

/**
 * @param {object} fields result fields.
 * @returns {object} a complete result object matching {@link KB_LOOKUP_OUTPUT_SCHEMA}.
 */
function result(fields) {
  return {
    ok: false,
    vendor: '',
    matches: [],
    outline: [],
    section: '',
    truncated: false,
    ...fields,
  }
}

/**
 * @param {object} entry index entry.
 * @returns {object} the public match shape.
 */
function publicMatch(entry) {
  return { file: entry.file, seq: entry.seq, topic: entry.topic, title: entry.title, verified: entry.verified }
}

/**
 * Run one lookup against the index. Never throws: every failure is reported
 * as `{ ok: false, error }` so the tool contract holds.
 *
 * @param {ReturnType<typeof buildKbIndex>} index index returned by {@link buildKbIndex}.
 * @param {string} kbRoot absolute path of kb/ (used for the path-escape check).
 * @param {object} [input] `{vendor, topic?, section?}`.
 * @returns {object} result matching {@link KB_LOOKUP_OUTPUT_SCHEMA}.
 */
export function lookupKb(index, kbRoot, input = {}) {
  const args = input !== null && typeof input === 'object' ? input : {}
  const vendorArg = stringArg(args.vendor, 'vendor')
  const topicArg = stringArg(args.topic, 'topic')
  const sectionArg = stringArg(args.section, 'section')
  const firstError = vendorArg.error || topicArg.error || sectionArg.error
  if (firstError !== '') return result({ error: firstError })

  const vendor = vendorArg.value.toLowerCase()
  if (vendor === '') return result({ error: 'vendor is required' })
  const known = index.vendors()
  if (!known.includes(vendor)) {
    return result({ vendor, error: `unknown vendor "${vendor}"; known vendors: ${known.join(', ')}` })
  }

  const vendorEntries = index.entries().filter((entry) => entry.vendor === vendor)
  const topic = topicArg.value.toLowerCase()
  const section = sectionArg.value

  if (topic === '') {
    if (section !== '') return result({ vendor, error: 'section requires topic' })
    return result({ ok: true, vendor, matches: vendorEntries.map(publicMatch) })
  }

  const isSequence = /^\d{2}$/.test(topic)
  const found = vendorEntries.filter((entry) => (isSequence ? entry.seq === topic : entry.topic === topic))
  if (found.length === 0) {
    return result({
      vendor,
      error: `no document for topic "${topicArg.value}" under vendor ${vendor}`,
    })
  }
  const entry = found[0]
  let body
  try {
    body = readEntryBody(kbRoot, entry)
  } catch (error) {
    return result({ vendor, matches: [publicMatch(entry)], error: String(error?.message ?? error) })
  }
  const outline = outlineOf(body)

  if (section === '') {
    return result({ ok: true, vendor, matches: [publicMatch(entry)], outline })
  }

  const sectionHit = extractSection(body, section)
  if (sectionHit === null) {
    return result({
      vendor,
      matches: [publicMatch(entry)],
      outline,
      error: `no section matching "${section}" in ${entry.file}`,
    })
  }
  const capped = capSection(sectionHit.text)
  return result({
    ok: true,
    vendor,
    matches: [publicMatch(entry)],
    outline,
    section: capped.text,
    truncated: capped.truncated,
  })
}

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    seq: { type: 'string' },
    topic: { type: 'string' },
    title: { type: 'string' },
    verified: { type: 'string' },
  },
  required: ['file', 'seq', 'topic', 'title', 'verified'],
  additionalProperties: false,
}

/** Output schema (DSH JSON Schema subset: no minimum/maximum, explicit additionalProperties). */
export const KB_LOOKUP_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    error: { type: 'string' },
    vendor: { type: 'string' },
    matches: { type: 'array', items: MATCH_SCHEMA },
    outline: { type: 'array', items: { type: 'string' } },
    section: { type: 'string' },
    truncated: { type: 'boolean' },
  },
  required: ['ok', 'vendor', 'matches', 'outline', 'section', 'truncated'],
  additionalProperties: false,
}

/** Input schema (DSH JSON Schema subset). Ranges are documented in descriptions only. */
export const KB_LOOKUP_PARAMETERS = {
  type: 'object',
  properties: {
    vendor: {
      type: 'string',
      description: 'Vendor directory under kb/, for example huawei, cisco-ios, ubuntu, proxmox, tailscale.',
    },
    topic: {
      type: 'string',
      description:
        'Optional. Topic slug such as static-route, or two-digit sequence such as 05 (01 to 08 for network devices). Omit to list the vendor documents.',
    },
    section: {
      type: 'string',
      description:
        'Optional, requires topic. Case-insensitive part of a ## heading. Returns only that section, at most 6000 characters.',
    },
  },
  required: ['vendor'],
  additionalProperties: false,
}

/**
 * Render a lookup result as readable text for the model.
 * @param {object} value result from {@link lookupKb}.
 * @returns {string} text block.
 */
export function formatKbLookupText(value) {
  if (value === null || typeof value !== 'object') return 'no result'
  if (value.ok !== true) return `kb_lookup failed: ${value.error ?? 'error'}`
  const lines = [`# kb_lookup vendor=${value.vendor}`]
  for (const match of value.matches) {
    lines.push(`- ${match.file} · seq ${match.seq} · ${match.title} · verified=${match.verified || 'n/a'}`)
  }
  if (value.outline.length > 0) {
    lines.push('## outline')
    for (const heading of value.outline) lines.push(`- ${heading}`)
  }
  if (value.section !== '') {
    lines.push(value.section)
  }
  if (value.truncated) lines.push(`(truncated at ${SECTION_CHAR_LIMIT} characters)`)
  return lines.join('\n')
}

/**
 * Create the raw DSH ToolDefinition for kb_lookup.
 * @param {object} options `{kbRoot, index?}`; `index` defaults to a fresh lazy index.
 * @returns {object} raw DSH ToolDefinition.
 */
export function createKbLookupTool({ kbRoot, index = buildKbIndex(kbRoot) }) {
  return {
    name: KB_LOOKUP_TOOL_NAME,
    description:
      'Look up the packaged network and Linux command knowledge base by vendor and topic, then read one section. Call with vendor only to list documents, vendor and topic to get the outline, and add section to read just that part. Read-only; use it before read or grep on kb/ files.',
    parameters: KB_LOOKUP_PARAMETERS,
    isConcurrencySafe: () => true,
    output: {
      schema: KB_LOOKUP_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatKbLookupText(value) }],
    },
    execute: (args = {}, _exec) => lookupKb(index, kbRoot, args),
  }
}
