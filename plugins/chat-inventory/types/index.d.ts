export type Todo = {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

// One connector (an MCP server): its display name, the last tool called on it, and how many calls ran.
export type Connector = {
  name: string
  lastTool: string
  calls: number
}

export type Counted = {
  name: string
  uses: number
}

export type FileRow = {
  path: string
  count: number
}

// Everything the panel shows, kept as one value so a rebuild from the transcript and the live record
// go through the same functions.
export type Inventory = {
  // The prompt that started the current to-do list, cut to one short line.
  goal: string
  // The user's latest own prompt, cut to one short line; becomes the goal when a new list starts.
  lastPrompt: string
  todos: Todo[]
  connectors: Connector[]
  skills: Counted[]
  filesRead: FileRow[]
  filesCreated: FileRow[]
}

declare module 'claude-code' {
  interface PluginState {
    'chat-inventory': {
      inventory: Shaped<Inventory>
    }
  }
}
