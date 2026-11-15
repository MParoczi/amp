import { describe, expect, test, type Engine } from 'claude-code/testing'
import type { AgentInfo, FsEntry, On } from 'claude-code'

import { parseLedger, statusText } from './run'
import { STEPS, STEP_HELP, setStep } from './steps'

/*
 * The host the run hooks see. The kit has no fs, network or process: these test hooks sit beneath
 * the plugin and answer `$.fs`, `$.process.run`, `$.agent.list`, `$.ui.status`, `$.ui.toast`,
 * `$.ui.open`, `$.audio.play`, plus the bottoms a session start, a command, a prompt (with the
 * session model), a tool call and a finished turn need.
 */
type Exit = { exitCode: number; stdout?: string; stderr?: string }
type Host = {
  files: Map<string, { text: string; mtimeMs: number; unreadable?: true }>   // absolute, '/'-separated; unreadable: stat answers, read rejects
  git: Record<string, string | Error | Exit>                 // argv.join(' ') → stdout (exit 0) | failure | exit
  agents: { id: string; type: string }[]
  cwd: string                                               // what $.session.cwd() answers
  runs: string[][]; writes: { path: string; text: string }[]; opened: string[]   // every process.run argv, fs.write and ui.open id, in order
  status: (string | undefined)[]; toasts: string[]; sounds: string[]
}

function fakeHost(on: On, init: Partial<Pick<Host, 'files' | 'git' | 'agents' | 'cwd'>> = {}): Host {
  const host: Host = {
    files: init.files ?? new Map(), git: init.git ?? {}, agents: init.agents ?? [], cwd: init.cwd ?? '/repo',
    runs: [], writes: [], opened: [], status: [], toasts: [], sounds: [],
  }
  // The engine hands the hooks an absolute path in the platform's spelling (`C:\repo\.amp` on Windows).
  const norm = (path: string) => path.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, '').replace(/\/+$/, '')
  const missing = (path: string) => ({ deny: `ENOENT: ${path}` })

  on('fs.list', (_, e) => {
    const dir = `${norm(e.path)}/`
    const entries = new Map<string, FsEntry>()
    for (const [path, file] of host.files) {
      if (!path.startsWith(dir)) continue
      const [name = '', ...rest] = path.slice(dir.length).split('/')
      entries.set(name, rest.length > 0
        ? { name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false }
        : { name, kind: 'file', size: file.text.length, mtimeMs: file.mtimeMs, isLink: false })
    }
    return entries.size > 0 ? { value: [...entries.values()] } : missing(e.path)
  })
  on('fs.stat', (_, e) => {
    const file = host.files.get(norm(e.path))
    return file ? { value: { kind: 'file', size: file.text.length, mtimeMs: file.mtimeMs, isLink: false } } : missing(e.path)
  })
  on('fs.read', (_, e) => {
    const file = host.files.get(norm(e.path))
    if (file === undefined) return missing(e.path)
    return file.unreadable ? { deny: 'EACCES: permission denied' } : { value: file.text }
  })
  on('fs.exists', (_, e) => ({ value: host.files.has(norm(e.path)) }))
  on('fs.write', (_, e) => {
    host.writes.push({ path: norm(e.path), text: e.text })
    host.files.set(norm(e.path), { text: e.text, mtimeMs: 1000 + host.writes.length })
    return { value: undefined }
  })
  on('process.run', (_, e) => {
    host.runs.push([...e.argv])
    const out = host.git[e.argv.join(' ')]
    const exit = typeof out === 'string' ? { exitCode: 0, stdout: out } : out instanceof Error ? undefined : out
    return exit
      ? { value: { stdout: '', stderr: '', ...exit, isStdoutTruncated: false, isStderrTruncated: false } }
      : { deny: out instanceof Error ? out.message : `no fake for ${e.argv.join(' ')}` }
  })
  on('agent.list', () => ({ value: host.agents.map((a): AgentInfo => ({ ...a, description: '', status: 'running' })) }))
  on('ui.status', (_, e) => {
    host.status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    host.toasts.push(e.text)
    return { value: undefined }
  })
  on('audio.play', (_, e) => {
    host.sounds.push(e.clip.asset ?? '')
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    host.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('prompt.compose', () => ({ sections: [] }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: host.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return host
}

const ROOT = '/repo'
const LEDGER = `${ROOT}/.amp/04-x/progress.md`
const PLAN = 'docs/amp/plans/p.md'
const TEXT = [
  '# amp ledger — 04-x',
  'Stage: build — tasks',
  'Branch: feature/x',
  `Plan: ${PLAN}`,
  'Task 1: complete (commits a..b, review clean)',
  'Task 2: complete (commits c..d, review clean)',
  'Task 3a: fix round 2/5 (1 addressed, 1 open — y; commits e..f)',
  'Task 4: started (worktree .amp/04-x/wt-4, base a)',
].join('\n')
const PLAN_TEXT = [1, 2, '3a', '3b', 4, 5, 6].map(n => `### Task ${n}: t`).join('\n')
const GIT = {
  'git rev-parse --show-toplevel': `${ROOT}\n`,
  'git symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
  'git branch --show-current': 'feature/x\n',
}
const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
const COMPOSE = { model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: ['Agent'], outputStyle: null, traits: [] } as const
const MESSAGES = [{ role: 'user' as const, text: 'hi', toolUses: [] }]
const RUN = { command: 'amp-run', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const PANE = {
  plugin: 'amp',
  component: 'Pane',
  requestId: 'amp-run',
  props: { title: 'amp run', isFocused: true, bodyColumns: 80, placement: 'dock' },
} as const

/** A files map holding the given ledger texts (by key, oldest first) and the plan. */
function files(ledgers: Record<string, string>) {
  const map = new Map([[`${ROOT}/${PLAN}`, { text: PLAN_TEXT, mtimeMs: 1 }]])
  Object.entries(ledgers).forEach(([key, text], at) => map.set(`${ROOT}/.amp/${key}/progress.md`, { text, mtimeMs: 100 + at }))
  return map
}

/** A run still in its grill: no Branch line yet. */
const NO_BRANCH = '# amp ledger — 04-x\nStage: grill'

/** The ids of the sections the plugin adds to an empty prompt of a loop that has the Agent tool, routing aside. */
async function sectionIds($: Engine) {
  const { sections } = await $.prompt.compose(COMPOSE)
  return sections.map(s => s.id).filter(id => id !== 'amp:routing')
}

describe('amp run hooks', () => {
  test('no .amp: no status, /amp-run says so, no resume section', async ($, on) => {
    const host = fakeHost(on, { git: GIT })
    await $.session.start(START)
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(host.status).toEqual([undefined])
    expect((await $.command.run(RUN)).text).toBe('No amp run in this repository.')
    expect(await sectionIds($)).toEqual([])
  })

  test('a ledger created after session start is picked up at the next tool call', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({}) })
    await $.session.start(START)
    expect(host.status).toEqual([undefined])
    host.files.set(LEDGER, { text: TEXT, mtimeMs: 200 })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(host.status.at(-1)).toBe(statusText(parseLedger('04-x', '.amp/04-x/progress.md', TEXT), 7))
    expect(host.status.at(-1)).toBe('amp 04-x · build · tasks 3a r2, 4 · 2/7 done')
  })

  test('the resume section needs the run branch to be the current one', async ($, on) => {
    fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    const { sections } = await $.prompt.compose(COMPOSE)
    expect(sections.map(s => [s.id, s.scope])).toEqual([['amp:routing', 'session'], ['amp:resume', 'session']])
    expect(sections[1]?.text).toContain('# amp run in progress (04-x)')
  })

  test('a loop without the Agent tool gets no resume section', async ($, on) => {
    fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    expect((await $.prompt.compose({ ...COMPOSE, tools: ['Bash'] })).sections).toEqual([])
  })

  test('the plan total is counted again once the plan is written', async ($, on) => {
    const planning = ['# amp ledger — 04-x', 'Stage: plan', 'Branch: feature/x', `Plan: ${PLAN}`].join('\n')
    const host = fakeHost(on, { git: GIT, files: new Map([[LEDGER, { text: planning, mtimeMs: 100 }]]) })
    await $.session.start(START)
    expect(host.status.at(-1)).toBe('amp 04-x · plan')
    host.files.set(`${ROOT}/${PLAN}`, { text: PLAN_TEXT, mtimeMs: 150 })
    host.files.set(LEDGER, { text: TEXT, mtimeMs: 200 })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(host.status.at(-1)).toBe('amp 04-x · build · tasks 3a r2, 4 · 2/7 done')
  })

  test('a mismatched branch adds no resume section', async ($, on) => {
    fakeHost(on, { git: { ...GIT, 'git branch --show-current': 'feature/other\n' }, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    expect(await sectionIds($)).toEqual([])
  })

  for (const [branch, ids] of [['main', ['amp:resume']], ['feature/y', []]] as const) {
    test(`a ledger with no Branch resumes on the default branch only (${branch})`, async ($, on) => {
      fakeHost(on, { git: { ...GIT, 'git branch --show-current': `${branch}\n` }, files: files({ '04-x': NO_BRANCH }) })
      await $.session.start(START)
      expect(await sectionIds($)).toEqual([...ids])
    })
  }

  const CHAIN = [
    ['origin HEAD', { 'git symbolic-ref --short refs/remotes/origin/HEAD': 'origin/trunk\n' }, 'trunk'],
    ['init.defaultBranch', { 'git symbolic-ref --short refs/remotes/origin/HEAD': new Error('no origin'), 'git config init.defaultBranch': 'dev\n' }, 'dev'],
    ['main', { 'git symbolic-ref --short refs/remotes/origin/HEAD': new Error('no origin'), 'git config init.defaultBranch': new Error('unset') }, 'main'],
  ] as const
  for (const [name, git, branch] of CHAIN) {
    test(`the default branch comes from ${name}`, async ($, on) => {
      const host = fakeHost(on, { git: { ...GIT, ...git }, files: files({ '04-x': NO_BRANCH }) })
      await $.session.start(START)
      for (const current of ['main', 'trunk', 'dev'].filter(b => b !== branch)) {
        host.git['git branch --show-current'] = `${current}\n`
        expect(await sectionIds($)).toEqual([])
      }
      host.git['git branch --show-current'] = `${branch}\n`
      expect(await sectionIds($)).toEqual(['amp:resume'])
    })
  }

  test('an oversized and an unreadable candidate are skipped; the valid ledger stays active', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': TEXT, '05-big': `Stage: plan\n${'x'.repeat(5 * 1024 * 1024)}` }) })
    host.files.set(`${ROOT}/.amp/06-z/progress.md`, { text: 'Stage: design', mtimeMs: 300, unreadable: true })
    await $.session.start(START)
    expect(host.status.at(-1)).toBe('amp 04-x · build · tasks 3a r2, 4 · 2/7 done')
  })

  test('outside a git repository the hooks are idle', async ($, on) => {
    const host = fakeHost(on, { git: { ...GIT, 'git rev-parse --show-toplevel': new Error('not a git repository') }, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(host.status).toEqual([undefined])
    expect(await sectionIds($)).toEqual([])
  })

  test('a main-loop compaction keeps the run; a subagent compaction is unchanged', async ($, on) => {
    fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    const seen: (string | undefined)[] = []
    on('session.compact', (_, e) => {
      seen.push(e.instructions)
      return { messages: e.messages }
    })
    await $.session.start(START)
    await $.session.compact({ trigger: 'manual', instructions: 'Focus on x', messages: MESSAGES })
    await $.session.compact({ trigger: 'auto', agentId: 'a1', instructions: 'Focus on x', messages: MESSAGES })
    expect(seen[0]).toMatch(/^Focus on x\n/)
    expect(seen[0]).toContain('Keep: amp run 04-x is in progress')
    expect(seen[0]?.endsWith('Keep: amp run 04-x is in progress at stage build; ledger .amp/04-x/progress.md; resume with amp:phase 04-x.')).toBe(true)
    expect(seen[1]).toBe('Focus on x')
  })

  test('the /amp-run pane shows the stage, each task with its fix round and worktree, and parallel mode', async ($, on) => {
    fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    expect((await $.command.run(RUN)).text).toBe('amp 04-x · build · tasks 3a r2, 4 · 2/7 done')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface, props: PANE.props as never })
      expect(await ui.find({ type: 'Text', text: /build — tasks/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Task 3a · fixing r2/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Task 4 · started · wt-4/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Parallel: on' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^fix round/ })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('the /amp-run pane shows the steps a run has off, or that the ledger has not recorded them', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    const cases = [
      ['Off: Task reviews, CI', 'Steps off: Task reviews, CI'],
      ['Off: none', 'Steps off: none'],
      ['', 'Steps off: not recorded (the CLAUDE.md table applies)'],
    ] as const
    for (const [at, [off, line]] of cases.entries()) {
      host.files.set(LEDGER, { text: `${TEXT}\n${off}`, mtimeMs: 200 + at })
      await $.command.run(RUN)
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PANE.props as never })
      expect(await ui.find({ type: 'Text', text: line })).toBeDefined()
      await ui.unmount()
    }
  })
})

const ALERT = 'hooks/sounds/alert.wav'
const LS = { tool: 'Bash', command: 'ls' } as const
const ASK = { tool: 'AskUserQuestion', questions: [{ question: 'Which?', header: 'Pick', options: [{ label: 'a', description: '' }, { label: 'b', description: '' }], multiSelect: false }] } as const

describe('amp alerts', () => {
  test('a ledger already at gate when the session opens does not toast', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': '# amp ledger — 04-x\nStage: gate' }) })
    await $.session.start(START)
    await $.tool.call(LS)
    expect(host.toasts).toEqual([])
    expect(host.sounds).toEqual([])
  })

  test('grill to gate toasts once with a sound, from the main loop only', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': NO_BRANCH }) })
    await $.session.start(START)
    host.files.set(LEDGER, { text: `${NO_BRANCH}\nStage: gate`, mtimeMs: 200 })
    await $.tool.call({ ...LS, agentId: 'a1' })
    expect(host.toasts).toEqual([])
    await $.tool.call(LS)
    await $.tool.call(LS)
    expect(host.toasts).toEqual(['amp: grill summary ready — confirm to start the run'])
    expect(host.sounds).toEqual([ALERT])
  })

  test('a stop toasts its note once; a later non-Stage line does not toast again', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    const stopped = `${TEXT}\nStage: stopped — need gh auth login`
    host.files.set(LEDGER, { text: stopped, mtimeMs: 200 })
    await $.tool.call(LS)
    host.files.set(LEDGER, { text: `${stopped}\nRuling: x`, mtimeMs: 300 })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    expect(host.toasts).toEqual(['amp stopped: need gh auth login'])
  })

  test('a stop without a note toasts without a trailing colon', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    host.files.set(LEDGER, { text: `${TEXT}\nStage: stopped`, mtimeMs: 200 })
    await $.tool.call(LS)
    expect(host.toasts).toEqual(['amp stopped'])
  })

  test('a merge toasts once although the ledger then vanishes, and clears the status', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    host.files.set(LEDGER, { text: `${TEXT}\nStage: merged — https://x/pr/5`, mtimeMs: 200 })
    await $.tool.call(LS)
    host.files.delete(LEDGER)
    await $.tool.call(LS)
    expect(host.toasts).toEqual(['amp: merged — https://x/pr/5'])
    expect(host.status.at(-1)).toBeUndefined()
  })

  test('a question during the build toasts; one during the grill or from a subagent does not', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    await $.tool.call({ ...ASK, agentId: 'a1' })
    expect(host.toasts).toEqual([])
    await $.tool.call(ASK)
    expect(host.toasts).toEqual(['amp needs your answer'])
    expect(host.sounds).toEqual([ALERT])
    host.files.set(LEDGER, { text: NO_BRANCH, mtimeMs: 200 })
    await $.tool.call(LS)
    await $.tool.call(ASK)
    expect(host.toasts).toEqual(['amp needs your answer'])
  })
})

const ROW = { tool_use_id: 't1', tool: 'Agent', isRunning: true, isErrored: false, isInterrupted: false } as const
const IMPLEMENTER = { subagent_type: 'amp:implementer', description: 'Task 3a: x', prompt: 'do it' }
const DONE = { status: 'completed', resolvedModel: 'claude-sonnet-x', content: [{ type: 'text', text: '\n- STATUS: DONE\n- Commits: …' }] }

describe('amp dispatch rows', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`an amp agent's row names its role, model and task, then its result (${surface})`, async ($, on) => {
      fakeHost(on)
      const ui = await $.ui.mount({ plugin: 'amp', surface, component: 'ToolUse', requestId: 't1', props: { ...ROW, input: IMPLEMENTER } })
      expect(await ui.keepsBeneath()).toBe(true)
      expect(await ui.find({ type: 'Text', text: 'amp implementer · opus · task 3a' })).toBeDefined()
      await ui.redraw({ ...ROW, isRunning: false, input: IMPLEMENTER, output: DONE })
      expect(await ui.find({ type: 'Text', text: 'amp implementer · claude-sonnet-x · task 3a' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '- STATUS: DONE' })).toBeDefined()
      await ui.redraw({ ...ROW, isRunning: false, input: IMPLEMENTER, output: { status: 'async_launched', agentId: 'a1', description: 'x', prompt: 'p', outputFile: 'f' } })
      expect(await ui.find({ type: 'Text', text: 'amp implementer · opus · task 3a' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /STATUS/ })).toBeUndefined()
      await ui.unmount()
    })

    test(`a non-amp agent's row is unchanged (${surface})`, async ($, on) => {
      fakeHost(on)
      const ui = await $.ui.mount({ plugin: 'amp', surface, component: 'ToolUse', requestId: 't1', props: { ...ROW, input: { ...IMPLEMENTER, subagent_type: 'Explore' } } })
      expect(await ui.keepsBeneath()).toBe(true)
      expect(await ui.findAll({ type: 'Text' })).toEqual([])
      await ui.unmount()
    })
  }
})

const SUFFIX = ' (If the user says this run is abandoned, they can delete .amp/04-x/; never delete it yourself.)'

describe('amp guardrails and read-only roles', () => {
  test('during a run a hard reset is denied with the abandoned-run suffix', async ($, on) => {
    fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    const deny = (await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })).deny
    expect(deny).toContain('amp guard: hard reset')
    expect(deny?.endsWith(SUFFIX)).toBe(true)
    expect((await $.tool.call({ tool: 'PowerShell', command: 'git push -f' })).deny).toContain('amp guard: force push')
    expect((await $.tool.call({ tool: 'Bash', command: 'git status' })).deny).toBeUndefined()
  })

  test('without a ledger nothing is guarded', async ($, on) => {
    fakeHost(on, { git: GIT, files: files({}) })
    await $.session.start(START)
    expect((await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })).deny).toBeUndefined()
  })

  test('a deleted ledger ends the guards at the next call', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    host.files.delete(LEDGER)
    expect((await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })).deny).toBeUndefined()
  })

  test('an unknown branch skips only the branch rules', async ($, on) => {
    const host = fakeHost(on, { git: { ...GIT, 'git branch --show-current': 'main\n' }, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })).deny).toContain('amp guard: commit on default')
    host.git['git branch --show-current'] = new Error('git failed')
    expect((await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })).deny).toContain('amp guard: hard reset')
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })).deny).toBeUndefined()
  })

  test('a reviewer may not write in the repo or commit; the main loop may', async ($, on) => {
    fakeHost(on, { git: GIT, agents: [{ id: 'a1', type: 'amp:reviewer' }] })
    await $.session.start(START)
    const deny = (await $.tool.call({ tool: 'Write', file_path: `${ROOT}/src/a.ts`, content: 'x', agentId: 'a1' })).deny
    expect(deny).toContain('amp read-only: reviewer')
    expect(deny).not.toContain('abandoned')
    expect((await $.tool.call({ tool: 'Write', file_path: `${ROOT}/.amp/04-x/r.md`, content: 'x', agentId: 'a1' })).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Write', file_path: `${ROOT}/src/a.ts`, content: 'x' })).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x', agentId: 'a1' })).deny).toContain('amp read-only: reviewer may not run git commit')
  })

  test("a relative worktree path resolves against the session's directory", async ($, on) => {
    fakeHost(on, { git: GIT, agents: [{ id: 'a1', type: 'amp:reviewer' }], cwd: `${ROOT}/sub` })
    await $.session.start(START)
    expect((await $.tool.call({ tool: 'Bash', command: 'git worktree add ../tmp-rev HEAD', agentId: 'a1' })).deny).toContain('may not run git worktree add')
    expect((await $.tool.call({ tool: 'Bash', command: 'git worktree add ../../tmp-rev HEAD', agentId: 'a1' })).deny).toBeUndefined()
  })
})

const CLAUDE = `${ROOT}/CLAUDE.md`
const CONFIG = ['# Project', '', '## amp configuration', '', '| Key | Value |', '|---|---|', '| Task reviews | off |', ''].join('\n')
const FULL_BLOCK = ['## amp configuration', '', '| Key | Value |', '|---|---|', '| Grill | off |', '| Tests | on |',
  '| Document reviews | on |', '| Task reviews | on |', '| Final review | on |', '| CI | on |', ''].join('\n')
const STATUS = `git -C ${ROOT} status --porcelain -- CLAUDE.md`
const ADD = ['git', '-C', ROOT, 'add', '--', 'CLAUDE.md']
const COMMIT = ['git', '-C', ROOT, 'commit', '-m', 'chore(amp): update step switches', '--', 'CLAUDE.md']
const STEPS_RUN = { ...RUN, command: 'amp-steps' } as const
const STEPS_PANE = { ...PANE, requestId: 'amp-steps', props: { ...PANE.props, title: 'amp steps' } } as const
/** The message `$.fs.read` rejects with when the fake denies a read. */
const READ_ERROR = 'amp: $.fs.read: EACCES: permission denied'

/** A files map holding only CLAUDE.md with the given text. */
function claudeMd(text: string, unreadable?: true) {
  return new Map([[CLAUDE, { text, mtimeMs: 1, ...(unreadable && { unreadable }) }]])
}

/** The `/amp-steps` pane drawn on a surface. */
function mountSteps($: Engine, surface: 'terminal' | 'desktop' = 'terminal') {
  return $.ui.mount({ ...STEPS_PANE, surface, props: STEPS_PANE.props as never })
}

describe('amp steps pane', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`the pane draws one Select per step with the file's values (${surface})`, async ($, on) => {
      const host = fakeHost(on, { git: GIT, files: claudeMd(CONFIG) })
      await $.session.start(START)
      expect((await $.command.run(STEPS_RUN)).text).toBe('amp steps pane opened: turn steps on or off for this project.')
      expect(host.opened).toEqual(['amp-steps'])
      const ui = await mountSteps($, surface)
      expect((await ui.findAll({ type: 'Select' })).map(s => s.key)).toEqual(STEPS.map(step => `step-${step}`))
      expect((await ui.find({ key: 'step-Task reviews' }))?.props.value).toBe('off')
      expect((await ui.find({ key: 'step-CI' }))?.props.value).toBe('on')
      expect(await ui.find({ type: 'Text', text: STEP_HELP['Task reviews'] })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Written to CLAUDE.md, under "## amp configuration".' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'The first change adds the amp configuration rows.' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'Esc closes.' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /run is in progress/ })).toBeUndefined()
      await ui.unmount()
    })
  }

  test('a pick writes the setStep result to <root>/CLAUDE.md', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: claudeMd(CONFIG) })
    await $.session.start(START)
    const ui = await mountSteps($)
    await ui.select({ key: 'step-CI', value: 'off' })
    expect(host.writes).toEqual([{ path: CLAUDE, text: setStep(CONFIG, 'CI', 'off') }])
    await ui.unmount()
  })

  test('no file: the pane says the first change creates it; off writes the full block, a current on nothing', async ($, on) => {
    const host = fakeHost(on, { git: GIT })
    await $.session.start(START)
    const ui = await mountSteps($)
    expect(await ui.find({ type: 'Text', text: 'CLAUDE.md does not exist: the first change creates it.' })).toBeDefined()
    await ui.select({ key: 'step-CI', value: 'on' })
    expect(host.writes).toEqual([])
    await ui.select({ key: 'step-Grill', value: 'off' })
    expect(host.writes).toEqual([{ path: CLAUDE, text: FULL_BLOCK }])
    await ui.unmount()
  })

  test("a file that can't be read shows the error and no Select", async ($, on) => {
    const host = fakeHost(on, { git: { ...GIT, [STATUS]: ' M CLAUDE.md\n' }, files: claudeMd(CONFIG, true) })
    await $.session.start(START)
    const ui = await mountSteps($)
    expect(await ui.find({ type: 'Text', text: `CLAUDE.md can't be read: ${READ_ERROR}` })).toBeDefined()
    expect(await ui.findAll({ type: 'Select' })).toEqual([])
    expect(await ui.find({ key: 'commit' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Esc closes.' })).toBeDefined()
    expect(host.writes).toEqual([])
    await ui.unmount()
  })

  test('a read that fails after the draw toasts on a pick and writes nothing', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: claudeMd(CONFIG) })
    await $.session.start(START)
    const ui = await mountSteps($)
    host.files.set(CLAUDE, { text: CONFIG, mtimeMs: 2, unreadable: true })
    await ui.select({ key: 'step-CI', value: 'off' })
    expect(host.toasts).toEqual([`amp steps: CLAUDE.md can't be read: ${READ_ERROR}`])
    expect(host.writes).toEqual([])
    await ui.unmount()
  })

  for (const cwd of [ROOT, `${ROOT}/sub`]) {
    test(`the commit button shows only when CLAUDE.md differs and commits only it (cwd ${cwd})`, async ($, on) => {
      const host = fakeHost(on, { git: { ...GIT, [STATUS]: '', [ADD.join(' ')]: '', [COMMIT.join(' ')]: '[feature/x 1a2b3c] chore\n' }, files: claudeMd(CONFIG), cwd })
      await $.session.start({ ...START, cwd })
      let ui = await mountSteps($)
      expect(await ui.find({ key: 'commit' })).toBeUndefined()
      await ui.unmount()
      host.git[STATUS] = ' M CLAUDE.md\n'
      ui = await mountSteps($)
      expect((await ui.find({ key: 'commit' }))?.props.label).toBe('Commit CLAUDE.md')
      expect(await ui.find({ type: 'Text', text: '/amp:phase needs a clean working tree. This commits only CLAUDE.md on the current branch and does not push.' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: "The repository's commit hooks do not run for this commit." })).toBeDefined()
      const before = host.runs.length
      await ui.press({ key: 'commit' })
      expect(host.runs.slice(before).filter(argv => argv.join(' ') !== STATUS)).toEqual([ADD, COMMIT])
      expect(host.runs.some(argv => argv.includes('push'))).toBe(false)
      expect(host.toasts).toEqual(['amp steps: committed CLAUDE.md'])
      await ui.unmount()
    })
  }

  test('a failing commit toasts the first line of its stderr', async ($, on) => {
    const host = fakeHost(on, { git: { ...GIT, [STATUS]: '?? CLAUDE.md\n', [ADD.join(' ')]: '', [COMMIT.join(' ')]: { exitCode: 1, stderr: 'nothing\nmore' } }, files: claudeMd(CONFIG) })
    await $.session.start(START)
    const ui = await mountSteps($)
    await ui.press({ key: 'commit' })
    expect(host.toasts).toEqual(['amp steps: commit failed: nothing'])
    await ui.unmount()
  })

  test('during an active run the pane says changes apply from the next run', async ($, on) => {
    const map = files({ '04-x': TEXT })
    map.set(CLAUDE, { text: CONFIG, mtimeMs: 1 })
    fakeHost(on, { git: GIT, files: map })
    await $.session.start(START)
    const ui = await mountSteps($)
    expect(await ui.find({ type: 'Text', text: 'A run is in progress: changes apply from the next run.' })).toBeDefined()
    await ui.unmount()
  })

  test('outside a git repository /amp-steps says so and opens no pane', async ($, on) => {
    const host = fakeHost(on, { git: { ...GIT, 'git rev-parse --show-toplevel': new Error('not a git repository') }, files: claudeMd(CONFIG) })
    await $.session.start(START)
    expect((await $.command.run(STEPS_RUN)).text).toBe('amp steps: not in a git repository.')
    expect(host.opened).toEqual([])
    expect(host.writes).toEqual([])
  })
})
