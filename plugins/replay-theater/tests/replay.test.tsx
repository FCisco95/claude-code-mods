import { expect, test } from 'claude-code/testing'

import { diffText } from '../hooks/diff'

const PANE = {
  plugin: 'replay-theater',
  component: 'Pane',
  requestId: 'replay-theater',
  surface: 'terminal',
  props: { title: 'Replay Theater', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 18 }, view: {} },
} as const

test('the diff shows only the lines that went and the lines that came', async () => {
  const change = diffText(
    'There has never been a better time to be a small team.\nFor years big companies had the people and the tools.\nKeep this.',
    'Small teams now have the tools big companies had.\nKeep this.',
  )

  expect(change.lines).toEqual([
    { sign: '-', text: 'There has never been a better time to be a small team.' },
    { sign: '-', text: 'For years big companies had the people and the tools.' },
    { sign: '+', text: 'Small teams now have the tools big companies had.' },
  ])
  expect([change.added, change.removed]).toEqual([1, 2])
})

test('a line diff keeps untouched lines out and counts a new file as all added', async () => {
  const change = diffText('a\nb\nc\nd', 'a\nB\nc\nd\ne')

  expect(change.lines).toEqual([
    { sign: '-', text: 'b' },
    { sign: '+', text: 'B' },
    { sign: '+', text: 'e' },
  ])
  expect(diffText('', 'one\ntwo')).toMatchObject({ added: 2, removed: 0 })
  expect(diffText('same', 'same').lines).toEqual([])
})

test('a very long change keeps exact counts and a capped list', async () => {
  const change = diffText('', Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n'))

  expect(change.added).toBe(500)
  expect(change.lines.length).toBe(200)
  expect(change.isCut).toBe(true)
})

test('/replay steps through the edits of a turn, one at a time', async ($, on) => {
  on('command.register', () => ({ value: { command: 'replay' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({}))
  on('env.get', () => ({ value: 'C:\\Users\\me' }))
  on('fs.exists', (_, e) => ({ value: e.path.endsWith('old.md') }))
  on('fs.read', () => ({ value: 'keep\nold line\nkeep too' }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(JSON.stringify(await $.command.run({ command: 'replay', args: '' }))).toContain('No file edits')

  await $.tool.call({ tool: 'Edit', file_path: 'C:\\Users\\me\\Newsletter\\draft.md', old_string: 'Hello there\nbig news', new_string: 'Hi\nbig news' })
  await $.tool.call({ tool: 'Write', file_path: 'C:\\Users\\me\\Newsletter\\old.md', content: 'keep\nnew line\nkeep too' })
  await $.tool.call({ tool: 'Write', file_path: 'C:\\Users\\me\\Newsletter\\fresh.md', content: 'a\nb' })

  expect(JSON.stringify(await $.command.run({ command: 'replay', args: '' }))).toContain('Replaying 3 edits')

  const ui = await $.ui.mount(PANE)
  expect((await ui.find({ type: 'Text', text: /step 1 of 3/ }))?.text).toBe('step 1 of 3')
  expect((await ui.find({ type: 'Text', text: /~\/Newsletter\/draft\.md/ }))?.text).toBe('~/Newsletter/draft.md')
  expect((await ui.find({ type: 'Text', text: /^- Hello there/ }))?.text).toBe('- Hello there')
  expect((await ui.find({ type: 'Text', text: /^\+ Hi/ }))?.text).toBe('+ Hi')

  await ui.press({ key: 'next' })
  expect((await ui.find({ type: 'Text', text: /step 2 of 3/ }))?.text).toBe('step 2 of 3')
  expect((await ui.find({ type: 'Text', text: /^- old line/ }))?.text).toBe('- old line')
  expect((await ui.find({ type: 'Text', text: /^\+ new line/ }))?.text).toBe('+ new line')

  await ui.press({ key: 'next' })
  await ui.press({ key: 'next' })
  expect((await ui.find({ type: 'Text', text: /step 3 of 3/ }))?.text).toBe('step 3 of 3')
  expect((await ui.find({ type: 'Text', text: /New file/ }))?.text).toBe('New file')

  await ui.press({ key: 'prev' })
  expect((await ui.find({ type: 'Text', text: /step 2 of 3/ }))?.text).toBe('step 2 of 3')
  await ui.unmount()
})
