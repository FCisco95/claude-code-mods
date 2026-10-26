import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Inventory } from '../types'
import { EMPTY, fromMessages, iconOf, isEmpty, onPrompt, onSkill, onTodoTool, onToolRan, tidyPath } from './capture'

const PANE = 'chat-inventory'
const GREEN = '#16a34a'
const ORANGE = '#c2410c'
// One colour per connector, picked from its name, so a connector keeps its colour all chat.
const BADGES = ['#2563eb', '#db2777', '#ea580c', '#16a34a', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626']
// Rows each list may take before it says "+N more".
const MAX_TODOS = 10
const MAX_CONNECTORS = 8
const MAX_FILES = 4
const MAX_SKILLS = 6

// Change the tag when the fields of Inventory change: the engine declines what an earlier version stored.
const inventory = atom({ plugin: 'chat-inventory', key: 'inventory' } as const, EMPTY, { shape: 'inventory-1' })

const badgeColor = (name: string) => {
  let hash = 0

  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  }

  return BADGES[hash % BADGES.length]
}

const callsLabel = (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}`

const homeOf = async ($: EngineInterface) => ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'inventory', description: 'Open the "In this chat" panel: to-do, connectors, skills and files' })

    // A chat that was already running (a resume, a reload of this mod over a live chat) is rebuilt from its transcript once.
    try {
      if (isEmpty(await read($, inventory))) {
        const rebuilt = fromMessages(await $.session.messages())

        if (!isEmpty(rebuilt)) {
          await update($, inventory, () => rebuilt)
        }
      }
    } catch {
      // an empty panel is better than a failed start
    }

    void $.ui.open({ id: PANE, title: 'In this chat' })

    return next(e)
  })

  on('command.run', { command: 'inventory' }, async $ => {
    await $.ui.open({ id: PANE, title: 'In this chat', focus: true })

    return { text: 'In this chat panel opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && !e.command && !e.isMeta) {
      await update($, inventory, inv => onPrompt(inv, e.text))
    }

    return next(e)
  })

  // Every skill the model loads, a user types as /name, or a subagent preloads passes here once.
  on('skill.prompt', async ($, e, next) => {
    await update($, inventory, inv => onSkill(inv, e.skill))

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const path = typeof input.file_path === 'string' ? input.file_path : ''

    // The to-do list is applied before the call runs, so the panel is current while the step works.
    await update($, inventory, inv => onTodoTool(inv, e.tool, input))

    // A Write to a path that is not there yet creates a file; one to a path that is there overwrites it.
    let isCreated = false

    if (e.tool === 'Write' && path) {
      try {
        isCreated = !(await $.fs.exists(path))
      } catch {
        isCreated = false
      }
    }

    const ran = await next(e)

    if (ran.deny === undefined && !('isError' in ran && ran.isError)) {
      await update($, inventory, inv => onToolRan(inv, e.tool, input, isCreated))
    }

    return ran
  })

  // A new chat starts the record over.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, inventory, () => EMPTY)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const inv: Inventory = await read($, inventory)
    const home = await homeOf($)
    const done = inv.todos.filter(t => t.status === 'completed').length

    const card = (title: string, glyph: string, right: string, body: unknown) => (
      <Box key={title} flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box justifyContent="space-between">
          <Text weight="bold">{`${glyph} ${title}`}</Text>
          <Text dimColor>{right}</Text>
        </Box>
        {body as never}
      </Box>
    )

    const more = (total: number, shown: number) => (total > shown ? <Text dimColor>{`+${total - shown} more`}</Text> : null)

    const fileRows = (rows: Inventory['filesRead']) =>
      [...rows]
        .reverse()
        .slice(0, MAX_FILES)
        .map(r => {
          const p = tidyPath(r.path, home)

          // The name gets its own line so it is never cut; the folder sits under it and is cut from the left.
          return (
            <Box key={r.path} flexDirection="column">
              <Box justifyContent="space-between">
                <Text wrap="truncate-end">{p.base}</Text>
                {r.count > 1 ? <Text dimColor>{`×${r.count}`}</Text> : null}
              </Box>
              {p.dir ? <Text dimColor wrap="truncate-start">{p.dir}</Text> : null}
            </Box>
          )
        })

    const isQuiet = isEmpty(inv)

    return (
      <Box flexDirection="column">
        {isQuiet && <Text dimColor>Nothing yet. It fills as Claude uses tools, skills and connectors in this chat.</Text>}

        {inv.todos.length > 0 &&
          card(
            'To-do',
            '☑',
            `${done} of ${inv.todos.length}`,
            <Box flexDirection="column">
              {inv.goal && <Text weight="bold" wrap="wrap">{inv.goal}</Text>}
              {inv.todos.slice(0, MAX_TODOS).map(t => (
                <Box key={t.id} gap={1}>
                  <Text color={t.status === 'completed' ? GREEN : t.status === 'in_progress' ? ORANGE : undefined} dimColor={t.status === 'pending'}>
                    {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '◉' : '○'}
                  </Text>
                  <Text strikethrough={t.status === 'completed'} dimColor={t.status === 'completed'} weight={t.status === 'in_progress' ? 'bold' : 'regular'} wrap="truncate-end">
                    {t.content}
                  </Text>
                </Box>
              ))}
              {more(inv.todos.length, MAX_TODOS)}
            </Box>,
          )}

        {inv.connectors.length > 0 &&
          card(
            'Connectors',
            '⌁',
            `${inv.connectors.length}`,
            <Box flexDirection="column">
              {inv.connectors.slice(0, MAX_CONNECTORS).map(c => (
                <Box key={c.name} justifyContent="space-between">
                  <Box gap={1}>
                    {iconOf(c.name) ? (
                      <Text>{` ${iconOf(c.name)}`}</Text>
                    ) : (
                      <Text backgroundColor={badgeColor(c.name)} color="white" weight="bold">{` ${c.name.charAt(0).toUpperCase()} `}</Text>
                    )}
                    <Box flexDirection="column">
                      <Text wrap="truncate-end">{c.name}</Text>
                      <Text dimColor mono wrap="truncate-end">{c.lastTool}</Text>
                    </Box>
                  </Box>
                  <Text color={ORANGE} weight="bold">{callsLabel(c.calls)}</Text>
                </Box>
              ))}
              {more(inv.connectors.length, MAX_CONNECTORS)}
            </Box>,
          )}

        {inv.filesRead.length + inv.filesCreated.length > 0 &&
          card(
            'Files',
            '▤',
            `${inv.filesRead.length + inv.filesCreated.length}`,
            <Box flexDirection="column">
              <Text dimColor>{`Read · ${inv.filesRead.length}`}</Text>
              {fileRows(inv.filesRead)}
              {more(inv.filesRead.length, MAX_FILES)}
              <Text dimColor>{`Created · ${inv.filesCreated.length}`}</Text>
              {fileRows(inv.filesCreated)}
              {more(inv.filesCreated.length, MAX_FILES)}
            </Box>,
          )}

        {inv.skills.length > 0 &&
          card(
            'Skills',
            '⚡',
            `${inv.skills.length}`,
            <Box flexDirection="column">
              {inv.skills.slice(0, MAX_SKILLS).map(s => (
                <Box key={s.name} justifyContent="space-between">
                  <Text wrap="truncate-end">{`/${s.name}`}</Text>
                  <Text dimColor>{`${s.uses} ${s.uses === 1 ? 'use' : 'uses'}`}</Text>
                </Box>
              ))}
              {more(inv.skills.length, MAX_SKILLS)}
            </Box>,
          )}
      </Box>
    )
  })
}
