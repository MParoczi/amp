import { describe, expect, test } from 'claude-code/testing'

import { parseLedger, planTaskCount, resumeText, statusText } from './run'

const LEDGER = '.amp/04-x/progress.md'

/** One ledger line of every form a mod reads, plus free text. */
const FIXTURE = [
  '# amp ledger — 04-x',
  'Stage: grill',
  'free text the parser ignores',
  'Stage: build — tasks',
  'Branch: feature/04-x',
  'Plan: docs/amp/plans/p.md',
  'Task 1: complete (commits a..b, review clean)',
  'Task 2: minor (deferred): x',
  'Task 2: complete (commits c..d, review clean | 2 parked)',
  '',
  'Task 3a: fix round 2/5 (1 addressed, 1 open — y; commits e..f)',
  'Ruling: r — w — c',
  'Fallback: reviewer → sonnet (429)',
  'Pipeline: off — conflict',
  '',
].join('\r\n')

describe('amp ledger parser', () => {
  test('every line form is read, the last value winning', async () => {
    const run = parseLedger('04-x', LEDGER, FIXTURE)
    expect(run.key).toBe('04-x')
    expect(run.ledgerPath).toBe(LEDGER)
    expect(run.stage).toBe('build')
    expect(run.note).toBe('tasks')
    expect(run.branch).toBe('feature/04-x')
    expect(run.planPath).toBe('docs/amp/plans/p.md')
    expect(run.tasks.map(t => t.id)).toEqual(['1', '2', '3a'])
    expect(run.tasks.map(t => t.state)).toEqual(['complete', 'complete', 'fixing'])
    expect(run.tasks[2]?.text).toBe('fix round 2/5 (1 addressed, 1 open — y; commits e..f)')
    expect(run.fixRound).toEqual({ task: '3a', round: 2 })
    expect(run.parked).toBe(3)
    expect(run.rulings).toBe(1)
    expect(run.fallbacks.length).toBe(1)
    expect(run.pipelineOff).toBe('conflict')
    expect(run.tail.length).toBe(5)
    expect(run.tail[4]).toBe('Pipeline: off — conflict')
  })

  test('the remaining task states, and a later task line ends the fix round', async () => {
    const run = parseLedger('k', LEDGER, [
      'Stage: build',
      'Task 1: fix round 1/5 (1 addressed, 0 open; commits a..b)',
      'Task 2: pipelined (wt-2)',
      'Task 3: merged (base a..b)',
      'Task 4: pipeline dropped — conflict',
      'Task 5: dispatched',
    ].join('\n'))
    expect(run.tasks.map(t => t.state)).toEqual(['fixing', 'pipelined', 'merged', 'dropped', 'started'])
    expect(run.fixRound).toBeUndefined()
    expect(run.note).toBe('')
  })

  test('the old header gives plan and branch; a stage-less ledger is unknown', async () => {
    const run = parseLedger('k', LEDGER, '# amp ledger — plan: p.md — branch: b\n')
    expect(run.planPath).toBe('p.md')
    expect(run.branch).toBe('b')
    expect(run.stage).toBe('unknown')
    expect(run.tasks).toEqual([])
    expect(run.parked).toBe(0)
  })

  test('the status line counts tasks and shows the fix round', async () => {
    const run = parseLedger('04-x', LEDGER, FIXTURE)
    expect(statusText(run, 7)).toBe('amp 04-x · build · task 3/7 · fix r2/5')
    expect(statusText(run)).toContain('task 3 ·')
    expect(statusText(run, 2)).toBe('amp 04-x · build · task 2/2 · fix r2/5')
    expect(statusText(parseLedger('04-x', LEDGER, 'Stage: gate'), 7)).toBe('amp 04-x · gate')
  })

  test('plan tasks are counted by their headings', async () => {
    expect(planTaskCount('### Task 1: a\n### Task 2a: b')).toBe(2)
    expect(planTaskCount('# Plan\n### Tasks\n#### Task 1: no')).toBe(0)
  })

  test('the resume section names the run and how to continue it', async () => {
    const text = resumeText(parseLedger('04-x', LEDGER, FIXTURE))
    expect(text).toContain('# amp run in progress (04-x)')
    expect(text).toContain(LEDGER)
    expect(text).toContain('amp:phase 04-x')
    expect(text).toContain('build — tasks')
    expect(text).toContain('feature/04-x')
    expect(text).toContain('docs/amp/plans/p.md')
    expect(text).toContain('Task 3a: fix round 2/5')
  })
})
