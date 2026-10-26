import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mod } from '../types'
import { commandOf, describe, drawnBy, hasPanelIn, moduleOf, nameOf, parseList, shorten, titleOf } from './scan'
import type { ListedPlugin } from './scan'

const PANE = 'switchboard'
// While the pane is open the list is read again this often, so a mod you just added or removed shows up.
const REFRESH_MS = 5000
const GREEN = '#16a34a'
const ACCENT = '#0369a1'

// Change the tag when a row's fields change: it declines what an earlier version stored, which outlives a reload.
const mods = atom({ plugin: 'switchboard', key: 'mods' } as const, [] as Mod[], { shape: 'mods-1' })
// Names of the mods whose panel is hidden: they stay on, their pane or band is not drawn.
const hidden = atom({ plugin: 'switchboard', key: 'hidden' } as const, [] as string[])
const note = atom({ plugin: 'switchboard', key: 'note' } as const, '')
const isBusy = atom({ plugin: 'switchboard', key: 'isBusy' } as const, false)

// What reading a mod's files found, kept by folder and version so the list is cheap to refresh.
const known = new Map<string, Omit<Mod, 'id' | 'isEnabled' | 'scope'> | null>()
let seenAt = 0

const slash = (path: string) => path.replace(/\\/g, '/')

const readText = async ($: EngineInterface, path: string): Promise<string> => {
  try {
    return (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  } catch {
    return ''
  }
}

// A plugin is a mod when its hooks.json names a module. Anything else (skills, agents) is left out.
const inspect = async ($: EngineInterface, plugin: ListedPlugin): Promise<Mod | null> => {
  if (!plugin.installPath) {
    return null
  }

  const key = `${plugin.installPath}@${plugin.version ?? ''}`

  if (!known.has(key)) {
    const base = slash(plugin.installPath)
    const module = moduleOf(await readText($, `${base}/hooks/hooks.json`))
    let found: Omit<Mod, 'id' | 'isEnabled' | 'scope'> | null = null

    if (module) {
      const source = await readText($, `${base}/hooks/${module.replace(/^\.\//, '')}`)
      const name = nameOf(plugin.id)

      found = {
        name,
        title: titleOf(name),
        description: shorten(describe(await readText($, `${base}/.claude-plugin/plugin.json`))),
        command: commandOf(source),
        hasPanel: hasPanelIn(source),
      }
    }

    known.set(key, found)
  }

  const found = known.get(key)

  return found ? { ...found, id: plugin.id, isEnabled: plugin.enabled !== false, scope: plugin.scope ?? 'user' } : null
}

const refresh = async ($: EngineInterface) => {
  try {
    const run = await $.process.run(['claude', 'plugin', 'list', '--json'], { timeoutMs: 30_000 })

    if (run.exitCode !== 0) {
      await update($, note, () => `Could not read the list of mods (${run.stderr.trim().split('\n')[0] ?? 'unknown error'}).`)

      return
    }

    const found: Mod[] = []

    for (const plugin of parseList(run.stdout)) {
      const mod = await inspect($, plugin)

      if (mod) {
        found.push(mod)
      }
    }

    found.sort((a, b) => a.title.localeCompare(b.title))
    await update($, mods, () => found)
  } catch (e) {
    await update($, note, () => `Could not read the list of mods (${e instanceof Error ? e.message : String(e)}).`)
  }
}

const toggle = async ($: EngineInterface, mod: Mod) => {
  if (mod.name === $.plugin.name || (await read($, isBusy))) {
    return
  }

  await update($, isBusy, () => true)
  const verb = mod.isEnabled ? 'disable' : 'enable'

  try {
    const run = await $.process.run(['claude', 'plugin', verb, mod.id, '--scope', mod.scope], { timeoutMs: 60_000 })

    await update($, note, () =>
      run.exitCode === 0
        ? `${mod.title} is ${mod.isEnabled ? 'off' : 'on'} in every chat.`
        : `Could not switch ${mod.title} ${mod.isEnabled ? 'off' : 'on'}: ${(run.stderr || run.stdout).trim().split('\n')[0] ?? 'unknown error'}`,
    )
  } catch (e) {
    await update($, note, () => `Could not switch ${mod.title}: ${e instanceof Error ? e.message : String(e)}`)
  }

  await refresh($)
  await update($, isBusy, () => false)
}

const toggleHidden = async ($: EngineInterface, mod: Mod) => {
  const isHidden = (await read($, hidden)).includes(mod.name)

  await update($, hidden, list => (isHidden ? list.filter(n => n !== mod.name) : [...list, mod.name]))
  await update($, note, () => (isHidden ? `${mod.title}'s panel is showing again.` : `${mod.title} stays on, its panel is hidden.`))
  $.ui.invalidate('ui.render')
}

const openBoard = async ($: EngineInterface) => {
  await update($, note, () => '')
  await $.ui.open({ id: PANE, title: 'Mods', focus: true, closeOnEscape: true, rows: 22 })
  seenAt = await $.clock.now()
  await refresh($)

  return { text: `${(await read($, mods)).length} mods. Switch each one on or off, or hide its panel, in the Mods pane.` }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const description = 'One list of every mod you run: switch each on or off, hide its panel'

    // A built-in /mods may own the name: then /switchboard opens the same list.
    try {
      await $.command.register({ name: 'mods', description })
    } catch (error) {
      $.ui.log(`switchboard: /mods is taken (${String(error)}); use /switchboard`, { to: 'debug' })
    }

    await $.command.register({ name: 'switchboard', description })

    $.clock.every(REFRESH_MS, async () => {
      // Only while the pane is on screen: it draws, and each draw says so.
      if ((await $.clock.now()) - seenAt < REFRESH_MS * 2) {
        await refresh($)
      }
    })

    return next(e)
  })

  on('command.run', { command: 'mods' }, $ => openBoard($))
  on('command.run', { command: 'switchboard' }, $ => openBoard($))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, mods)
    const off = await read($, hidden)
    const busy = await read($, isBusy)
    const message = await read($, note)

    seenAt = await $.clock.now()

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={2}>
          <Text color={ACCENT} weight="bold">Mods</Text>
          <Text dimColor>{`${list.filter(m => m.isEnabled).length} on of ${list.length}`}</Text>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
          <Button key="close" label="Close" hotkey="c" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {list.length === 0 && <Text dimColor>Reading the mods...</Text>}
        {list.map(mod => {
          const isSelf = mod.name === $.plugin.name
          const isHidden = off.includes(mod.name)

          return (
            <Box key={`row-${mod.id}`} flexDirection="column" marginTop={1}>
              <Box gap={1}>
                {isSelf ? (
                  <Text dimColor>always on</Text>
                ) : (
                  <Button
                    key={`on-${mod.id}`}
                    label={busy ? '...' : mod.isEnabled ? '● On' : '○ Off'}
                    variant={mod.isEnabled ? 'primary' : undefined}
                    onPress={() => toggle($, mod)}
                  />
                )}
                {mod.hasPanel && mod.isEnabled && (
                  <Button key={`eye-${mod.id}`} label={isHidden ? 'Show panel' : 'Hide panel'} onPress={() => toggleHidden($, mod)} />
                )}
                <Text weight="bold" dimColor={!mod.isEnabled}>{mod.title}</Text>
              </Box>
              {mod.description !== '' && <Text dimColor wrap="truncate-end">{mod.description}</Text>}
              {mod.command !== '' && <Text dimColor italic>{`/${mod.command}`}</Text>}
            </Box>
          )
        })}
        <Box marginTop={1} flexDirection="column">
          {message !== '' && <Text color={GREEN}>{message}</Text>}
          <Text dimColor>Off means off in every chat. Hide keeps a mod on but its panel out of sight. New mods appear here by themselves.</Text>
        </Box>
      </Box>
    )
  })

  // Hide: whatever a hidden mod draws above the prompt or in a pane is replaced by nothing, not by an empty box.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const out = await next(e)
    const off = await read($, hidden)

    if (off.length === 0 || !off.includes(drawnBy(next.trace, out))) {
      return out
    }

    const { Box } = $.ui.resolve(e)

    return <Box display="none" />
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const out = await next(e)
    const off = await read($, hidden)

    if (e.requestId === PANE || off.length === 0 || !off.includes(drawnBy(next.trace, out))) {
      return out
    }

    const { Text } = $.ui.resolve(e)

    return <Text dimColor>Hidden. Open /mods to show this panel again.</Text>
  })
}
