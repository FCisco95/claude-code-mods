import { expect, mock, test } from 'claude-code/testing'

import { addToBlock, DESTINATIONS, ruleSlug } from '../hooks/destinations'
import type { Config, Io } from '../hooks/destinations'
import { parseVerdict, ruleKey, shouldCheck } from '../hooks/detect'

const RULES = ['Never use em dashes.', 'Keep LinkedIn hooks under 12 words.']
const NONE = { isCommand: false, isMeta: false }

// An Io over a map, so each destination can be read back.
const fakeIo = (files: Record<string, string> = {}) => {
  const writes: string[] = []
  const io: Io = {
    home: 'C:/Users/me',
    root: 'C:\\Users\\me\\code\\notes',
    today: '2026-10-26',
    read: async p => files[p] ?? null,
    write: async (p, t) => {
      files[p] = t
      writes.push(p)
    },
    exists: async p => p in files,
  }

  return { io, files, writes }
}

const CONFIG: Config = { rulesFile: '', vaultFolder: 'C:\\Vault\\Rules' }

test('which prompts are checked at all', async () => {
  expect(shouldCheck('never use em dashes', NONE)).toBe(true)
  expect(shouldCheck('keep LinkedIn hooks under 12 words', NONE)).toBe(true)
  expect(shouldCheck('ok', NONE)).toBe(false)
  expect(shouldCheck('/helper-desk open', NONE)).toBe(false)
  expect(shouldCheck('never use em dashes', { isCommand: true, isMeta: false })).toBe(false)
  expect(shouldCheck('never use em dashes', { isCommand: false, isMeta: true })).toBe(false)
  expect(shouldCheck('word '.repeat(200), NONE)).toBe(false)
})

test('the verdict is read strictly', async () => {
  expect(parseVerdict('{"isRule": true, "rule": "Never use em dashes."}')).toBe('Never use em dashes.')
  expect(parseVerdict('Here you go: {"isRule": true, "rule": "  Keep   hooks under 12 words. "}')).toBe('Keep hooks under 12 words.')
  expect(parseVerdict('{"isRule": false, "rule": ""}')).toBe('')
  expect(parseVerdict('{"isRule": true, "rule": ""}')).toBe('')
  expect(parseVerdict('{"isRule": "yes", "rule": "Never use em dashes."}')).toBe('')
  expect(parseVerdict('not json')).toBe('')
  expect(ruleKey('Never use em dashes.')).toBe(ruleKey('never  use em dashes'))
})

test('Save everywhere adds a bullet to a marked block and never twice', async () => {
  const { io, files, writes } = fakeIo({ 'C:/Users/me/.claude/rules/reflect.md': '# My rules\n\nBe terse.\n' })
  const everywhere = DESTINATIONS.find(d => d.id === 'everywhere')!

  await everywhere.save(io, RULES[0]!, CONFIG)
  await everywhere.save(io, RULES[1]!, CONFIG)
  const again = await everywhere.save(io, RULES[0]!, CONFIG)

  const text = files['C:/Users/me/.claude/rules/reflect.md']!
  expect(text.startsWith('# My rules\n\nBe terse.')).toBe(true)
  expect(text).toContain('<!-- reflect:start -->\n- Never use em dashes.\n- Keep LinkedIn hooks under 12 words.\n<!-- reflect:end -->')
  expect(text.split('Never use em dashes.').length).toBe(2)
  expect(again).toContain('already there')
  expect(writes.length).toBe(2)
})

test('Save everywhere keeps CRLF and honours a custom file', async () => {
  const { io, files } = fakeIo({ 'C:/Work/AGENTS.md': '# Agents\r\n' })
  const everywhere = DESTINATIONS.find(d => d.id === 'everywhere')!

  await everywhere.save(io, RULES[0]!, { ...CONFIG, rulesFile: 'C:\\Work\\AGENTS.md' })

  expect(files['C:/Work/AGENTS.md']).toBe('# Agents\r\n\r\n## Rules saved with Reflect\r\n\r\n<!-- reflect:start -->\r\n- Never use em dashes.\r\n<!-- reflect:end -->\r\n')
})

test('Save to memory writes a feedback file and an index line in the project memory folder', async () => {
  const { io, files } = fakeIo({ 'C:/Users/me/.claude/projects/C--Users-me-code-notes/memory/MEMORY.md': '- [Old](old.md) — kept\n' })
  const memory = DESTINATIONS.find(d => d.id === 'memory')!

  const where = await memory.save(io, RULES[1]!, CONFIG)

  expect(where).toBe('C:/Users/me/.claude/projects/C--Users-me-code-notes/memory/feedback_keep-linkedin-hooks-under-12-words.md')
  expect(files[where]).toBe('---\nname: keep-linkedin-hooks-under-12-words\ndescription: "Keep LinkedIn hooks under 12 words."\nmetadata:\n  type: feedback\n---\n\nKeep LinkedIn hooks under 12 words.\n')
  expect(files['C:/Users/me/.claude/projects/C--Users-me-code-notes/memory/MEMORY.md']).toBe(
    '- [Old](old.md) — kept\n- [Keep LinkedIn hooks under 12 words.](feedback_keep-linkedin-hooks-under-12-words.md) — rule saved 2026-10-26\n',
  )
  expect(await memory.save(io, RULES[1]!, CONFIG)).toContain('already there')
})

test('Save to vault writes one note per rule and only exists when a folder is set', async () => {
  const { io, files } = fakeIo()
  const vault = DESTINATIONS.find(d => d.id === 'vault')!

  expect(vault.isAvailable({ rulesFile: '', vaultFolder: '' })).toBe(false)
  expect(vault.isAvailable(CONFIG)).toBe(true)

  const first = await vault.save(io, RULES[0]!, CONFIG)
  const second = await vault.save(io, RULES[0]!, CONFIG)

  expect(first).toBe('C:/Vault/Rules/never-use-em-dashes.md')
  expect(second).toBe('C:/Vault/Rules/never-use-em-dashes-2.md')
  expect(files[first]).toBe('---\nsummary: "Never use em dashes."\ncreated: 2026-10-26\n---\n\nNever use em dashes.\n')
})

test('slugs and blocks behave on odd input', async () => {
  expect(ruleSlug('Nunca uses travessões nas newsletters!')).toBe('nunca-uses-travessoes-nas-newsletters')
  expect(ruleSlug('???')).toBe('rule')
  expect(addToBlock('', 'Be brief.').text).toBe('## Rules saved with Reflect\n\n<!-- reflect:start -->\n- Be brief.\n<!-- reflect:end -->\n')
})

// The whole path through the hooks: a prompt goes in, the model check answers, the band shows, a button is pressed.
const VERDICT = { isAnswered: true, text: '{"isRule": true, "rule": "Never use em dashes."}', usage: { input_tokens: 1, output_tokens: 1 } }

const PROMPT = { text: 'never use em dashes' }

for (const choice of ['everywhere', 'memory', 'vault', 'skip'] as const) {
  test(`button ${choice}: saves where it says, Skip saves nothing`, { options: { rulesFile: '', vaultFolder: 'C:/Vault/Rules' } }, async ($, on) => {
    const writes: string[] = []

    mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 26) })
    on('session.root', () => ({ value: 'C:\\Users\\me\\code\\notes' }))
    on('model.complete', () => ({ value: VERDICT }))
    on('fs.read', () => {
      throw new Error('ENOENT')
    })
    on('fs.exists', () => ({ value: false }))
    on('fs.write', (_, e) => {
      writes.push(String((e as { path?: string }).path))

      return { value: undefined }
    })
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('ui.log', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    // Nothing draws beneath the mod: the card stacks over an empty band.
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)

      return <Box />
    })

    await $.prompt.submit(PROMPT)
    await clock.settle()

    const ui = await $.ui.mount({ plugin: 'reflect', component: 'AbovePrompt', surface: 'terminal', props: { hasSurvey: false } } as never)
    const title = await ui.find({ type: 'Text', text: /lasting rule/ })

    expect(title).toBeTruthy()
    await ui.press({ plugin: 'reflect', key: choice })

    if (choice === 'skip') {
      expect(writes.length).toBe(0)
    } else {
      expect(writes.length).toBeGreaterThan(0)
    }

    await ui.unmount()
  })
}
