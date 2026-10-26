export type Mod = {
  id: string
  name: string
  title: string
  description: string
  command: string
  hasPanel: boolean
  isEnabled: boolean
  scope: string
}

declare module 'claude-code' {
  interface PluginState {
    switchboard: { mods: Shaped<Mod[]>; hidden: string[]; note: string; isBusy: boolean }
  }
}
