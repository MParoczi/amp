/*
 * The amp step switches, the rows of the `## amp configuration` table in a project's CLAUDE.md
 * (spec §5.1): read them, and change one keeping the rest of the text byte for byte. Pure: the
 * hooks modules feed it text.
 */

export const STEPS = ['Grill', 'Tests', 'Verify', 'Document reviews', 'Task reviews', 'Final review', 'CI'] as const
export type Step = (typeof STEPS)[number]
export type Switch = 'on' | 'off'

/** One line per step for the pane: what does not run when it is off. */
export const STEP_HELP: Record<Step, string> = {
  Grill: 'off: no interview and no gate; open decisions become rulings in the PR',
  Tests: 'off: no new tests are written; existing tests stay green',
  Verify: 'off: the local verify run before the PR is skipped',
  'Document reviews': 'off: no independent review of spec, plan or roadmap',
  'Task reviews': 'off: no per-task review and no fix loop',
  'Final review': 'off: no whole-branch review',
  CI: 'off: the PR merges without waiting for checks',
}

/** The six steps that are plain on/off rows (all but Verify). */
const SWITCHES = STEPS.filter(step => step !== 'Verify')
const HEADING = /^##\s+amp configuration\s*$/i
const COMMENT = /^<!-- amp Verify command: (.*) -->$/

type Line = { text: string; eol: string }
/** A text split into lines with their terminators, and where its section and table sit (indexes). */
type Doc = { bom: string; nl: string; lines: Line[]; heading?: number; table?: { start: number; end: number } }

/** Splits the text into lines and locates the section heading and its table (spec §5.1, Lines and Finding the table). */
function parse(text: string): Doc {
  const bom = text.startsWith('﻿') ? '﻿' : ''
  const parts = text.slice(bom.length).split('\n')
  const lines = parts.map((part, i) => {
    const eol = i === parts.length - 1 ? '' : part.endsWith('\r') ? '\r\n' : '\n'
    return { text: eol === '\r\n' ? part.slice(0, -1) : part, eol }
  })
  if (lines.at(-1)?.text === '') lines.pop()
  return locate({ bom, nl: text.includes('\r\n') ? '\r\n' : '\n', lines })
}

/** Sets the doc's heading and table from its lines. */
function locate(doc: Doc): Doc {
  const { lines } = doc
  doc.heading = lines.findIndex(line => HEADING.test(line.text))
  doc.table = undefined
  if (doc.heading < 0) {
    doc.heading = undefined
    return doc
  }
  let i = doc.heading + 1
  const inSection = () => i < lines.length && !/^##? /.test(lines[i]!.text)
  while (inSection() && !isTableLine(lines[i]!)) i++
  if (!inSection()) return doc
  const start = i
  while (inSection() && isTableLine(lines[i]!)) i++
  doc.table = { start, end: i }
  return doc
}

/** Whether a line belongs to a table: it starts with `|` after optional spaces. */
function isTableLine(line: Line): boolean {
  return /^ *\|/.test(line.text)
}

/** A row's cells, split on `|` not preceded by a backslash. */
function cells(line: Line): string[] {
  return line.text.split(/(?<!\\)\|/)
}

/** A key or value trimmed of whitespace and backticks, lower-cased. */
function norm(cell: string | undefined): string {
  return (cell ?? '').replace(/^[\s`]+|[\s`]+$/g, '').toLowerCase()
}

/** The index of the step's first row in the table, if any. */
function rowOf(doc: Doc, step: Step): number | undefined {
  if (!doc.table) return undefined
  for (let i = doc.table.start + 2; i < doc.table.end; i++) if (norm(cells(doc.lines[i]!)[1]) === norm(step)) return i
  return undefined
}

/** Each step's value in a parsed doc. */
function valuesOf(doc: Doc): Record<Step, Switch> {
  const values = {} as Record<Step, Switch>
  for (const step of STEPS) {
    const row = rowOf(doc, step)
    values[step] = row !== undefined && norm(cells(doc.lines[row]!)[2]) === 'off' ? 'off' : 'on'
  }
  return values
}

/** Each step's value in a CLAUDE.md text; undefined text (no file) is all on. */
export function readSteps(text: string | undefined): Record<Step, Switch> {
  return valuesOf(parse(text ?? ''))
}

/** True when the text's table holds all six on/off rows. */
export function hasStepRows(text: string | undefined): boolean {
  const doc = parse(text ?? '')
  return SWITCHES.every(step => rowOf(doc, step) !== undefined)
}

/** Inserts lines (each given the doc's terminator) at `at`, first terminating the line before it. */
function insert(doc: Doc, at: number, texts: string[]): void {
  const before = doc.lines[at - 1]
  if (before && before.eol === '') before.eol = doc.nl
  doc.lines.splice(at, 0, ...texts.map(text => ({ text, eol: doc.nl })))
}

/** Whether the line at `i` exists and is blank. */
function isBlank(doc: Doc, i: number): boolean {
  return doc.lines[i]?.text.trim() === ''
}

/** Adds what is missing of the section, the table and the six on/off rows (spec §5.1, setStep rule 2). */
function ensureRows(doc: Doc): void {
  const header = ['| Key | Value |', '|---|---|']
  const row = (step: Step) => `| ${step} | on |`
  if (doc.heading === undefined) {
    const last = doc.lines.length - 1
    if (last >= 0) insert(doc, last + 1, isBlank(doc, last) ? [] : [''])
    insert(doc, doc.lines.length, ['## amp configuration', '', ...header, ...SWITCHES.map(row)])
  } else if (!doc.table) {
    let at = doc.heading + 1
    if (isBlank(doc, at)) at++
    else insert(doc, at++, [''])
    const table = [...header, ...SWITCHES.map(row)]
    insert(doc, at, isBlank(doc, at) ? table : [...table, ''])
  } else {
    const missing = SWITCHES.filter(step => rowOf(doc, step) === undefined)
    if (missing.length) insert(doc, doc.table.end, missing.map(row))
  }
  locate(doc)
}

/**
 * Sets a row's value cell: one space each side, or the leading space only when the row has no
 * closing pipe. A row whose closing pipe follows its key (`| Verify |`) gets a value cell before it.
 */
function setCell(line: Line, value: string): void {
  const row = cells(line)
  if (row.length === 3 && row[2]!.trim() === '') row.splice(2, 0, '')
  row[2] = row.length > 3 ? ` ${value} ` : ` ${value}`
  line.text = row.join('|')
}

/** The text with `step` set to `value`; unchanged when the step already has it or the change can't be made. */
export function setStep(text: string | undefined, step: Step, value: Switch): string {
  const original = text ?? ''
  const doc = parse(original)
  if (valuesOf(doc)[step] === value) return original
  const verifyRow = step === 'Verify' ? rowOf(doc, step) : undefined
  const command = verifyRow === undefined ? undefined : cells(doc.lines[verifyRow]!)[2]?.trim() ?? ''
  if (command?.includes('-->')) return original
  if (doc.table && doc.table.end - doc.table.start < 2) return original   // no header and delimiter: not a table to edit
  ensureRows(doc)
  const table = doc.table!
  const row = rowOf(doc, step)
  if (step !== 'Verify') setCell(doc.lines[row!]!, value)
  else {
    const after = doc.lines[table.end]
    const remembered = after ? COMMENT.exec(after.text)?.[1] : undefined
    if (value === 'off' && row === undefined) insert(doc, table.end, ['| Verify | off |'])
    else if (value === 'off' && !command) setCell(doc.lines[row!]!, 'off')
    else if (value === 'off') {
      setCell(doc.lines[row!]!, 'off')
      const comment = `<!-- amp Verify command: ${command} -->`
      if (after && remembered !== undefined) after.text = comment
      else insert(doc, table.end, [comment])
    } else if (remembered !== undefined) {
      setCell(doc.lines[row!]!, remembered)
      doc.lines.splice(table.end, 1)
    } else doc.lines.splice(row!, 1)
  }
  return doc.bom + doc.lines.map(line => line.text + line.eol).join('')
}
