import { describe, expect, test } from 'claude-code/testing'

import { STEPS, STEP_HELP, hasStepRows, readSteps, setStep } from './steps'

/** The block a change writes when there is no file (spec §5.1). */
const BLOCK = '## amp configuration\n\n| Key | Value |\n|---|---|\n| Grill | on |\n| Tests | on |\n| Document reviews | on |\n| Task reviews | on |\n| Final review | on |\n| CI | on |\n'
const TABLE = BLOCK.slice('## amp configuration\n\n'.length)
const ALL_ON = { Grill: 'on', Tests: 'on', Verify: 'on', 'Document reviews': 'on', 'Task reviews': 'on', 'Final review': 'on', CI: 'on' }

describe('amp step switches', () => {
  test('readSteps: no file, no section or no table is all on', async () => {
    expect(readSteps(undefined)).toEqual(ALL_ON)
    expect(readSteps('# P\n\nText | with a pipe\n')).toEqual(ALL_ON)
    expect(readSteps('## amp configuration\n\nNo table.\n')).toEqual(ALL_ON)
    expect(readSteps('# P\n| Grill | off |\n## amp configuration\n')).toEqual(ALL_ON)
  })

  test('readSteps: mixed rows, backticked and upper-case values, invalid values, duplicates', async () => {
    const text = '## amp configuration\n\n| Key | Value |\n|---|---|\n| `Tests` | `OFF` |\n| grill | maybe |\n| ci | Off |\n| CI | on |\n| Verify | `pnpm test` |\n| Task reviews |off\n\n## Next\n| Final review | off |\n'
    expect(readSteps(text)).toEqual({ ...ALL_ON, Tests: 'off', CI: 'off', 'Task reviews': 'off' })
    expect(readSteps(BLOCK + '| Verify | off |\n').Verify).toBe('off')
  })

  test('readSteps: the header and delimiter lines are not rows', async () => {
    expect(readSteps('## amp configuration\n| Grill | off |\n| CI | off |\n| Tests | off |\n').Tests).toBe('off')
    expect(readSteps('## amp configuration\n| Grill | off |\n| CI | off |\n| Tests | off |\n').Grill).toBe('on')
  })

  test('hasStepRows holds when all six on/off rows are in the table', async () => {
    expect(hasStepRows(undefined)).toBe(false)
    expect(hasStepRows('# P\n')).toBe(false)
    expect(hasStepRows(BLOCK)).toBe(true)
    expect(hasStepRows(BLOCK.replace('| CI | on |\n', ''))).toBe(false)
    expect(hasStepRows(BLOCK.replace('| CI | on |', '| `ci` | off |'))).toBe(true)
  })

  test('STEP_HELP holds one line per step', async () => {
    expect(STEPS).toEqual(['Grill', 'Tests', 'Verify', 'Document reviews', 'Task reviews', 'Final review', 'CI'])
    expect(STEP_HELP).toEqual({
      Grill: 'off: no interview and no gate; open decisions become rulings in the PR',
      Tests: 'off: no new tests are written; existing tests stay green',
      Verify: 'off: the local verify run before the PR is skipped',
      'Document reviews': 'off: no independent review of spec, plan or roadmap',
      'Task reviews': 'off: no per-task review and no fix loop',
      'Final review': 'off: no whole-branch review',
      CI: 'off: the PR merges without waiting for checks',
    })
  })

  test('setStep rule 1: a step that already has the value leaves the text alone', async () => {
    expect(setStep(undefined, 'CI', 'on')).toBe('')
    expect(setStep('# P\n', 'Grill', 'on')).toBe('# P\n')
    const partial = '## amp configuration\n\n| Key | Value |\n|---|---|\n| CI | off |\n'
    expect(setStep(partial, 'CI', 'off')).toBe(partial)
    expect(setStep(BLOCK.replace('| Grill | on |', '| Grill | maybe |'), 'Grill', 'on')).toBe(BLOCK.replace('| Grill | on |', '| Grill | maybe |'))
  })

  test('setStep with no text or no section writes the block', async () => {
    expect(setStep(undefined, 'CI', 'off')).toBe(BLOCK.replace('| CI | on |', '| CI | off |'))
    expect(setStep('', 'CI', 'off')).toBe(BLOCK.replace('| CI | on |', '| CI | off |'))
    expect(setStep('# P\n', 'Tests', 'off')).toBe('# P\n\n' + BLOCK.replace('| Tests | on |', '| Tests | off |'))
    expect(setStep('# P', 'Tests', 'off').startsWith('# P\n\n## amp configuration\n')).toBe(true)
    expect(setStep('# P\n\n', 'Grill', 'off')).toBe('# P\n\n' + BLOCK.replace('| Grill | on |', '| Grill | off |'))
    expect(setStep('# P\n\n\n\n', 'Grill', 'off')).toBe('# P\n\n\n\n' + BLOCK.replace('| Grill | on |', '| Grill | off |'))
    expect(setStep('# P\r\n', 'Grill', 'off')).toBe('# P\r\n\r\n' + BLOCK.replace('| Grill | on |', '| Grill | off |').replace(/\n/g, '\r\n'))
  })

  test('setStep in a section without a table inserts the table after the heading', async () => {
    const off = TABLE.replace('| CI | on |', '| CI | off |')
    expect(setStep('# P\n## amp configuration\nProse.\n', 'CI', 'off')).toBe('# P\n## amp configuration\n\n' + off + '\nProse.\n')
    expect(setStep('# P\n## amp configuration\n\nProse.\n', 'CI', 'off')).toBe('# P\n## amp configuration\n\n' + off + '\nProse.\n')
    expect(setStep('## amp configuration\n## Next\n', 'CI', 'off')).toBe('## amp configuration\n\n' + off + '\n## Next\n')
    expect(setStep('##  AMP Configuration  \n\n## Next\n', 'CI', 'off')).toBe('##  AMP Configuration  \n\n' + off + '\n## Next\n')
    expect(setStep('# P\n## amp configuration', 'CI', 'off')).toBe('# P\n## amp configuration\n\n' + off + '\n')
  })

  test('setStep in a table keeps its other rows and appends the missing ones in step order', async () => {
    const text = '## amp configuration\n\n| Key | Value |\n|---|---|\n| Model | opus |\n| `final REVIEW` | on |\n| Tests | on |\n\n### Notes\nAfter.'
    expect(setStep(text, 'Final review', 'off')).toBe('## amp configuration\n\n| Key | Value |\n|---|---|\n| Model | opus |\n| `final REVIEW` | off |\n| Tests | on |\n| Grill | on |\n| Document reviews | on |\n| Task reviews | on |\n| CI | on |\n\n### Notes\nAfter.')
  })

  test('setStep keeps CRLF and a row with no closing pipe', async () => {
    // a table with other keys keeps them; missing rows are appended in step order; CRLF is kept;
    // a row with no closing pipe keeps none and its value gets the leading space only (spec §5.1 rule 3)
    const crlf = '## amp configuration\r\n\r\n| Key | Value |\r\n|---|---|\r\n| Verify | `pnpm test` |\r\n| grill | ON\r\n\r\nAfter.\r\n'
    expect(setStep(crlf, 'Grill', 'off')).toBe('## amp configuration\r\n\r\n| Key | Value |\r\n|---|---|\r\n| Verify | `pnpm test` |\r\n| grill | off\r\n| Tests | on |\r\n| Document reviews | on |\r\n| Task reviews | on |\r\n| Final review | on |\r\n| CI | on |\r\n\r\nAfter.\r\n')
  })

  test('setStep on a table that ends the file without a newline terminates it first', async () => {
    const text = BLOCK.slice(0, -1)
    expect(setStep(text, 'CI', 'off')).toBe(text.replace('| CI | on |', '| CI | off |'))
    expect(setStep(text.replace('\n| CI | on |', ''), 'Grill', 'off')).toBe(BLOCK.replace('| Grill | on |', '| Grill | off |'))
    expect(setStep(text, 'Verify', 'off')).toBe(BLOCK + '| Verify | off |\n')
  })

  test('setStep keeps several trailing blank lines and the text around the section', async () => {
    const text = '# P\n\n' + BLOCK + '\n\n\n'
    expect(setStep(text, 'Tests', 'off')).toBe(text.replace('| Tests | on |', '| Tests | off |'))
    const next = BLOCK + '## Next\n| Tests | on |\n'
    expect(setStep(next, 'Tests', 'off')).toBe(next.replace('| Tests | on |', '| Tests | off |'))
  })

  test('setStep keeps a leading byte-order mark', async () => {
    expect(setStep('﻿' + BLOCK, 'CI', 'off')).toBe('﻿' + BLOCK.replace('| CI | on |', '| CI | off |'))
    expect(readSteps('﻿' + BLOCK.replace('| CI | on |', '| CI | off |')).CI).toBe('off')
    expect(setStep('﻿# P\n', 'CI', 'off')).toBe('﻿# P\n\n' + BLOCK.replace('| CI | on |', '| CI | off |'))
  })

  test('setStep edits the first of duplicate rows and rewrites an invalid value', async () => {
    const text = BLOCK + '| CI | off |\n'
    expect(setStep(text, 'CI', 'off')).toBe(BLOCK.replace('| CI | on |', '| CI | off |') + '| CI | off |\n')
    expect(setStep(BLOCK.replace('| Grill | on |', '| Grill |  maybe  |'), 'Grill', 'off')).toBe(BLOCK.replace('| Grill | on |', '| Grill | off |'))
  })

  test('setStep leaves a section whose first pipe run is a single line unchanged', async () => {
    const header = '## amp configuration\n| Key | Value |\n'
    const note = '## amp configuration\n\n| a note starting with a pipe\n\n## Next\n'
    expect(setStep(header, 'Grill', 'off')).toBe(header)
    expect(setStep(note, 'Grill', 'off')).toBe(note)
    expect(setStep(note, 'CI', 'off')).toBe(note)
    expect(setStep(note, 'Verify', 'off')).toBe(note)
  })

  test('setStep Verify: an empty value is no command', async () => {
    expect(setStep(BLOCK + '| Verify | |\n', 'Verify', 'off')).toBe(BLOCK + '| Verify | off |\n')
    expect(setStep(BLOCK + '| Verify |\n', 'Verify', 'off')).toBe(BLOCK + '| Verify | off |\n')
    expect(setStep(BLOCK + '| Verify |\n\nTail\n', 'Verify', 'off')).toBe(BLOCK + '| Verify | off |\n\nTail\n')
    expect(setStep(setStep(BLOCK + '| Verify | |\n', 'Verify', 'off'), 'Verify', 'on')).toBe(BLOCK)
  })

  test('setStep Verify: off remembers the command, on restores it', async () => {
    // Verify round trip, with backticks and an escaped pipe
    const withCmd = BLOCK + '| Verify | `a \\| b` && c |\n\nTail\n'
    const off = setStep(withCmd, 'Verify', 'off')
    expect(off).toBe(BLOCK + '| Verify | off |\n<!-- amp Verify command: `a \\| b` && c -->\n\nTail\n')
    expect(setStep(off, 'Verify', 'on')).toBe(withCmd)
    expect(setStep(BLOCK + '| Verify | off |\n', 'Verify', 'on')).toBe(BLOCK)          // nothing remembered: row removed
    expect(setStep(BLOCK, 'Verify', 'off')).toBe(BLOCK + '| Verify | off |\n')
    expect(setStep(BLOCK + '| Verify | a --> b |\n', 'Verify', 'off')).toBe(BLOCK + '| Verify | a --> b |\n')   // can't be remembered
  })

  test('setStep Verify: a row mid-table, no closing pipe, no file, a stale comment', async () => {
    const mid = BLOCK.replace('| Tests | on |\n', '| Tests | on |\n| verify | make check\n')
    expect(setStep(mid, 'Verify', 'off')).toBe(BLOCK.replace('| Tests | on |\n', '| Tests | on |\n| verify | off\n') + '<!-- amp Verify command: make check -->\n')
    expect(setStep(setStep(mid, 'Verify', 'off'), 'Verify', 'on')).toBe(mid)
    expect(setStep(undefined, 'Verify', 'off')).toBe(BLOCK + '| Verify | off |\n')
    const stale = BLOCK + '| Verify | new |\n<!-- amp Verify command: old -->\n'
    expect(setStep(stale, 'Verify', 'off')).toBe(BLOCK + '| Verify | off |\n<!-- amp Verify command: new -->\n')
    const far = BLOCK + '| Verify | off |\n\n<!-- amp Verify command: old -->\n'
    expect(setStep(far, 'Verify', 'on')).toBe(BLOCK + '\n<!-- amp Verify command: old -->\n')
    const crlf = BLOCK.replace(/\n/g, '\r\n') + '| Verify | x |'
    expect(setStep(crlf, 'Verify', 'off')).toBe(BLOCK.replace(/\n/g, '\r\n') + '| Verify | off |\r\n<!-- amp Verify command: x -->\r\n')
  })
})
