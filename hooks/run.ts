/*
 * The amp ledger, `.amp/<key>/progress.md`, read the way the skills write it (spec §5.1): plain
 * lines, a few of known form, the last value of each winning. Pure: the hooks modules feed it text.
 */

export type Stage = 'grill' | 'gate' | 'design' | 'plan' | 'build' | 'ship' | 'merged' | 'stopped' | 'unknown'
export type TaskRow = { id: string; state: 'complete' | 'fixing' | 'pipelined' | 'merged' | 'dropped' | 'started'; text: string }
export type Run = {
  key: string; ledgerPath: string; stage: Stage; note: string; branch?: string; planPath?: string
  tasks: TaskRow[]; fixRound?: { task: string; round: number }; parked: number; rulings: number
  fallbacks: string[]; pipelineOff?: string; tail: string[]   // tail = last 5 non-blank lines
}

const STAGES: readonly Stage[] = ['grill', 'gate', 'design', 'plan', 'build', 'ship', 'merged', 'stopped']

/** A task line's state, from how its text starts. */
function taskState(text: string): TaskRow['state'] {
  if (text.startsWith('complete')) return 'complete'
  if (/^fix round \d+\//.test(text)) return 'fixing'
  if (text.startsWith('pipelined')) return 'pipelined'
  if (text.startsWith('merged (base')) return 'merged'
  if (text.startsWith('pipeline dropped')) return 'dropped'
  return 'started'
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
      const state = taskState(rest)
      const row = run.tasks.find(t => t.id === id)
      if (row) Object.assign(row, { state, text: rest })
      else run.tasks.push({ id, state, text: rest })
      const round = rest.match(/^fix round (\d+)\//)
      run.fixRound = round ? { task: id, round: Number(round[1]) } : undefined
      if (rest.startsWith('minor (deferred)')) run.parked++
      const parked = state === 'complete' && rest.match(/\| (\d+) parked\)/)
      if (parked) run.parked += Number(parked[1])
    } else if (line.startsWith('Ruling: ')) run.rulings++
    else if ((value = after(line, 'Fallback: '))) run.fallbacks.push(value)
    else if ((value = after(line, 'Pipeline: off — '))) run.pipelineOff = value
  }
  run.tail = lines.slice(-5)
  return run
}

/** The number of `### Task N:` headings in a plan. */
export function planTaskCount(planText: string): number {
  return planText.match(/^### Task \d+[a-z]?:/gm)?.length ?? 0
}

/** The status line: `amp <key> · <stage>`, then the task and fix round during build. */
export function statusText(run: Run, total?: number): string {
  let text = `amp ${run.key} · ${run.stage}`
  if (run.stage === 'build') {
    const done = run.tasks.filter(t => t.state === 'complete').length
    text += total === undefined ? ` · task ${done + 1}` : ` · task ${Math.min(done + 1, total)}/${total}`
  }
  if (run.fixRound) text += ` · fix r${run.fixRound.round}/5`
  return text
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
