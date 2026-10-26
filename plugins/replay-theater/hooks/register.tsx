import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'
import { diffText } from './diff'
import type { Change } from './diff'

const PANE = 'replay-theater'
const MAX_STEPS = 200
const RED = '#dc2626'
const GREEN = '#16a34a'
const ACCENT = '#be185d'

// Change the tag when a step's fields change: it declines what an earlier version stored, which outlives a reload.
const steps = atom({ plugin: 'replay-theater', key: 'steps' } as const, [] as Step[], { shape: 'steps-1' })
const at = atom({ plugin: 'replay-theater', key: 'at' } as const, 0)

// The first edit of a new turn starts a new list: the pane always holds the last turn that edited files.
let isNewTurn = false

const KIND: Record<Step['kind'], string> = { edit: 'Edit', create: 'New file', overwrite: 'Rewrite' }

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
    await $.ui.open({ id: PANE, title: 'Replay Theater', focus: true, closeOnEscape: true, rows: 18 })

    return { text: `Replaying ${total} edit${total === 1 ? '' : 's'} from the last turn. p = previous, n = next, c = close.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, steps)
    const index = Math.max(0, Math.min(list.length - 1, await read($, at)))
    const step = list[index]

    if (!step) {
      return <Text dimColor>No file edits to replay yet. Ask Claude to change a file, then type /replay.</Text>
    }

    // At most nine step buttons, windowed around the current step.
    const first = Math.max(0, Math.min(index - 4, list.length - 9))
    const chips = list.slice(first, first + 9).map((_, k) => first + k)
    const room = Math.max(4, (e.viewport?.rows ?? 24) - 10)
    const shown = step.lines.slice(0, room)
    const hidden = step.added + step.removed - shown.length

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
        <Text color="suggestion" weight="bold" wrap="truncate-start">{step.path}</Text>
        <Box gap={1}>
          <Text dimColor>{`${KIND[step.kind]}${step.isReplaceAll ? ' (every match)' : ''}`}</Text>
          <Text color={GREEN}>{`+${step.added}`}</Text>
          <Text color={RED}>{`-${step.removed}`}</Text>
        </Box>
        <Box flexDirection="column">
          {shown.map((line, k) => (
            <Text key={`line-${k}`} color={line.sign === '+' ? GREEN : RED}>{`${line.sign} ${line.text}`}</Text>
          ))}
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
