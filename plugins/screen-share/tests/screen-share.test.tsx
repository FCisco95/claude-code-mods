import { expect, test } from 'claude-code/testing'

import { BAR, createMasker } from '../hooks/mask'

const PROSE = { isProse: true }
const RAW = { isProse: false }

const SAMPLE =
  'Send the proposal to Maria Silva at maria.silva@acme-corp.com or call +351 912 345 678. The deal is worth $48,500 (about €45k).'

test('a name, an email, a phone number and a dollar amount all become bars', async () => {
  const masked = createMasker().mask(SAMPLE, PROSE)

  expect(masked).toBe(`Send the proposal to ${BAR} at ${BAR} or call ${BAR}. The deal is worth ${BAR} (about ${BAR}).`)
  for (const secret of ['Maria', 'Silva', 'maria.silva@acme-corp.com', '912 345 678', '48,500', '45k']) {
    expect(masked).not.toContain(secret)
  }
})

test('a name learned from an email is hidden when it shows up alone', async () => {
  const masker = createMasker()

  masker.mask('Contact: john.smith@client.io', RAW)

  expect(masker.mask('Then john wrote back. Smith agreed.', RAW)).toBe(`Then ${BAR} wrote back. ${BAR} agreed.`)
})

test('a name added by hand is hidden, and greetings reveal names', async () => {
  const masker = createMasker()

  expect(masker.mask('Thanks, Beatriz.', { isProse: false, names: ['Beatriz Costa'] })).toBe(`Thanks, ${BAR}.`)
  expect(masker.mask('Hi Carlos, the call is at noon.', RAW)).toBe(`Hi ${BAR}, the call is at noon.`)
})

test('money in other shapes', async () => {
  const masker = createMasker()

  for (const money of ['$1,200.50', '€ 3.5M', '£90', 'USD 5000', '250 dollars', '12,000 EUR', '$75k']) {
    expect(masker.mask(`Price: ${money}.`, RAW)).toBe(`Price: ${BAR}.`)
  }
})

test('things that look like the categories but are not stay readable', async () => {
  const masker = createMasker()

  for (const plain of [
    'echo $1 and $2',
    'Written 2026-10-26 at 16:05:04',
    'build 1.2.3 on node 22.11.0',
    'ip 192.168.100.100',
    'context 257k tokens, 13 user turns',
    'Next Steps and Open Questions',
    'npm i @types/node pkg@1.2.3',
    'commit 3a71a8c feat(chat-handoff)',
  ]) {
    expect(masker.mask(plain, PROSE)).toBe(plain)
  }
})

test('code is left alone by the Title Case guess, tool rows only get the sure categories', async () => {
  const masker = createMasker()
  const code = 'Run `Maria Silva` here.\n```\nJohn Smith\n```'

  expect(masker.mask(code, PROSE)).toBe(code)
  expect(masker.mask('Compiling Foo Bar done', RAW)).toBe('Compiling Foo Bar done')
  expect(masker.mask('Heading\n# Maria Silva Notes', PROSE)).toBe('Heading\n# Maria Silva Notes')
})

test('tool input and output are masked in depth, paths are kept', async () => {
  const masker = createMasker()
  const out = masker.maskDeep(
    { command: 'mail ana@x.com', file: { filePath: 'C:/work/+351 912 345 678.txt', content: ['total $9,999'] }, lines: 3 },
    RAW,
  )

  expect(out).toEqual({ command: `mail ${BAR}`, file: { filePath: 'C:/work/+351 912 345 678.txt', content: [`total ${BAR}`] }, lines: 3 })
})

const ROW = { plugin: 'screen-share', component: 'AssistantMessage', requestId: 'm1', surface: 'terminal' } as const

// Nothing draws beneath the mod: this hook stands for the engine and draws the text it was handed.
const engine = (on: Parameters<Parameters<typeof test>[1]>[1]) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{String((e.props as { text?: string }).text)}</Text>
  })

test('off by default, on after /screen-share, off again after /screen-share', async ($, on) => {
  engine(on)
  on('command.register', () => ({ value: { command: 'screen-share' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const props = { text: SAMPLE, isFirstOfReply: true }
  const draw = async () => {
    const ui = await $.ui.mount({ ...ROW, props })
    const text = (await ui.find({ type: 'Text' }))?.text
    await ui.unmount()

    return text
  }

  expect(await draw()).toBe(SAMPLE)

  const on1 = await $.command.run({ command: 'screen-share', args: '' })
  expect(JSON.stringify(on1)).toContain('ON')
  expect(await draw()).toBe(`Send the proposal to ${BAR} at ${BAR} or call ${BAR}. The deal is worth ${BAR} (about ${BAR}).`)

  const off = await $.command.run({ command: 'screen-share', args: '' })
  expect(JSON.stringify(off)).toContain('OFF')
  expect(await draw()).toBe(SAMPLE)
})
