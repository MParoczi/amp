import { describe, expect, test, type Engine } from 'claude-code/testing'
import type { AgentInfo, FsEntry, On } from 'claude-code'

import { parseLedger, statusText } from './run'

/*
 * The host the run hooks see. The kit has no fs, network or process: these test hooks sit beneath
 * the plugin and answer `$.fs`, `$.process.run`, `$.agent.list`, `$.ui.status`, `$.ui.toast`,
 * `$.audio.play`, plus the bottoms a session start, a command, a prompt and a tool call need.
 */
type Host = {
  files: Map<string, { text: string; mtimeMs: number }>     // absolute, '/'-separated
  git: Record<string, string | Error>                        // argv.join(' ') → stdout | failure
  agents: { id: string; type: string }[]
  status: (string | undefined)[]; toasts: string[]; sounds: string[]
}

const MAX_READ = 4 * 1024 * 1024

function fakeHost(on: On, init: Partial<Pick<Host, 'files' | 'git' | 'agents'>> = {}): Host {
  const host: Host = { files: init.files ?? new Map(), git: init.git ?? {}, agents: init.agents ?? [], status: [], toasts: [], sounds: [] }
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
    return file.text.length > MAX_READ ? { deny: `EFBIG: ${e.path}` } : { value: file.text }
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
  on('tool.call', () => ({ result: {} }))
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
].join('\n')
const PLAN_TEXT = [1, 2, '3a', '3b', 4, 5, 6].map(n => `### Task ${n}: t`).join('\n')
const GIT = {
  'git rev-parse --show-toplevel': `${ROOT}\n`,
  'git symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
  'git branch --show-current': 'feature/x\n',
}
const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
const COMPOSE = { model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as const
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

/** The ids of the sections the plugin adds to an empty prompt. */
async function sectionIds($: Engine) {
  const { sections } = await $.prompt.compose(COMPOSE)
  return sections.map(s => s.id)
}

describe('amp run hooks', () => {
  test('no .amp: no status, /amp-run says so, no resume section', async ($, on) => {
    const host = fakeHost(on, { git: GIT })
    await $.session.start(START)
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(host.status.at(-1)).toBeUndefined()
    expect((await $.command.run(RUN)).text).toBe('No amp run in this repository.')
    expect(await sectionIds($)).toEqual([])
  })

  test('a ledger created after session start is picked up at the next tool call', async ($, on) => {
    const host = fakeHost(on, { git: GIT, files: files({}) })
    await $.session.start(START)
    expect(host.status.at(-1)).toBeUndefined()
    host.files.set(LEDGER, { text: TEXT, mtimeMs: 200 })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(host.status.at(-1)).toBe(statusText(parseLedger('04-x', '.amp/04-x/progress.md', TEXT), 7))
    expect(host.status.at(-1)).toBe('amp 04-x · build · task 3/7 · fix r2/5')
  })

  test('the resume section needs the run branch to be the current one', async ($, on) => {
    fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    const { sections } = await $.prompt.compose(COMPOSE)
    expect(sections.map(s => [s.id, s.scope])).toEqual([['amp:resume', 'session']])
    expect(sections[0]?.text).toContain('# amp run in progress (04-x)')
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
    host.files.set(`${ROOT}/.amp/06-z/notes.md`, { text: 'a run folder with no readable ledger', mtimeMs: 300 })
    await $.session.start(START)
    expect(host.status.at(-1)).toBe('amp 04-x · build · task 3/7 · fix r2/5')
  })

  test('outside a git repository the hooks are idle', async ($, on) => {
    const host = fakeHost(on, { git: { ...GIT, 'git rev-parse --show-toplevel': new Error('not a git repository') }, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    expect(host.status.at(-1)).toBeUndefined()
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

  test('the /amp-run pane shows the stage, the tasks and the fix round', async ($, on) => {
    fakeHost(on, { git: GIT, files: files({ '04-x': TEXT }) })
    await $.session.start(START)
    expect((await $.command.run(RUN)).text).toBe('amp 04-x · build · task 3/7 · fix r2/5')
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface, props: PANE.props as never })
      expect(await ui.find({ type: 'Text', text: /build — tasks/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /3a/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'fix round 2/5' })).toBeDefined()
      await ui.unmount()
    }
  })
})
