import type { EngineInterface, PluginOptions, Register } from 'claude-code'

/*
 * amp model routing. The plugin's `userConfig` holds one model per task type (the `/config` rows
 * and the `/amp-models` pane). Three hooks apply it:
 *   agent.spawn     an amp agent dispatched without `model` runs on its task type's model;
 *                   an explicit `model` (escalation, fallback) is kept.
 *   prompt.compose  a loop that can dispatch agents reads the routing, so the orchestrator
 *                   knows what to pass for escalation and fallback.
 *   ui.render       the `/amp-models` pane: one picker per task type, written through `/config`.
 */

export const MODELS = ['inherit', 'fable', 'opus', 'sonnet', 'haiku'] as const
const ALIASES = MODELS.filter(m => m !== 'inherit')

export type Role = { key: string; agent?: string; label: string; help: string }

export const ROLES: readonly Role[] = [
  { key: 'reviewer', agent: 'reviewer', label: 'Reviewer', help: 'spec, plan, roadmap, task and whole-branch reviews' },
  { key: 'implementer', agent: 'implementer', label: 'Implementer', help: 'tasks, fix rounds 1-3, final-review and CI fixes' },
  { key: 'checker', agent: 'checker', label: 'Checker', help: 'scoped re-review of each fix round' },
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

export const register: Register = (on, options) => {
  on('agent.spawn', ($, e, next) => {
    if (e.model !== undefined) return next(e)
    const model = spawnModel(options, $.plugin.name, e.subagentType, e.parentModel)
    return next(model === undefined ? e : { ...e, model })
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.includes('Agent')) return composed
    const text = routingText(options, $.plugin.name, await $.session.model())
    return { sections: [...composed.sections, { id: `${$.plugin.name}:routing`, text, scope: 'session' as const }] }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'amp-models', description: 'Choose the model each amp task type runs on' })
    return next(e)
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
