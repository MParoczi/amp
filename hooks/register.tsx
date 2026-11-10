import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import { parseLedger, planTaskCount, resumeText, statusText, type Run } from './run'

/*
 * amp model routing. The plugin's `userConfig` holds one model per task type (the `/config` rows
 * and the `/amp-models` pane). Three hooks apply it:
 *   agent.spawn     an amp agent dispatched without `model` runs on its task type's model;
 *                   an explicit `model` (escalation, fallback) is kept.
 *   prompt.compose  a loop that can dispatch agents reads the routing, so the orchestrator
 *                   knows what to pass for escalation and fallback.
 *   ui.render       the `/amp-models` pane: one picker per task type, written through `/config`.
 *
 * The amp run (spec §5.2-5.3): the active run is the newest `.amp/<key>/progress.md` not yet
 * merged. Every tool call and turn re-scans for it; the status line, the `/amp-run` pane, the
 * resume section and the compaction note show it. Outside a git repository all of them are idle.
 */

export const MODELS = ['inherit', 'fable', 'opus', 'sonnet', 'haiku'] as const
const ALIASES = MODELS.filter(m => m !== 'inherit')

export type Role = { key: string; agent?: string; label: string; help: string }

export const ROLES: readonly Role[] = [
  { key: 'reviewer', agent: 'reviewer', label: 'Reviewer', help: 'spec, plan, roadmap, task and whole-branch reviews, and fix re-checks' },
  { key: 'implementer', agent: 'implementer', label: 'Implementer', help: 'tasks, fix rounds 1-3, final-review and CI fixes' },
  { key: 'checker', agent: 'checker', label: 'Checker', help: "fallback re-check of a fix round when the reviewer can't be resumed" },
  { key: 'scout', agent: 'scout', label: 'Scout', help: 'fact-finding during grill, design and roadmap' },
  { key: 'escalation', label: 'Escalation', help: 'fresh implementer for fix rounds 4-5 and a BLOCKED retry' },
  { key: 'fallback', label: 'Fallback', help: 're-dispatch when a model is unavailable (rate or usage limit, overload)' },
]

/** The configured value of a task type; anything outside the picker counts as `inherit`. */
export function configured(options: PluginOptions, key: string): string {
  const value = options[key]
  return typeof value === 'string' && (MODELS as readonly string[]).includes(value) ? value : 'inherit'
}

/** The model an amp agent spawns on: its task type's, or the parent's for `inherit`. */
export function spawnModel(options: PluginOptions, plugin: string, subagentType: string, parentModel: string): string | undefined {
  const role = ROLES.find(r => r.agent !== undefined && subagentType === `${plugin}:${r.agent}`)
  if (role === undefined) return undefined
  const model = configured(options, role.key)
  return model === 'inherit' ? parentModel : model
}

/** The Agent tool takes aliases only: `inherit` is named by the session model's family, when it has one. */
export function aliasFor(model: string, sessionModel: string): string | undefined {
  if (model !== 'inherit') return model
  const id = sessionModel.toLowerCase()
  return ALIASES.find(alias => id.includes(alias))
}

/** The system-prompt section an orchestrating loop reads. */
export function routingText(options: PluginOptions, plugin: string, sessionModel: string): string {
  const pass = (key: string) => {
    const alias = aliasFor(configured(options, key), sessionModel)
    return alias === undefined ? 'no `model` (the session model has no alias)' : `\`model: "${alias}"\``
  }
  const table = ROLES.filter(r => r.agent).map(r => `${r.key}=${configured(options, r.key)}`).join(', ')
  return [
    `# amp model routing (${plugin} plugin settings: /amp-models or /config)`,
    `Dispatch ${plugin}:reviewer, ${plugin}:implementer, ${plugin}:checker and ${plugin}:scout WITHOUT a \`model\` parameter: the plugin assigns each its configured model (${table}; inherit = the session's model). Pass \`model\` only for:`,
    `- Escalation (fix rounds 4-5, a BLOCKED retry on a stronger model): ${pass('escalation')}`,
    `- Fallback (a dispatch failed because its model is unavailable: rate or usage limit, 429, overload): ${pass('fallback')}. If the failed dispatch already ran on that model, wait briefly and retry once, then stop and tell the user.`,
  ].join('\n')
}

const PANE = 'amp-models'

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'amp models', focus: true })
}

const RUN_PANE = 'amp-run'
const NO_RUN = 'No amp run in this repository.'
const MAX_LEDGER = 4 * 1024 * 1024

/** The repository root (`git rev-parse --show-toplevel`); undefined keeps the run hooks idle. */
let root: string | undefined
let defaultBranch = 'main'
let active: Run | undefined
/** Each ledger read so far, by path, with the mtime it was read at: re-read only when that changes. */
let ledgers = new Map<string, { mtimeMs: number; run: Run }>()
/** Plan task totals by plan path; undefined when the plan can't be read or counts none. */
let totals = new Map<string, number | undefined>()

/** A git command's trimmed stdout, or undefined when it fails, exits non-zero or prints nothing. */
async function git($: EngineInterface, ...args: string[]): Promise<string | undefined> {
  try {
    const { exitCode, stdout } = await $.process.run(['git', ...args])
    return exitCode === 0 ? stdout.trim() || undefined : undefined
  } catch {
    return undefined
  }
}

/** The default branch: origin's HEAD, else `init.defaultBranch`, else `main` (spec §5.4). */
async function findDefaultBranch($: EngineInterface): Promise<string> {
  const head = await git($, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
  return head?.replace(/^origin\//, '') ?? (await git($, 'config', 'init.defaultBranch')) ?? 'main'
}

async function planTotal($: EngineInterface, run: Run): Promise<number | undefined> {
  const plan = run.planPath
  if (root === undefined || plan === undefined) return undefined
  if (!totals.has(plan)) {
    const path = /^([a-zA-Z]:)?[\\/]/.test(plan) ? plan : `${root}/${plan}`
    totals.set(plan, await $.fs.read(path).then(text => planTaskCount(text) || undefined, () => undefined))
  }
  return totals.get(plan)
}

/** The newest candidate ledger whose stage isn't merged; an oversized or unreadable one is skipped. */
async function scan($: EngineInterface): Promise<Run | undefined> {
  if (root === undefined) return undefined
  const entries = await $.fs.list(`${root}/.amp`).catch(() => [])
  const seen = new Map<string, { mtimeMs: number; run: Run }>()
  let newest: { mtimeMs: number; run: Run } | undefined
  for (const entry of entries) {
    if (entry.kind !== 'dir') continue
    const path = `${root}/.amp/${entry.name}/progress.md`
    try {
      const { kind, size, mtimeMs } = await $.fs.stat(path)
      if (kind !== 'file' || size > MAX_LEDGER) continue
      let known = ledgers.get(path)
      if (known?.mtimeMs !== mtimeMs) {
        known = { mtimeMs, run: parseLedger(entry.name, `.amp/${entry.name}/progress.md`, await $.fs.read(path)) }
      }
      seen.set(path, known)
      if (known.run.stage !== 'merged' && (newest === undefined || known.mtimeMs > newest.mtimeMs)) newest = known
    } catch {
      // unreadable: skipped, the other candidates still count (spec §6)
    }
  }
  ledgers = seen
  return newest?.run
}

/** Shows the active run: the status line (cleared when there is none) and the pane. */
async function show($: EngineInterface) {
  try {
    await $.ui.status(active && statusText(active, await planTotal($, active)))
    $.ui.invalidate('ui.render')
  } catch {
    // a refused status line leaves the hooks running
  }
}

/** Re-scans for the active run and shows it when it or its ledger changed (an unchanged ledger keeps its Run). */
async function refresh($: EngineInterface): Promise<Run | undefined> {
  const run = await scan($)
  if (run !== active) {
    active = run
    await show($)
  }
  return active
}

/** The active run when it owns the current branch: its Branch, or the default branch while it has none. */
async function resumable($: EngineInterface): Promise<Run | undefined> {
  if (active === undefined) return undefined
  const branch = await git($, 'branch', '--show-current')
  return branch !== undefined && branch === (active.branch ?? defaultBranch) ? active : undefined
}

/** The `/amp-run` pane's lines, the first its heading. */
function runLines(run: Run, total: number | undefined): string[] {
  const done = run.tasks.filter(t => t.state === 'complete').length
  return [
    `amp run ${run.key} · ${run.branch ?? 'no branch yet'}`,
    `Stage: ${run.stage}${run.note ? ` — ${run.note}` : ''}`,
    `Tasks: ${done} complete of ${total === undefined ? `${run.tasks.length} started` : `${total} planned`}`,
    ...run.tasks.map(t => `  Task ${t.id} · ${t.state}`),
    ...(run.fixRound ? [`fix round ${run.fixRound.round}/5 · task ${run.fixRound.task}`] : []),
    `Parked ${run.parked} · rulings ${run.rulings} · fallbacks ${run.fallbacks.length}`,
    `Pipeline: ${run.pipelineOff === undefined ? 'on' : `off — ${run.pipelineOff}`}`,
    'Last ledger lines:',
    ...run.tail.map(line => `  ${line}`),
  ]
}

export const register: Register = (on, options) => {
  on('agent.spawn', ($, e, next) => {
    if (e.model !== undefined) return next(e)
    const model = spawnModel(options, $.plugin.name, e.subagentType, e.parentModel)
    return next(model === undefined ? e : { ...e, model })
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const sections = [...composed.sections]
    if (e.tools.includes('Agent')) {
      const text = routingText(options, $.plugin.name, await $.session.model())
      sections.push({ id: `${$.plugin.name}:routing`, text, scope: 'session' as const })
    }
    const run = await resumable($)
    if (run) sections.push({ id: `${$.plugin.name}:resume`, text: resumeText(run), scope: 'session' as const })
    return { sections }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'amp-models', description: 'Choose the model each amp task type runs on' })
    await $.command.register({ name: 'amp-run', description: 'Show the current amp run: stage, tasks, fix rounds, parked items' })
    root = await git($, 'rev-parse', '--show-toplevel')
    defaultBranch = root === undefined ? 'main' : await findDefaultBranch($)
    ledgers = new Map()
    totals = new Map()
    active = await scan($)
    await show($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('session.compact', async ($, e, next) => {
    const run = e.agentId === undefined ? await resumable($) : undefined
    if (run === undefined) return next(e)
    const keep = `Keep: amp run ${run.key} is in progress at stage ${run.stage}; ledger ${run.ledgerPath}; resume with amp:phase ${run.key}.`
    return next({ ...e, instructions: e.instructions ? `${e.instructions}\n${keep}` : keep })
  })

  on('command.run', { command: 'amp-run' }, async $ => {
    const run = await refresh($)
    await $.ui.open({ id: RUN_PANE, title: 'amp run', focus: true }).catch(() => undefined)
    return { text: run ? statusText(run, await planTotal($, run)) : NO_RUN }
  })

  on('ui.render', { component: 'Pane', requestId: RUN_PANE }, async ($, e) => {
    const lines = active ? runLines(active, await planTotal($, active)) : [NO_RUN]
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>{lines.join('\n')}</Text>
    }
    const { Box, Text } = $.ui.resolve(e)
    const [heading, ...rest] = lines
    return (
      <Box flexDirection="column">
        <Text bold>{heading}</Text>
        {rest.map((line, at) => (
          <Box key={`line-${at}`}>
            <Text>{line}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  on('command.run', { command: 'amp-models' }, async $ => {
    await openPane($)
    return { text: 'amp models pane opened: pick a model per task type (also under /config).' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>This surface has no picker: set the amp models under /config.</Text>
    }
    const { Box, Text, Select } = $.ui.resolve(e)
    const rows = await $.config.list()
    const keyOf = (field: string) => rows.find(r => r.provider.plugin === $.plugin.name && r.key.endsWith(`.${field}`))?.key
    const choices = MODELS.map(m => ({ value: m, label: m }))

    return (
      <Box flexDirection="column">
        <Text bold>amp model routing</Text>
        <Text dimColor>The orchestrator (grill, spec, plan, rulings, ship) runs on the session model: /model.</Text>
        {ROLES.map((role, at) => (
          <Box key={role.key} flexDirection="column" marginTop={1}>
            <Select
              key={`pick-${role.key}`}
              label={`${role.label}: `}
              options={choices}
              value={configured(options, role.key)}
              autoFocus={at === 0 ? true : undefined}
              onSelect={(value: string) => {
                const key = keyOf(role.key)
                if (key !== undefined) void $.config.set({ key, value })
              }}
            />
            <Text dimColor>  {role.help}</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>inherit = the session's model. Esc closes.</Text>
        </Box>
      </Box>
    )
  })
}
