import { describe, expect, test } from 'claude-code/testing'
import type { ConfigRow } from 'claude-code'

const FIELDS = ['reviewer', 'implementer', 'checker', 'scout', 'escalation', 'fallback']
const ROWS: ConfigRow[] = FIELDS.map(field => ({
  key: `amp.${field}`,
  label: field,
  kind: 'choice',
  value: 'inherit',
  options: ['inherit', 'fable', 'opus', 'sonnet', 'haiku'],
  provider: { plugin: 'amp', tier: 'user' },
  isLocked: false,
}))
const PANE = {
  plugin: 'amp',
  component: 'Pane',
  requestId: 'amp-models',
  props: { title: 'amp models', isFocused: true, bodyColumns: 80, placement: 'dock' },
} as const

describe('amp models pane', () => {
  test('one picker per task type, drawn with its value; a pick is written through /config', { options: { reviewer: 'fable' } }, async ($, on) => {
    const writes: { key: string; value: unknown }[] = []
    on('config.list', () => ({ value: ROWS }))
    on('config.set', (_, e) => {
      writes.push({ key: e.key, value: e.value })
      return { value: e.value }
    })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface, props: PANE.props as never })
      for (const field of FIELDS) expect(await ui.find({ key: `pick-${field}` })).toBeDefined()
      expect((await ui.find({ key: 'pick-reviewer' }))?.props.value).toBe('fable')
      expect((await ui.find({ key: 'pick-implementer' }))?.props.value).toBe('opus')

      await ui.select({ key: 'pick-checker', value: 'haiku' })
      await ui.unmount()
    }
    expect(writes).toEqual([
      { key: 'amp.checker', value: 'haiku' },
      { key: 'amp.checker', value: 'haiku' },
    ])
  })
})
