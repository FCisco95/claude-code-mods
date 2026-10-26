declare module 'claude-code' {
  interface PluginState {
    'cache-clock': {
      // Cache lifetime read from the API's reply, in ms; 0 until a reply showed one.
      ttlMs: number
      // The lifetime as the reply spelled it ('5m', '1h'); '' until known.
      ttlLabel: string
      // When the last request that used the chat's cache started, in $.clock.now() ms; 0 before any.
      lastRequestAt: number
      isTurnRunning: boolean
      // Prompt tokens the next request re-sends, from the last main-thread reply.
      contextTokens: number
      // When keep warm was switched on, in ms; 0 when off.
      keepWarmSince: number
      pingCount: number
      lastPing: string
      isHidden: boolean
    }
  }
}

export type Ttl = { ms: number; label: string }
