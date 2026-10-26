import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Card, Todo } from '../types'

const PANE = 'helper-desk'
const PURPLE = '#7c3aed'
const GREEN = '#16a34a'
const AMBER = '#ca8a04'
const ORANGE = '#c2410c'
const COLORS = ['#2563eb', '#db2777', '#ea580c', '#16a34a', '#dc2626', '#0891b2', '#ca8a04', '#9333ea']
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
// Rows one card takes: two border rows, a header, a model line, a step line and a bar.
const CARD_ROWS = 6
// How often the clocks and spinners redraw while something runs.
const TICK_MS = 500

// Change a tag when the fields of its value change: it declines what an earlier version stored.
const todos = atom({ plugin: 'helper-desk', key: 'todos' } as const, [], { shape: 'todos-2' })
const cards = atom({ plugin: 'helper-desk', key: 'cards' } as const, [], { shape: 'cards-2' })
const currentTask = atom({ plugin: 'helper-desk', key: 'currentTask' } as const, '')
const isBandHidden = atom({ plugin: 'helper-desk', key: 'isBandHidden' } as const, false)

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const shorten = (text: string, max: number) => {
  const one = text.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

const shortModel = (model: string) => model.replace(/^claude-/, '')

const spinnerAt = (now: number) => SPINNER[Math.floor(now / TICK_MS) % SPINNER.length]

// A bar of `width` cells: full when finished, a block sweeping across while it runs (no total is known).
const barOf = (width: number, now: number, isRunning: boolean) => {
  if (!isRunning) {
    return '█'.repeat(width)
  }

  const block = Math.min(4, Math.max(2, Math.floor(width / 6)))
  const span = Math.max(1, width - block)
  const at = Math.floor(now / TICK_MS) % (span * 2)
  const pos = at < span ? at : span * 2 - at

  return '░'.repeat(pos) + '█'.repeat(block) + '░'.repeat(width - block - pos)
}

// What a tool call is aimed at, for the card's one-line note.
const aim = (input: Record<string, unknown>) => {
  const raw = input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.query ?? input.url ?? input.description

  return typeof raw === 'string' ? shorten(raw, 60) : ''
}

const toTodos = (raw: unknown): Todo[] =>
  Array.isArray(raw)
    ? raw
        .filter(t => typeof t?.content === 'string')
        .map(t => ({
          id: t.content as string,
          content: t.content as string,
          active: typeof t.activeForm === 'string' ? t.activeForm : (t.content as string),
          status: t.status === 'completed' || t.status === 'in_progress' ? t.status : 'pending',
        }))
    : []

// Sets the task list, stamps when a task starts running, and, when a different task
// starts, drops the finished agents of the earlier ones (running agents and the new
// task's own stay).
const applyTodos = async ($: EngineInterface, incoming: Todo[]) => {
  const now = await $.clock.now()
  const before = await read($, todos)
  const wasRunning = new Set(before.filter(t => t.status === 'in_progress').map(t => t.id))
  const next = incoming.map((t): Todo => {
    const old = before.find(o => o.id === t.id)

    return t.status === 'in_progress'
      ? { ...t, startedAt: wasRunning.has(t.id) ? (old?.startedAt ?? now) : now }
      : { ...t, startedAt: old?.startedAt }
  })
  await update($, todos, () => next)

  const running = next.filter(t => t.status === 'in_progress')
  const started = running.filter(t => !wasRunning.has(t.id))
  const was = await read($, currentTask)
  const stillRunning = running.some(t => t.id === was)
  const now_ = started.at(-1)?.id ?? (stillRunning ? was : (running.at(-1)?.id ?? ''))

  if (now_ !== was) {
    await update($, currentTask, () => now_)
  }

  if (now_ !== '' && now_ !== was) {
    await update($, cards, list => list.filter(c => c.status === 'running' || c.taskKey === now_))
  }

  const wasFinished = before.length === 0 || before.every(t => t.status === 'completed')

  if (wasFinished) {
    await update($, isBandHidden, () => false)
  }
}

export const register: Register = on => {
  let createdTasks = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'helper-desk',
      description: 'Open the subagent panel (live cards, click one to open its session)',
    })
    // Redraw twice a second while a task or an agent runs, so spinners and clocks move.
    $.clock.every(TICK_MS, () => {
      void (async () => {
        const isTaskRunning = (await read($, todos)).some(t => t.status === 'in_progress')
        const isAgentRunning = (await read($, cards)).some(c => c.status === 'running')

        if (isTaskRunning || isAgentRunning) {
          $.ui.invalidate('ui.render')
        }
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'helper-desk' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Helper Desk', focus: true })

    return { text: 'Helper Desk opened.' }
  })

  // A new prompt with no task running is a new job: finished agents of the last one go.
  on('prompt.submit', async ($, e, next) => {
    const isUsersOwn = e.origin.kind === 'composer' && !e.command && !e.isMeta

    if (isUsersOwn && (await read($, currentTask)) === '') {
      await update($, cards, list => list.filter(c => c.status === 'running'))
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)

    if (started.deny === undefined && started.agentId !== undefined) {
      const id = started.agentId
      const now = await $.clock.now()
      const taskKey = await read($, currentTask)
      const card: Card = {
        id,
        name: shorten(e.description || e.subagentType, 28),
        type: e.subagentType,
        model: started.model,
        status: 'running',
        taskKey,
        startedAt: now,
        tokens: 0,
        steps: 0,
        note: 'starting',
      }
      await update($, cards, list => [...list, card].slice(-40))
    }

    return started
  })

  // Tokens count per step, so a running card is live; turn.complete settles the total.
  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    const id = e.agentId

    if (id !== undefined && response.usage) {
      const u = response.usage
      const spent = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens
      await update($, cards, list => list.map(c => (c.id === id ? { ...c, tokens: c.tokens + spent } : c)))
    }

    return response
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>

    // The task list is applied before the call runs, so agents spawned in the same
    // message already belong to the task that was just started.
    if (e.agentId === undefined) {
      if (e.tool.endsWith('work_state_write')) {
        // claude-mem's work_state_write is this setup's to-do list: one entry per call.
        const fields = input.fields as Record<string, unknown> | undefined
        const task = fields?.task
        const listName = typeof input.list === 'string' ? input.list : 'tasks'

        if (typeof task === 'string') {
          const id = `${listName}:${task}`
          const status: Todo['status'] =
            fields?.status === 'done' ? 'completed' : fields?.status === 'doing' ? 'in_progress' : 'pending'
          const item: Todo = { id, content: task, active: task, status }
          const list = await read($, todos)
          const has = list.some(t => t.id === id)
          const nextList =
            fields?.status === 'dropped'
              ? list.filter(t => t.id !== id)
              : has
                ? list.map(t => (t.id === id ? { ...t, status } : t))
                : [...list, item]
          await applyTodos($, nextList)
        }
      } else if (e.tool === 'TodoWrite') {
        await applyTodos($, toTodos(input.todos))
      } else if (e.tool === 'TaskCreate' && typeof input.subject === 'string') {
        createdTasks += 1
        const item: Todo = {
          id: String(createdTasks),
          content: input.subject,
          active: typeof input.activeForm === 'string' ? input.activeForm : input.subject,
          status: 'pending',
        }
        await applyTodos($, [...(await read($, todos)), item])
      } else if (e.tool === 'TaskUpdate' && typeof input.taskId === 'string') {
        const taskId = input.taskId
        const status = input.status
        const list = await read($, todos)
        await applyTodos(
          $,
          status === 'deleted'
            ? list.filter(t => t.id !== taskId)
            : list.map(t =>
                t.id === taskId
                  ? {
                      ...t,
                      content: typeof input.subject === 'string' ? input.subject : t.content,
                      active: typeof input.activeForm === 'string' ? input.activeForm : t.active,
                      status:
                        status === 'completed' || status === 'in_progress' || status === 'pending'
                          ? status
                          : t.status,
                    }
                  : t,
              ),
        )
      }
    }

    const ran = await next(e)

    if (e.agentId !== undefined && ran.deny === undefined) {
      // The hand-back is the agent's last act, not a step worth showing.
      if ((e.tool as string) === 'SubagentHandback') {
        return ran
      }

      const id = e.agentId
      const note = `${e.tool} ${aim(input)}`.trim()
      await update($, cards, list =>
        list.map(c => (c.id === id ? { ...c, steps: c.steps + 1, note } : c)),
      )
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId

    if (id !== undefined) {
      const now = await $.clock.now()
      const spent = e.usage
        ? e.usage.input_tokens + e.usage.output_tokens + e.usage.cache_creation_input_tokens
        : 0
      const status = e.reason === 'answer' ? 'done' : 'failed'
      // turn.step already counted the steps; keep whichever total is larger.
      await update($, cards, list =>
        list.map(c =>
          c.id === id ? { ...c, status, endedAt: now, tokens: Math.max(c.tokens, spent) } : c,
        ),
      )
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, todos)
    const agents = await read($, cards)
    const hasTasks = list.length > 0 && !(await read($, isBandHidden))
    const live = agents.filter(c => c.status === 'running')

    if ((!hasTasks && live.length === 0) || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const finishedCount = agents.length - live.length
    const spent = agents.reduce((sum, c) => sum + c.tokens, 0)
    const since = live.reduce((min, c) => Math.min(min, c.startedAt), now)
    // A one-line agent summary, so the subagents show even where the pane has no room.
    const agentLine =
      agents.length > 0 ? (
        <Text color={ORANGE} wrap="truncate-end">
          {`🦀 ${live.length} running · ${finishedCount} done · ${formatTokens(spent)} tokens${live.length > 0 ? ` · ${formatTime(now - since)}` : ''}`}
        </Text>
      ) : null

    if (!hasTasks) {
      return <Box paddingX={1}>{agentLine}</Box>
    }

    const done = list.filter(t => t.status === 'completed').length
    const running = list.find(t => t.id === (list.find(x => x.status === 'in_progress')?.id))
    const nextUp = list.find(t => t.status === 'pending')
    const percent = Math.round((done / list.length) * 100)
    const width = Math.max(10, Math.min(40, e.props.bodyColumns - 36))
    const filled = Math.round((width * done) / list.length)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={1}>
          <Text color={PURPLE}>{running ? spinnerAt(now) : '●'}</Text>
          <Text weight="bold">Tasks</Text>
          <Text backgroundColor={PURPLE} color="white" weight="bold">
            {` ${done}/${list.length} `}
          </Text>
          <Text color={PURPLE}>{'█'.repeat(filled)}</Text>
          <Text dimColor>{'░'.repeat(width - filled)}</Text>
          <Text>{`${percent}%`}</Text>
          <Button key="hide" label="×" onPress={() => update($, isBandHidden, () => true)} />
        </Box>
        <Text color={running ? PURPLE : undefined} dimColor={!running} wrap="truncate-end">
          {running
            ? `Running: ${running.active}${running.startedAt !== undefined ? ` · ${formatTime(now - running.startedAt)}` : ''}`
            : nextUp
              ? `Next: ${nextUp.active}`
              : 'All tasks done'}
        </Text>
        {agentLine}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, cards)
    const tasks = await read($, todos)
    const now = await $.clock.now()
    const usage = await $.session.usage()
    const running = list.filter(c => c.status === 'running')
    const finished = list.filter(c => c.status !== 'running').reverse()
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 30) - 11) / CARD_ROWS))
    const shownRunning = running.slice(0, room)
    const shownFinished = finished.slice(0, Math.max(0, room - shownRunning.length))
    const hidden = list.length - shownRunning.length - shownFinished.length
    const totalTokens = list.reduce((sum, c) => sum + c.tokens, 0)
    const first = list.reduce((min, c) => Math.min(min, c.startedAt), now)
    const colorOf = (c: Card) => COLORS[list.indexOf(c) % COLORS.length]
    const barWidth = Math.max(10, (e.viewport?.columns ?? 40) - 6)
    const doneTasks = tasks.filter(t => t.status === 'completed').length
    const activeTask = tasks.find(t => t.status === 'in_progress')

    const renderCard = (c: Card) => {
      const color = colorOf(c)
      const end = c.endedAt ?? now
      const isRunning = c.status === 'running'
      const glyph = isRunning ? spinnerAt(now) : c.status === 'done' ? '✓' : '✗'

      return (
        <Box key={c.id} flexDirection="column" borderStyle="round" borderColor={isRunning ? color : undefined} borderDimColor={!isRunning} paddingX={1}>
          <Box justifyContent="space-between">
            <Button key={`open:${c.id}`} onPress={() => $.ui.view({ agentId: c.id })}>
              <Text color={color} weight="bold">{`${glyph} 🦀 ${c.name}`}</Text>
            </Button>
            <Text dimColor>{`${formatTokens(c.tokens)} · ${formatTime(end - c.startedAt)}`}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">{`${c.type} · ${shortModel(c.model)} · click to open`}</Text>
          <Text color={isRunning ? undefined : c.status === 'done' ? GREEN : 'red'} wrap="truncate-end">
            {isRunning
              ? `Running · step ${c.steps} · ${c.note}`
              : `${c.status === 'done' ? 'Done' : 'Stopped'} · ${c.steps} steps · ${c.note}`}
          </Text>
          <Text color={isRunning ? color : c.status === 'done' ? GREEN : 'red'}>{barOf(barWidth, now, isRunning)}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={ORANGE} weight="bold">{`${list.length} subagent${list.length === 1 ? '' : 's'} in this task`}</Text>
          <Button key="main" label="Main chat" onPress={() => $.ui.view({})} />
        </Box>
        <Box gap={2}>
          <Text color={running.length > 0 ? GREEN : undefined} dimColor={running.length === 0} weight="bold">{`● ${running.length} running`}</Text>
          <Text color={GREEN} dimColor={finished.length === 0}>{`✓ ${finished.length} done`}</Text>
          {tasks.length > 0 && (
            <Text color={PURPLE} weight="bold">{`Tasks ${doneTasks}/${tasks.length}`}</Text>
          )}
        </Box>
        {activeTask && (
          <Text color={PURPLE} wrap="truncate-end">
            {`${spinnerAt(now)} ${activeTask.active}${activeTask.startedAt !== undefined ? ` · ${formatTime(now - activeTask.startedAt)}` : ''}`}
          </Text>
        )}
        <Box gap={2}>
          <Text dimColor>{`Chat ${usage.cost ? `$${usage.cost.usd.toFixed(2)}` : 'n/a'}`}</Text>
          <Text dimColor>{`${formatTokens(totalTokens)} tokens`}</Text>
          <Text dimColor>{`Time ${formatTime(now - first)}`}</Text>
        </Box>
        {list.length === 0 && <Text dimColor>No subagents yet.</Text>}
        {shownRunning.length > 0 && (
          <Text backgroundColor={GREEN} color="white" weight="bold">{` Running · ${running.length} `}</Text>
        )}
        {shownRunning.map(renderCard)}
        {shownFinished.length > 0 && (
          <Text backgroundColor={AMBER} color="white" weight="bold">{` Finished · ${finished.length} `}</Text>
        )}
        {shownFinished.map(renderCard)}
        {hidden > 0 && <Text dimColor>{`+${hidden} more`}</Text>}
      </Box>
    )
  })
}
