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
  'Parallel: off — conflict',
  '',
].join('\r\n')

/** Four tasks in worktrees, their lines interleaved: fix rounds, a completion, a drop and a rebase. */
const PARALLEL = [
  'Stage: build',
  'Task 1: started (worktree .amp/k/wt-1, base a1)',
  'Task 2: started (worktree .amp/k/wt-2, base a1)',
  'Task 3: started (worktree .amp/k/wt-3, base a1)',
  'Task 4: started (worktree .amp/k/wt-4, base a1)',
  'Task 1: fix round 2/5 (…)',
  'Task 3: fix round 1/5 (…)',
  'Task 4: fix round 1/5 (…)',
  'Task 2: complete (commits a..b, review clean)',
  'Task 2: minor (deferred): x',
  'Task 3: dropped — conflict',
  'Task 4: rebased (base c3)',
].join('\n')

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
    expect(run.tasks[2]?.round).toBe(2)
    expect(run.parked).toBe(3)
    expect(run.rulings).toBe(1)
    expect(run.fallbacks.length).toBe(1)
    expect(run.parallelOff).toBe('conflict')
    expect(run.tail.length).toBe(5)
    expect(run.tail[4]).toBe('Parallel: off — conflict')
  })

  test('parallel tasks keep their own state, fix round and worktree', async () => {
    const run = parseLedger('k', LEDGER, PARALLEL)
    expect(run.tasks.map(t => t.state)).toEqual(['fixing', 'complete', 'dropped', 'started'])
    expect(run.tasks[0]).toMatchObject({ round: 2, worktree: '.amp/k/wt-1' })
    expect(run.tasks[1]?.worktree).toBeUndefined()
    expect(run.tasks[2]?.round).toBeUndefined()
    expect(run.tasks[2]?.worktree).toBeUndefined()
    expect(run.tasks[3]?.round).toBeUndefined()
    expect(run.tasks[3]?.worktree).toBe('.amp/k/wt-4')
    expect(run.note).toBe('')
  })

  test('a line that sets no state starts a new row as started', async () => {
    expect(parseLedger('k', LEDGER, 'Task 5: minor (deferred): x').tasks.map(t => [t.id, t.state])).toEqual([['5', 'started']])
  })

  test('the old header gives plan and branch; a stage-less ledger is unknown', async () => {
    const run = parseLedger('k', LEDGER, '# amp ledger — plan: p.md — branch: b\n')
    expect(run.planPath).toBe('p.md')
    expect(run.branch).toBe('b')
    expect(run.stage).toBe('unknown')
    expect(run.tasks).toEqual([])
    expect(run.parked).toBe(0)
  })

  test('the status line names the active tasks with their fix rounds', async () => {
    const run = parseLedger('04-x', LEDGER, FIXTURE)
    expect(statusText(run, 7)).toBe('amp 04-x · build · task 3a · fix r2/5 · 2/7 done')
    expect(statusText(run)).toBe('amp 04-x · build · task 3a · fix r2/5')
    const one = ['Stage: build', 'Task 2: complete (…)', 'Task 3: complete (…)', 'Task 1: started (main tree, base a)'].join('\n')
    expect(statusText(parseLedger('k', LEDGER, one), 7)).toBe('amp k · build · task 1 · 2/7 done')
    expect(statusText(parseLedger('k', LEDGER, 'Stage: build\nTask 1: complete (…)'), 7)).toBe('amp k · build · task 2/7')
    expect(statusText(parseLedger('k', LEDGER, PARALLEL), 7)).toBe('amp k · build · tasks 1 r2, 4 · 1/7 done')
    expect(statusText(parseLedger('k', LEDGER, PARALLEL))).toBe('amp k · build · tasks 1 r2, 4')
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
