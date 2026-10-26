// Reading what a mod is, from its own files. Pure parsing: nothing here runs a mod or changes one.

export type ListedPlugin = {
  id: string
  version?: string
  scope?: string
  enabled?: boolean
  installPath?: string
}

export type ModInfo = {
  // `name@source`, as `claude plugin enable` and `disable` take it.
  id: string
  name: string
  title: string
  description: string
  // The first slash command the mod registers, without the slash; empty when it has none.
  command: string
  // Whether it puts a pane or a band on the screen, which is what Hide can act on.
  hasPanel: boolean
  isEnabled: boolean
  scope: string
}

export const parseList = (stdout: string): ListedPlugin[] => {
  try {
    const parsed: unknown = JSON.parse(stdout)

    return Array.isArray(parsed) ? parsed.filter((p): p is ListedPlugin => typeof p?.id === 'string') : []
  } catch {
    return []
  }
}

export const nameOf = (id: string) => id.split('@')[0] ?? id

// `brain-dump` -> `Brain Dump`
export const titleOf = (name: string) =>
  name
    .split(/[-_]+/)
    .filter(Boolean)
    .map(w => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')

// The first module a hooks.json names, or '' when the plugin is not a mod.
export const moduleOf = (hooksJson: string): string => {
  try {
    const modules: unknown = (JSON.parse(hooksJson) as { modules?: unknown }).modules

    return Array.isArray(modules) && typeof modules[0] === 'string' ? modules[0] : ''
  } catch {
    return ''
  }
}

export const commandOf = (source: string): string => /\$\.command\.register\(\s*\{\s*name:\s*['"]([^'"]+)['"]/.exec(source)?.[1] ?? ''

export const hasPanelIn = (source: string): boolean => /\$\.ui\.open\(|component:\s*['"](?:Pane|AbovePrompt)['"]/.test(source)

export const describe = (manifest: string): string => {
  try {
    const text = (JSON.parse(manifest) as { description?: unknown }).description

    return typeof text === 'string' ? text : ''
  } catch {
    return ''
  }
}

// One line is enough on a switchboard row.
export const shorten = (text: string, max = 110) => {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

// Which plugin drew a result: the innermost link of a `next.trace` that returned that very result.
// Links above it only passed it on, so they return the same thing.
export const drawnBy = (trace: readonly { plugin: string; returned?: unknown }[], result: unknown): string => {
  const wanted = JSON.stringify(result)

  for (let i = trace.length - 1; i >= 0; i--) {
    const entry = trace[i]!

    if (entry.returned !== undefined && JSON.stringify(entry.returned) === wanted) {
      return entry.plugin
    }
  }

  return ''
}
