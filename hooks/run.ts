/*
 * The amp ledger, `.amp/<key>/progress.md`, read the way the skills write it (spec §5.1): plain
 * lines, a few of known form, the last value of each winning. Pure: the hooks modules feed it text.
 */

export type Stage = 'grill' | 'gate' | 'design' | 'plan' | 'build' | 'ship' | 'merged' | 'stopped' | 'unknown'
export type TaskRow = { id: string; state: 'started' | 'fixing' | 'complete' | 'dropped'; text: string; round?: number; worktree?: string }
export type Run = {
  key: string; ledgerPath: string; stage: Stage; note: string; branch?: string; planPath?: string
  tasks: TaskRow[]; parked: number; rulings: number
  fallbacks: string[]; parallelOff?: string; tail: string[]   // tail = last 5 non-blank lines
}

const STAGES: readonly Stage[] = ['grill', 'gate', 'design', 'plan', 'build', 'ship', 'merged', 'stopped']

/** Applies a task line to its row (spec §5.6): a line of known form sets the state, any other only the text. */
function applyTaskLine(row: TaskRow, text: string): void {
  row.text = text
  let m: RegExpMatchArray | null
  if ((m = text.match(/^started \((?:worktree (.+)|main tree), base /))) {
    row.state = 'started'
    delete row.round
    if (m[1]) row.worktree = m[1]
    else delete row.worktree
  } else if ((m = text.match(/^fix round (\d+)\//))) {
    row.state = 'fixing'
    row.round = Number(m[1])
  } else if (text.startsWith('rebased (base')) {
    row.state = 'started'
    delete row.round
  } else if (text.startsWith('complete') || text.startsWith('dropped')) {
    row.state = text.startsWith('complete') ? 'complete' : 'dropped'
    delete row.round
    delete row.worktree
  }
}

export function parseLedger(key: string, ledgerPath: string, text: string): Run {
  const run: Run = { key, ledgerPath, stage: 'unknown', note: '', tasks: [], parked: 0, rulings: 0, fallbacks: [], tail: [] }
  const lines = text.split(/\r?\n/).map(line => line.trimEnd()).filter(line => line !== '')
  const after = (line: string, prefix: string) => (line.startsWith(prefix) ? line.slice(prefix.length) : undefined)
  for (const line of lines) {
    let m: RegExpMatchArray | null
    let value: string | undefined
    if ((m = line.match(/^# amp ledger — plan: (.+?) — branch: (.+)$/))) [, run.planPath, run.branch] = m
    else if ((m = line.match(/^Stage: (\w+)(?: — (.*))?$/)) && STAGES.includes(m[1] as Stage)) {
      run.stage = m[1] as Stage
      run.note = m[2] ?? ''
    } else if ((value = after(line, 'Branch: '))) run.branch = value
    else if ((value = after(line, 'Plan: '))) run.planPath = value
    else if ((m = line.match(/^Task (\d+[a-z]?): (.*)$/))) {
      const [, id = '', rest = ''] = m
      let row = run.tasks.find(t => t.id === id)
      if (!row) run.tasks.push((row = { id, state: 'started', text: rest }))
      applyTaskLine(row, rest)
      if (rest.startsWith('minor (deferred)')) run.parked++
      const parked = rest.startsWith('complete') && rest.match(/\| (\d+) parked\)/)
      if (parked) run.parked += Number(parked[1])
    } else if (line.startsWith('Ruling: ')) run.rulings++
    else if ((value = after(line, 'Fallback: '))) run.fallbacks.push(value)
    else if ((value = after(line, 'Parallel: off — '))) run.parallelOff = value
  }
  run.tail = lines.slice(-5)
  return run
}

/** The number of `### Task N:` headings in a plan. */
export function planTaskCount(planText: string): number {
  return planText.match(/^### Task \d+[a-z]?:/gm)?.length ?? 0
}

/**
 * The status line: `amp <key> · <stage>`, then during build the active (started or fixing) tasks in
 * first-seen order (spec §5.7): none gives the next task, one its id and fix round, more each id
 * with its round. With active tasks and a known total, the done count follows.
 */
export function statusText(run: Run, total?: number): string {
  const text = `amp ${run.key} · ${run.stage}`
  if (run.stage !== 'build') return text
  const done = run.tasks.filter(t => t.state === 'complete').length
  const active = run.tasks.filter(t => t.state === 'started' || t.state === 'fixing')
  if (active.length === 0) return `${text} · task ${total === undefined ? done + 1 : `${Math.min(done + 1, total)}/${total}`}`
  const [one] = active
  const tasks = one && active.length === 1
    ? ` · task ${one.id}${one.state === 'fixing' ? ` · fix r${one.round}/5` : ''}`
    : ` · tasks ${active.map(t => (t.state === 'fixing' ? `${t.id} r${t.round}` : t.id)).join(', ')}`
  return `${text}${tasks}${total === undefined ? '' : ` · ${done}/${total} done`}`
}

/** The system-prompt section that tells a resumed session this branch has an unfinished run. */
export function resumeText(run: Run): string {
  const last = run.tasks.at(-1)
  return [
    `# amp run in progress (${run.key})`,
    `Stage: ${run.stage}${run.note ? ` — ${run.note}` : ''}`,
    `Ledger: ${run.ledgerPath}`,
    run.branch && `Branch: ${run.branch}`,
    run.planPath && `Plan: ${run.planPath}`,
    last && `Last task line: Task ${last.id}: ${last.text}`,
    `An unfinished amp run owns this branch. When the user asks to continue, resume it with amp:phase ${run.key}: the ledger and git log are the ground truth. Don't start unrelated work on this branch without saying so.`,
  ].filter(Boolean).join('\n')
}
