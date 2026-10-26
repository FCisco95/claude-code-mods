import { expect, mock, test } from 'claude-code/testing'

import { commandOf, describe, drawnBy, hasPanelIn, moduleOf, parseList, shorten, titleOf } from '../hooks/scan'

test('a mod is told from other plugins by the module its hooks.json names', async () => {
  expect(moduleOf('{ "modules": ["./register.tsx"] }')).toBe('./register.tsx')
  expect(moduleOf('{ "hooks": {} }')).toBe('')
  expect(moduleOf('not json')).toBe('')
})

test('what a mod is called, what it says and whether it has a panel', async () => {
  expect(titleOf('screen-share')).toBe('Screen Share')
  expect(titleOf('brain_dump')).toBe('Brain Dump')
  expect(describe('{ "description": "Hides things." }')).toBe('Hides things.')
  expect(describe('{}')).toBe('')
  expect(commandOf("await $.command.register({ name: 'replay', description: 'x' })")).toBe('replay')
  expect(commandOf('no command here')).toBe('')
  expect(hasPanelIn("void $.ui.open({ id: PANE, title: 'x' })")).toBe(true)
  expect(hasPanelIn("on('ui.render', { component: 'AbovePrompt' }, h)")).toBe(true)
  expect(hasPanelIn("on('prompt.submit', h)")).toBe(false)
  expect(shorten('a '.repeat(100)).length).toBeLessThanOrEqual(110)
})

test('the list is read from the CLI JSON and bad output gives nothing', async () => {
  expect(parseList('[{"id":"a@skills-dir","enabled":true},{"nope":1}]')).toEqual([{ id: 'a@skills-dir', enabled: true }])
  expect(parseList('oops')).toEqual([])
  expect(parseList('{}')).toEqual([])
})

test('the plugin that drew a result is the innermost link that returned it', async () => {
  const tree = { type: 'Box', text: 'band' }
  const trace = [
    { plugin: 'switchboard', returned: tree },
    { plugin: 'cache-clock', returned: tree },
    { plugin: 'chat-handoff', returned: undefined },
    { plugin: 'engine', returned: undefined },
  ]

  expect(drawnBy(trace, tree)).toBe('cache-clock')
  expect(drawnBy(trace, { other: true })).toBe('')
})

const LISTED = JSON.stringify([
  { id: 'cache-clock@skills-dir', version: '0.1.0', scope: 'user', enabled: true, installPath: 'C:\\m\\cache-clock' },
  { id: 'screen-share@skills-dir', version: '0.1.0', scope: 'user', enabled: false, installPath: 'C:\\m\\screen-share' },
  { id: 'some-skill@market', version: '1.0.0', scope: 'user', enabled: true, installPath: 'C:\\m\\some-skill' },
])

const FILES: Record<string, string> = {
  'C:/m/cache-clock/hooks/hooks.json': '{ "modules": ["./register.tsx"] }',
  'C:/m/cache-clock/hooks/register.tsx': "$.command.register({ name: 'keep', description: 'x' }); on('ui.render', { component: 'AbovePrompt' }, h)",
  'C:/m/cache-clock/.claude-plugin/plugin.json': '{ "description": "Counts down until the cache goes cold" }',
  'C:/m/screen-share/hooks/hooks.json': '{ "modules": ["./register.tsx"] }',
  'C:/m/screen-share/hooks/register.tsx': "$.command.register({ name: 'screen-share', description: 'x' })",
  'C:/m/screen-share/.claude-plugin/plugin.json': '{ "description": "Hides names" }',
}

const PANE = {
  plugin: 'switchboard',
  component: 'Pane',
  requestId: 'switchboard',
  surface: 'terminal',
  props: { title: 'Mods', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 22 }, view: {} },
} as const

test('/mods lists the mods, leaves out plain plugins, and a click switches one', async ($, on) => {
  const ran: string[][] = []

  mock.clock(on)
  on('command.register', () => ({ value: { command: 'mods' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({}))
  on('fs.exists', (_, e) => ({ value: e.path.replace(/\\/g, '/') in FILES }))
  on('fs.read', (_, e) => ({ value: FILES[e.path.replace(/\\/g, '/')] ?? '' }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])

    return { value: { exitCode: 0, stdout: e.argv[2] === 'list' ? LISTED : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(JSON.stringify(await $.command.run({ command: 'mods', args: '' }))).toContain('2 mods')

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /Cache Clock/ }))?.text).toBe('Cache Clock')
  expect((await ui.find({ type: 'Text', text: /Screen Share/ }))?.text).toBe('Screen Share')
  expect(await ui.find({ type: 'Text', text: /Some Skill/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /Counts down/ }))?.text).toBe('Counts down until the cache goes cold')
  expect((await ui.find({ type: 'Text', text: /\/keep/ }))?.text).toBe('/keep')
  expect((await ui.find({ type: 'Text', text: /1 of 2 on/ }))?.text).toBe('1 of 2 on')

  await ui.press({ key: 'on-cache-clock@skills-dir' })
  expect(ran.some(argv => argv.join(' ') === 'claude plugin disable cache-clock@skills-dir --scope user')).toBe(true)
  expect((await ui.find({ type: 'Text', text: /is off in every chat/ }))?.text).toBe('Cache Clock is off in every chat. This chat may keep showing what it already drew until you start a new chat.')

  await ui.press({ key: 'on-screen-share@skills-dir' })
  expect(ran.some(argv => argv.join(' ') === 'claude plugin enable screen-share@skills-dir --scope user')).toBe(true)
  await ui.unmount()
})
