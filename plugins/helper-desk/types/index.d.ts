export type Todo = {
  id: string
  content: string
  active: string
  status: 'pending' | 'in_progress' | 'completed'
  // When it last became in_progress, in $.clock.now() milliseconds.
  startedAt?: number
}

export type Card = {
  id: string
  name: string
  type: string
  model: string
  status: 'running' | 'done' | 'failed'
  // The task in progress when the agent was spawned; '' when none was.
  taskKey: string
  startedAt: number
  endedAt?: number
  tokens: number
  steps: number
  note: string
}

declare module 'claude-code' {
  interface PluginState {
    'helper-desk': {
      todos: Shaped<Todo[]>
      cards: Shaped<Card[]>
      // The id of the task most recently moved to in_progress; '' when none runs.
      currentTask: string
      isBandHidden: boolean
    }
  }
}
