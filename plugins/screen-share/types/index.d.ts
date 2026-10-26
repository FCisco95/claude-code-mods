export type NameList = string[]

declare module 'claude-code' {
  interface PluginState {
    'screen-share': { isActive: boolean; names: NameList }
  }
}
