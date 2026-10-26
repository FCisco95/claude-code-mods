import { expect, mock, test } from 'claude-code/testing'

import { connectorOf, EMPTY, iconOf, fromMessages, onPrompt, onSkill, onTodoTool, onToolRan, shortGoal, tidyPath } from '../hooks/capture'

test('a connector call is named, counted and remembers its last tool', async () => {
  expect(connectorOf('mcp__claude_ai_Google_Calendar__list_events')).toEqual({ name: 'Google Calendar', tool: 'list_events' })
  expect(connectorOf('mcp__plugin_claude-mem_mcp-search__search')).toEqual({ name: 'claude-mem', tool: 'search' })
  expect(connectorOf('mcp__context7__query-docs')).toEqual({ name: 'context7', tool: 'query-docs' })
  expect(connectorOf('Read')).toBeNull()

  let inv = EMPTY
  inv = onToolRan(inv, 'mcp__claude_ai_Gmail__get_thread', {}, false)
  inv = onToolRan(inv, 'mcp__claude_ai_Google_Drive__search_files', {}, false)
  inv = onToolRan(inv, 'mcp__claude_ai_Gmail__search_threads', {}, false)
  inv = onToolRan(inv, 'mcp__claude_ai_Gmail__get_thread', {}, false)

  expect(inv.connectors).toEqual([
    { name: 'Gmail', lastTool: 'get_thread', calls: 3 },
    { name: 'Google Drive', lastTool: 'search_files', calls: 1 },
  ])
})

test('a CRM, an email and a drive each get their own entry', async () => {
  let inv = EMPTY
  for (const tool of ['mcp__attio__search_records', 'mcp__claude_ai_Gmail__get_thread', 'mcp__claude_ai_Google_Drive__read_file', 'mcp__attio__search_records']) {
    inv = onToolRan(inv, tool, {}, false)
  }

  expect(inv.connectors.map(c => `${c.name}:${c.calls}`)).toEqual(['attio:2', 'Gmail:1', 'Google Drive:1'])
})

test('files read and files created are kept apart, and an overwrite is not a creation', async () => {
  let inv = EMPTY
  inv = onToolRan(inv, 'Read', { file_path: 'C:/a/notes.md' }, false)
  inv = onToolRan(inv, 'Read', { file_path: 'C:/a/notes.md' }, false)
  inv = onToolRan(inv, 'Write', { file_path: 'C:/a/brief.md' }, true)
  inv = onToolRan(inv, 'Write', { file_path: 'C:/a/old.md' }, false)
  inv = onToolRan(inv, 'Grep', { pattern: 'x' }, false)

  expect(inv.filesRead).toEqual([{ path: 'C:/a/notes.md', count: 2 }])
  expect(inv.filesCreated).toEqual([{ path: 'C:/a/brief.md', count: 1 }])
  expect(tidyPath('C:\\Users\\me\\code\\x\\brief.md', 'C:\\Users\\me')).toEqual({ dir: '~/code/x', base: 'brief.md' })
})

test('skills are counted once per use', async () => {
  const inv = onSkill(onSkill(onSkill(EMPTY, 'call-prep'), 'call-prep'), 'brand')

  expect(inv.skills).toEqual([
    { name: 'call-prep', uses: 2 },
    { name: 'brand', uses: 1 },
  ])
})

test('the to-do list takes the prompt that started it as its goal', async () => {
  let inv = onPrompt(EMPTY, 'Prep me for tomorrow. Find it in my calendar, read our calls, then write a brief.')
  expect(inv.lastPrompt).toBe('Prep me for tomorrow.')

  inv = onTodoTool(inv, 'TodoWrite', {
    todos: [
      { content: 'Find the call', status: 'completed' },
      { content: 'Read the thread', status: 'in_progress' },
      { content: 'Write the brief', status: 'pending' },
    ],
  })
  expect(inv.goal).toBe('Prep me for tomorrow.')
  expect(inv.todos.map(t => t.status)).toEqual(['completed', 'in_progress', 'pending'])

  // A later prompt does not change the goal while the list is still open.
  inv = onPrompt(inv, 'Also check the weather.')
  inv = onTodoTool(inv, 'TodoWrite', { todos: inv.todos.map(t => ({ content: t.content, status: t.status })) })
  expect(inv.goal).toBe('Prep me for tomorrow.')

  // Once every item is done, the next list is a new job with its own goal.
  inv = onTodoTool(inv, 'TodoWrite', { todos: inv.todos.map(t => ({ content: t.content, status: 'completed' })) })
  inv = onTodoTool(inv, 'TodoWrite', { todos: [{ content: 'Weather', status: 'pending' }] })
  expect(inv.goal).toBe('Also check the weather.')
})

test('task tools and the memory plugin write the same list', async () => {
  let inv = onPrompt(EMPTY, 'Ship it.')
  inv = onTodoTool(inv, 'TaskCreate', { subject: 'Build' })
  inv = onTodoTool(inv, 'TaskCreate', { subject: 'Test' })
  inv = onTodoTool(inv, 'TaskUpdate', { taskId: '1', status: 'completed' })
  inv = onTodoTool(inv, 'mcp__plugin_claude-mem_mcp-search__work_state_write', { list: 'ship', fields: { task: 'Deploy', status: 'doing' } })

  expect(inv.todos.map(t => `${t.content}:${t.status}`)).toEqual(['Build:completed', 'Test:pending', 'Deploy:in_progress'])
  expect(shortGoal('x'.repeat(200)).length).toBe(80)
})

test('a chat already running is rebuilt from its transcript', async () => {
  const inv = fromMessages([
    { role: 'user', text: 'Make the report.', toolUses: [] },
    {
      role: 'assistant',
      text: '',
      toolUses: [
        { tool: 'Skill', input: { skill: 'call-prep' } },
        { tool: 'mcp__claude_ai_Gmail__get_thread', input: {} },
        { tool: 'Read', input: { file_path: 'C:/a/n.md' } },
        { tool: 'Write', input: { file_path: 'C:/a/r.md' }, text: 'File created successfully at: C:/a/r.md' },
        { tool: 'Write', input: { file_path: 'C:/a/o.md' }, text: 'The file C:/a/o.md has been updated successfully.' },
      ],
    },
  ])

  expect(inv.skills).toEqual([{ name: 'call-prep', uses: 1 }])
  expect(inv.connectors).toEqual([{ name: 'Gmail', lastTool: 'get_thread', calls: 1 }])
  expect(inv.filesRead.map(f => f.path)).toEqual(['C:/a/n.md'])
  expect(inv.filesCreated.map(f => f.path)).toEqual(['C:/a/r.md'])
})

// Through the hooks: tool calls go in, the pane draws them.
test('the pane shows each connector with its count, as the calls happen', async ($, on) => {
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('tool.call', () => ({ result: {} }))
  on('fs.exists', () => ({ value: false }))
  on('command.register', () => ({ value: { command: 'inventory' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__attio__search_records' })
  await $.tool.call({ tool: 'mcp__claude_ai_Gmail__get_thread' })
  await $.tool.call({ tool: 'mcp__attio__search_records' })

  const ui = await $.ui.mount({
    plugin: 'chat-inventory',
    component: 'Pane',
    requestId: 'chat-inventory',
    surface: 'terminal',
    props: { title: 'In this chat', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as never)

  expect((await ui.find({ type: 'Text', text: /2 calls/ }))?.text).toBe('2 calls')
  expect((await ui.find({ type: 'Text', text: /1 call$/ }))?.text).toBe('1 call')
  expect(await ui.find({ type: 'Text', text: /^Gmail$/ })).toBeTruthy()
  await ui.unmount()
})

test('well-known connectors get an emoji and the rest fall back to an initial', async () => {
  expect(iconOf('Gmail')).toBe('📧')
  expect(iconOf('Google Calendar')).toBe('📅')
  expect(iconOf('Google Drive')).toBe('📁')
  expect(iconOf('attio')).toBe('🤝')
  expect(iconOf('microsoft-learn')).toBe('📚')
  expect(iconOf('plugin-authoring')).toBe('')
})
