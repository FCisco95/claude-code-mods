import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { BAR, createMasker } from './mask'

const GREY = 'inactive'
const STATUS = '▒ screen-share ON'

const isActive = atom({ plugin: 'screen-share', key: 'isActive' } as const, false)
const names = atom({ plugin: 'screen-share', key: 'names' } as const, [] as string[])

const HELP = 'Usage: /screen-share (toggle) · on · off · status · add <name> · forget'

const turn = async ($: EngineInterface, on: boolean) => {
  await update($, isActive, () => on)
  $.ui.status(on ? STATUS : undefined)
  // Every row already on screen is drawn again with, or without, its bars.
  $.ui.invalidate('ui.render')
}

const masker = createMasker()

const prose = async ($: EngineInterface) => ({ isProse: true, names: await read($, names) })
const raw = async ($: EngineInterface) => ({ isProse: false, names: await read($, names) })

// A band stacks above whatever the mods beneath it drew, instead of replacing it: Reflect's card and Cache Clock's timer can show together.
const stack = (Box: any, below: unknown, mine: any) =>
  below ? (
    <Box flexDirection="column">
      {mine}
      {below}
    </Box>
  ) : (
    mine
  )

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'screen-share',
      description: 'Hide names, emails, phone numbers and money amounts on screen (the model still sees the real text)',
      argumentHint: 'on | off | status | add <name> | forget',
    })

    if (await read($, isActive)) {
      $.ui.status(STATUS)
    }

    return next(e)
  })

  on('command.run', { command: 'screen-share' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = verb.toLowerCase()
    const now = await read($, isActive)

    if (arg === 'status') {
      const added = (await read($, names)).length

      return { text: `Screen-share mode is ${now ? 'ON' : 'OFF'}${added ? ` · ${added} name(s) added by hand` : ''}. ${HELP}` }
    }

    if (arg === 'add') {
      const name = rest.join(' ').trim()

      if (!name) {
        return { text: 'Say which name to hide: /screen-share add Maria Silva' }
      }

      await update($, names, list => [...list.filter(n => n.toLowerCase() !== name.toLowerCase()), name])
      $.ui.invalidate('ui.render')

      return { text: `Added. "${BAR}" now covers that name wherever it appears while the mode is on.` }
    }

    if (arg === 'forget') {
      await update($, names, () => [])
      masker.reset()
      $.ui.invalidate('ui.render')

      return { text: 'Forgot the names added by hand and the ones picked up from emails.' }
    }

    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: HELP }
    }

    const target = arg === 'on' ? true : arg === 'off' ? false : !now
    await turn($, target)

    return {
      text: target
        ? `Screen-share mode ON. Names, emails, phone numbers and money amounts show as ${BAR} from now on. Claude still reads the real text; only the screen changes. Type /screen-share again to turn it off.`
        : 'Screen-share mode OFF. The real text is back on screen.',
    }
  })

  // The person's prompt, Claude's answer and command output are prose.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!(await read($, isActive))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, text: masker.mask(e.props.text, await prose($)) } })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!(await read($, isActive))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, text: masker.mask(e.props.text, await prose($)) } })
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (!(await read($, isActive))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, text: masker.mask(e.props.text, await prose($)) } })
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    if (!(await read($, isActive))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, text: masker.mask(e.props.text, await prose($)) } })
  })

  // Tool rows: the call and its result. Commands, file contents and logs are not prose.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, isActive))) {
      return next(e)
    }

    const options = await raw($)

    return next({
      ...e,
      props: {
        ...e.props,
        input: masker.maskDeep(e.props.input, options),
        output: masker.maskDeep(e.props.output, options),
      },
    })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await read($, isActive))) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, output: masker.maskDeep(e.props.output, await raw($)) } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const hiddenBy = (await $.state.get({ plugin: 'switchboard', key: 'hidden' } as const)).value ?? []

    if (hiddenBy.includes($.plugin.name)) {
      return below
    }

    if (e.props.hasSurvey || !(await read($, isActive))) {
      return below
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return stack(Box, below, (
      <Box paddingX={1} gap={1}>
        <Text color={GREY} weight="bold">{`${BAR} Screen-share ON`}</Text>
        <Text dimColor>names, emails, phones and amounts are hidden on screen · what you type below is not</Text>
        <Button key="off" label="Turn off" onPress={() => turn($, false)} />
      </Box>
    ))
  })
}
