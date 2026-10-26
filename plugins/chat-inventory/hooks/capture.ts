// Pure functions: how one event changes the inventory. No engine calls, no model calls.

import type { Connector, Counted, FileRow, Inventory, Todo } from '../types'

export const EMPTY: Inventory = {
  goal: '',
  lastPrompt: '',
  todos: [],
  connectors: [],
  skills: [],
  filesRead: [],
  filesCreated: [],
}

type Input = Record<string, unknown>

const MAX_ROWS = 60

// The first sentence of a prompt, on one line, at most 80 characters.
export const shortGoal = (text: string) => {
  const one = text.replace(/\s+/g, ' ').trim()
  const sentence = one.split(/(?<=[.!?])\s/)[0] ?? one

  return sentence.length > 80 ? `${sentence.slice(0, 79)}…` : sentence
}

// `mcp__claude_ai_Google_Calendar__list_events` -> { name: 'Google Calendar', tool: 'list_events' }.
export const connectorOf = (tool: string) => {
  if (!tool.startsWith('mcp__')) {
    return null
  }

  const rest = tool.slice(5)
  const cut = rest.indexOf('__')
  const server = cut === -1 ? rest : rest.slice(0, cut)
  const called = cut === -1 ? '' : rest.slice(cut + 2)
  let pretty = server

  if (pretty.startsWith('claude_ai_')) {
    pretty = pretty.slice('claude_ai_'.length)
  } else if (pretty.startsWith('plugin_')) {
    pretty = pretty.slice('plugin_'.length).split('_')[0] || pretty
  }

  return { name: pretty.replace(/_/g, ' '), tool: called }
}

// A terminal panel cannot draw logos, so well-known services get an emoji; anything else gets a coloured initial.
// To add a service, add a line: the first pattern that matches the connector's name wins.
const ICONS: [RegExp, string][] = [
  [/gmail|mail/i, '📧'],
  [/calendar/i, '📅'],
  [/drive|dropbox|onedrive|box/i, '📁'],
  [/slack|teams|discord/i, '💬'],
  [/github|gitlab/i, '🐙'],
  [/notion|obsidian|confluence/i, '📝'],
  [/linear|jira|asana|trello/i, '📋'],
  [/attio|hubspot|salesforce|pipedrive|crm/i, '🤝'],
  [/fireflies|otter|granola/i, '🎤'],
  [/zoom|meet/i, '🎥'],
  [/supabase|postgres|sql|database|neon/i, '💾'],
  [/playwright|browser|puppeteer/i, '🌐'],
  [/context7|docs|learn|microsoft/i, '📚'],
  [/video|youtube/i, '🎬'],
  [/mem|memory/i, '🧠'],
  [/figma/i, '🎨'],
  [/stripe/i, '💳'],
  [/sentry/i, '🐞'],
]

export const iconOf = (name: string) => ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? ''

// A path on one line: forward slashes, the home folder as ~.
export const tidyPath = (path: string, home: string) => {
  const p = path.replace(/\\/g, '/')
  const h = home.replace(/\\/g, '/').replace(/\/+$/, '')
  const short = h && p.toLowerCase().startsWith(`${h.toLowerCase()}/`) ? `~${p.slice(h.length)}` : p
  const cut = short.lastIndexOf('/')

  return { dir: cut > 0 ? short.slice(0, cut) : '', base: short.slice(cut + 1) || short }
}

const normalizeStatus = (raw: unknown): Todo['status'] => (raw === 'completed' || raw === 'in_progress' ? raw : 'pending')

const bump = <T extends { count: number; path: string }>(list: T[], path: string): T[] => {
  const has = list.some(r => r.path === path)

  return (has ? list.map(r => (r.path === path ? { ...r, count: r.count + 1 } : r)) : [...list, { path, count: 1 } as T]).slice(-MAX_ROWS)
}

export const onPrompt = (inv: Inventory, text: string): Inventory => ({ ...inv, lastPrompt: shortGoal(text) })

// A new to-do list starts a new goal: the prompt that was current when it appeared.
const withTodos = (inv: Inventory, todos: Todo[]): Inventory => {
  const wasOver = inv.todos.length === 0 || inv.todos.every(t => t.status === 'completed')
  const isNew = todos.some(t => t.status !== 'completed')

  return { ...inv, todos, goal: wasOver && isNew ? inv.lastPrompt : inv.goal }
}

export const onSkill = (inv: Inventory, name: string): Inventory => {
  const has = inv.skills.some(s => s.name === name)
  const skills: Counted[] = has ? inv.skills.map(s => (s.name === name ? { ...s, uses: s.uses + 1 } : s)) : [...inv.skills, { name, uses: 1 }]

  return { ...inv, skills }
}

// The four ways a to-do list is written: TodoWrite (whole list), TaskCreate and TaskUpdate (one task),
// and the work_state_write tool of the memory plugin (one entry per call).
export const onTodoTool = (inv: Inventory, tool: string, input: Input): Inventory => {
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    const todos = input.todos.flatMap((t: unknown, i: number) => {
      const row = t as Input

      return typeof row?.content === 'string' ? [{ id: `t${i}`, content: row.content, status: normalizeStatus(row.status) }] : []
    })

    return withTodos(inv, todos)
  }

  if (tool === 'TaskCreate' && typeof input.subject === 'string') {
    const next = Math.max(0, ...inv.todos.map(t => Number(t.id) || 0)) + 1

    return withTodos(inv, [...inv.todos, { id: String(next), content: input.subject, status: 'pending' }])
  }

  if (tool === 'TaskUpdate' && typeof input.taskId === 'string') {
    const id = input.taskId
    const todos =
      input.status === 'deleted'
        ? inv.todos.filter(t => t.id !== id)
        : inv.todos.map(t =>
            t.id === id
              ? {
                  ...t,
                  content: typeof input.subject === 'string' ? input.subject : t.content,
                  status: input.status === undefined ? t.status : normalizeStatus(input.status),
                }
              : t,
          )

    return withTodos(inv, todos)
  }

  if (tool.endsWith('work_state_write')) {
    const fields = input.fields as Input | undefined
    const task = fields?.task

    if (typeof task !== 'string') {
      return inv
    }

    const id = `${typeof input.list === 'string' ? input.list : 'tasks'}:${task}`
    const status: Todo['status'] = fields?.status === 'done' ? 'completed' : fields?.status === 'doing' ? 'in_progress' : 'pending'

    if (fields?.status === 'dropped') {
      return withTodos(inv, inv.todos.filter(t => t.id !== id))
    }

    const has = inv.todos.some(t => t.id === id)

    return withTodos(inv, has ? inv.todos.map(t => (t.id === id ? { ...t, status } : t)) : [...inv.todos, { id, content: task, status }])
  }

  return inv
}

// A tool call that ran: counts a connector call, a file read, or a file created.
// `isCreated` is the caller's word that a Write made a file that was not there.
export const onToolRan = (inv: Inventory, tool: string, input: Input, isCreated: boolean): Inventory => {
  const connector = connectorOf(tool)

  if (connector) {
    const has = inv.connectors.some(c => c.name === connector.name)
    const connectors: Connector[] = has
      ? inv.connectors.map(c => (c.name === connector.name ? { ...c, lastTool: connector.tool, calls: c.calls + 1 } : c))
      : [...inv.connectors, { name: connector.name, lastTool: connector.tool, calls: 1 }]

    return { ...inv, connectors }
  }

  const path = typeof input.file_path === 'string' ? input.file_path : ''

  if (tool === 'Read' && path) {
    return { ...inv, filesRead: bump<FileRow>(inv.filesRead, path) }
  }

  if (tool === 'Write' && path && isCreated) {
    return { ...inv, filesCreated: bump<FileRow>(inv.filesCreated, path) }
  }

  return inv
}

type Message = { role: string; text: string; toolUses: readonly { tool: string; input: unknown; text?: string }[] }

// Rebuilds the inventory from a transcript, for a chat that was already running when the mod started.
export const fromMessages = (messages: readonly Message[]): Inventory => {
  let inv = EMPTY

  for (const m of messages) {
    if (m.role === 'user' && m.text.trim() && !m.text.trim().startsWith('<') && !m.text.trim().startsWith('/')) {
      inv = onPrompt(inv, m.text)
    }

    for (const use of m.toolUses) {
      const input = (use.input ?? {}) as Input

      if (use.tool === 'Skill' && typeof input.skill === 'string') {
        inv = onSkill(inv, input.skill)
      }

      inv = onTodoTool(inv, use.tool, input)
      inv = onToolRan(inv, use.tool, input, /created successfully/i.test(use.text ?? ''))
    }
  }

  return inv
}

export const isEmpty = (inv: Inventory) =>
  inv.todos.length + inv.connectors.length + inv.skills.length + inv.filesRead.length + inv.filesCreated.length === 0
