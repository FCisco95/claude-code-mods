declare module 'claude-code' {
  interface PluginState {
    'chat-handoff': {
      // 'idle' nothing to show, 'working' the prompt is being written, 'ready' it is written, 'failed' it could not be.
      status: 'idle' | 'working' | 'ready' | 'failed'
      // What fired it: 'tokens', 'cold' or 'command'.
      reason: string
      // The handoff prompt, plain text; '' until one is written.
      draft: string
      // Where a copy was saved, '' when it could not be saved.
      savedPath: string
      words: number
      // How many prompts the user had sent when the draft was written; a later count means the chat moved on.
      atTurns: number
      error: string
      isHidden: boolean
      isLaunching: boolean
    }
  }
}

export type Reason = 'tokens' | 'cold' | 'command'
