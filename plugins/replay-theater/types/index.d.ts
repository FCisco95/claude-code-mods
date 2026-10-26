export type Step = {
  id: string
  // What the tool call was: an Edit, a Write that made a new file, a Write over an existing one.
  kind: 'edit' | 'create' | 'overwrite'
  path: string
  lines: { sign: '+' | '-'; text: string }[]
  added: number
  removed: number
  isCut: boolean
  isReplaceAll: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'replay-theater': { steps: Shaped<Step[]>; at: number }
  }
}
