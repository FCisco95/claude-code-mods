export type Candidate = {
  id: string
  // The rule as one standalone sentence, in the language the user wrote it in.
  rule: string
}

declare module 'claude-code' {
  interface PluginState {
    reflect: {
      // Rules waiting for a choice, oldest first. The band shows the first.
      pending: Shaped<Candidate[]>
    }
  }
}
