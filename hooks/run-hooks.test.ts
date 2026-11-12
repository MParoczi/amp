import { describe, expect, test, type Engine } from 'claude-code/testing'
import type { AgentInfo, FsEntry, On } from 'claude-code'

import { parseLedger, statusText } from './run'

/*
 * The host the run hooks see. The kit has no fs, network or process: these test hooks sit beneath
 * the plugin and answer `$.fs`, `$.process.run`, `$.agent.list`, `$.ui.status`, `$.ui.toast`,
 * `$.audio.play`, plus the bottoms a session start, a command, a prompt (with the session model),
 * a tool call and a finished turn need.
 */
type Host = {
  files: Map<string, { text: string; mtimeMs: number; unreadable?: true }>   // absolute, '/'-separated; unreadable: stat answers, read rejects
  git: Record<string, string | Error>                        // argv.join(' ') → stdout | failure
  agents: { id: string; type: string }[]
  cwd: string                                               // what $.session.cwd() answers
  status: (string | undefined)[]; toasts: string[]; sounds: string[]
}

function fakeHost(on: On, init: Partial<Pick<Host, 'files' | 'git' | 'agents' | 'cwd'>> = {}): Host {
  const host: Host = { files: init.files ?? new Map(), git: init.git ?? {}, agents: init.agents ?? [], cwd: init.cwd ?? '/repo', status: [], toasts: [], sounds: [] }
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
    return file.unreadable ? { deny: `EACCES: ${e.path}` } : { value: file.text }
  })
  on('process.run', (_, e) => {
    const out = host.git[e.argv.join(' ')]
    return typeof out === 'string'
      ? { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      : { deny: out?.message ?? `no fake for ${e.argv.join(' ')}` }
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
  on('ui.open', () => ({ value: { isPlaced: true } }))
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
