import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'
import { diffText, toUnified } from './diff'
import type { Change } from './diff'

const PANE = 'replay-theater'
const MAX_STEPS = 200
// Theme keys, not hex: they follow the person's theme and every terminal draws them.
const RED = 'error'
const GREEN = 'success'
const ACCENT = 'claude'
const BADGE: Record<Step['kind'], string> = { edit: 'suggestion', create: 'success', overwrite: 'warning' }

// Change the tag when a step's fields change: it declines what an earlier version stored, which outlives a reload.
const steps = atom({ plugin: 'replay-theater', key: 'steps' } as const, [] as Step[], { shape: 'steps-3' })
const at = atom({ plugin: 'replay-theater', key: 'at' } as const, 0)

// The first edit of a new turn starts a new list: the pane always holds the last turn that edited files.
let isNewTurn = false

const KIND: Record<Step['kind'], string> = { edit: 'Edit', create: 'New file', overwrite: 'Rewrite' }

const split = (path: string): [string, string] => {
  const cut = path.lastIndexOf('/')

  return cut < 0 ? ['', path] : [path.slice(0, cut + 1), path.slice(cut + 1)]
}

const tidy = async ($: EngineInterface, path: string) => {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const slashed = path.replace(/\\/g, '/')
  const base = home.replace(/\\/g, '/').replace(/\/$/, '')

  return base && slashed.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? `~${slashed.slice(base.length)}` : slashed
}

const record = async ($: EngineInterface, id: string, kind: Step['kind'], path: string, change: Change, isReplaceAll = false) => {
  try {
    if (isNewTurn) {
      isNewTurn = false
      await update($, steps, () => [])
      await update($, at, () => 0)
    }

    const step: Step = { id, kind, path: await tidy($, path), lines: change.lines, added: change.added, removed: change.removed, isCut: change.isCut, isReplaceAll }
    await update($, steps, list => [...list, step].slice(-MAX_STEPS))
  } catch {
    // Watching an edit must never get in the way of the edit.
  }
}

const readBefore = async ($: EngineInterface, path: string): Promise<string | null> => {
  try {
    return (await $.fs.exists(path)) ? await $.fs.read(path) : null
  } catch {
    return null
  }
}

const move = async ($: EngineInterface, by: number) => {
  const total = (await read($, steps)).length

  await update($, at, n => Math.max(0, Math.min(total - 1, n + by)))
}

const jumpTo = async ($: EngineInterface, index: number) => {
  await update($, at, () => index)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'replay',
      description: 'Step through every file edit Claude made in the last turn, one change at a time',
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isNewTurn = true
    }

    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      await record($, e.tool_use_id, 'edit', e.file_path, diffText(e.old_string, e.new_string), e.replace_all === true)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const before = await readBefore($, e.file_path)
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError !== true) {
      await record($, e.tool_use_id, before === null ? 'create' : 'overwrite', e.file_path, diffText(before ?? '', e.content))
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'replay' }, async $ => {
    const total = (await read($, steps)).length

    if (total === 0) {
      return { text: 'No file edits to replay yet. Ask Claude to change a file, then type /replay.' }
    }

    await update($, at, () => 0)
    await $.ui.open({ id: PANE, title: 'Replay Theater', focus: true, closeOnEscape: true, rows: 18, columns: 80 })

    return { text: `Replaying ${total} edit${total === 1 ? '' : 's'} from the last turn. p = previous, n = next, c = close.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const list = await read($, steps)
    const index = Math.max(0, Math.min(list.length - 1, await read($, at)))
    const step = list[index]

    if (!step) {
      return <Text dimColor>No file edits to replay yet. Ask Claude to change a file, then type /replay.</Text>
    }

    // At most nine step buttons, windowed around the current step.
    const first = Math.max(0, Math.min(index - 4, list.length - 9))
    const chips = list.slice(first, first + 9).map((_, k) => first + k)
    const room = Math.max(6, (e.viewport?.rows ?? 24) - 11)
    const shown = step.lines.slice(0, room)
    const hidden = step.added + step.removed - shown.filter(l => l.sign !== ' ').length
    const [dir, name] = split(step.path)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={2}>
          <Text color={ACCENT} weight="bold">▶ Replay Theater</Text>
          <Text weight="bold">{`step ${index + 1} of ${list.length}`}</Text>
        </Box>
        <Box gap={1}>
          {chips.map(i => (
            <Button key={`step-${i}`} label={String(i + 1)} variant={i === index ? 'primary' : undefined} onPress={() => jumpTo($, i)} />
          ))}
        </Box>
        <Box gap={1}>
          <Text color="inverseText" backgroundColor={BADGE[step.kind]} weight="bold">{` ${KIND[step.kind].toUpperCase()} `}</Text>
          <Text color={GREEN} weight="bold">{`+${step.added}`}</Text>
          <Text color={RED} weight="bold">{`-${step.removed}`}</Text>
          {step.isReplaceAll && <Text dimColor>every match</Text>}
        </Box>
        <Box>
          {dir !== '' && <Text dimColor wrap="truncate-start">{dir}</Text>}
          <Text color="suggestion" weight="bold" wrap="truncate-start">{name}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {shown.length > 0 && <Code source={toUnified(shown)} format="diff" path={step.path} wrap="truncate-end" />}
          {hidden > 0 && <Text dimColor>{`... ${hidden} more changed line${hidden === 1 ? '' : 's'} not shown`}</Text>}
          {step.lines.length === 0 && <Text dimColor>No line changed (whitespace or identical text).</Text>}
        </Box>
        <Box gap={1}>
          <Button key="prev" label="◀ Prev" hotkey="p" onPress={() => move($, -1)} />
          <Button key="next" label="Next ▶" hotkey="n" onPress={() => move($, 1)} />
          <Button key="close" label="Close" hotkey="c" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
