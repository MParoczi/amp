import { describe, expect, test } from 'claude-code/testing'

import { aliasFor, configured, routingText, spawnModel } from './register'

const SPAWNED = { agentId: 'a1' }
const PARENT = 'claude-parent-1'

/** One Agent-tool dispatch as the engine raises it. */
const call = (subagentType: string, model?: string) => ({
  tool_use_id: 't1',
  prompt: 'p',
  description: 'd',
  subagentType,
  provider: { plugin: 'engine', tier: 'core' } as const,
  parentModel: PARENT,
  background: false,
  fork: false,
  ...(model === undefined ? {} : { model }),
})

describe('amp model routing', () => {
  test('an amp agent dispatched without a model runs on its task type default', async ($, on) => {
    const seen: (string | undefined)[] = []
    on('agent.spawn', (_, e) => {
      seen.push(e.model)
      return { model: e.model ?? 'none', ...SPAWNED }
    })

    await $.agent.spawn(call('amp:implementer'))
    await $.agent.spawn(call('amp:checker'))
    expect(seen).toEqual(['opus', 'sonnet'])
  })

  test('the configured model wins; inherit takes the parent; an explicit model is kept', { options: { reviewer: 'fable', scout: 'inherit' } }, async ($, on) => {
    const seen: (string | undefined)[] = []
    on('agent.spawn', (_, e) => {
      seen.push(e.model)
      return { model: e.model ?? 'none', ...SPAWNED }
    })

    await $.agent.spawn(call('amp:reviewer'))
    await $.agent.spawn(call('amp:scout'))
    await $.agent.spawn(call('amp:implementer', 'haiku'))
    expect(seen).toEqual(['fable', PARENT, 'haiku'])
  })

  test('agents that are not amp are left alone', async ($, on) => {
    const seen: (string | undefined)[] = []
    on('agent.spawn', (_, e) => {
      seen.push(e.model)
      return { model: e.model ?? 'none', ...SPAWNED }
    })

    await $.agent.spawn(call('general-purpose'))
    await $.agent.spawn(call('other:implementer'))
    expect(seen).toEqual([undefined, undefined])
  })

  test('helpers: unknown values count as inherit, inherit is named by the session family', async () => {
    expect(configured({ reviewer: 'gpt' }, 'reviewer')).toBe('inherit')
    expect(configured({}, 'reviewer')).toBe('inherit')
    expect(spawnModel({ implementer: 'inherit' }, 'amp', 'amp:implementer', 'claude-x-1')).toBe('claude-x-1')
    expect(spawnModel({}, 'amp', 'amp:lean', 'p')).toBeUndefined()
    expect(aliasFor('inherit', 'claude-opus-5-5')).toBe('opus')
    expect(aliasFor('inherit', 'some-other-model')).toBeUndefined()
    expect(aliasFor('sonnet', 'claude-opus-5-5')).toBe('sonnet')
  })

  test('the routing section names the escalation and fallback overrides', async () => {
    const text = routingText({ reviewer: 'fable', implementer: 'opus', checker: 'sonnet', scout: 'sonnet', escalation: 'inherit', fallback: 'opus' }, 'amp', 'claude-fable-5-1')
    expect(text).toContain('reviewer=fable, implementer=opus, checker=sonnet, scout=sonnet')
    expect(text).toContain('Escalation (fix rounds 4-5, a BLOCKED retry on a stronger model): `model: "fable"`')
    expect(text).toContain('`model: "opus"`. If the failed dispatch already ran on that model')
    expect(routingText({ escalation: 'inherit' }, 'amp', 'mystery')).toContain('no `model`')
  })
})
