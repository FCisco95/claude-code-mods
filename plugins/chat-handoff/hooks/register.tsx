import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Reason } from '../types'
import { extractFacts, renderFacts } from './facts'

// Hand off once the chat holds this many tokens. Measured as Cache Clock measures it: the prompt tokens
// the next request re-sends (input + cache read + cache write + output of the last main-thread reply).
const TOKEN_LIMIT = 250_000
// A cold cache on a small chat costs next to nothing, so it only counts above this.
const MIN_COLD_TOKENS = 50_000
// How often the triggers are checked.
const TICK_MS = 3000
// Rendered-transcript fallback (used only where the chat cannot be forked): at most this many characters.
const FALLBACK_CHARS = 500_000

const GREEN = 'success'
const AMBER = 'warning'
const RED = 'error'

const status = atom({ plugin: 'chat-handoff', key: 'status' } as const, 'idle' as 'idle' | 'offer' | 'working' | 'ready' | 'failed')
const reason = atom({ plugin: 'chat-handoff', key: 'reason' } as const, '')
const draft = atom({ plugin: 'chat-handoff', key: 'draft' } as const, '')
const savedPath = atom({ plugin: 'chat-handoff', key: 'savedPath' } as const, '')
const words = atom({ plugin: 'chat-handoff', key: 'words' } as const, 0)
const atTurns = atom({ plugin: 'chat-handoff', key: 'atTurns' } as const, 0)
const error = atom({ plugin: 'chat-handoff', key: 'error' } as const, '')
const isHidden = atom({ plugin: 'chat-handoff', key: 'isHidden' } as const, false)
const isLaunching = atom({ plugin: 'chat-handoff', key: 'isLaunching' } as const, false)

const WHY: Record<string, string> = {
  tokens: 'the chat passed 250k tokens',
  cold: 'the cache went cold',
  command: 'you asked for it',
}

const FORK_PROMPT = `Write a handoff for a fresh Claude Code chat that will continue this work. The reader has NOT seen this conversation: it may be a new Claude session, or a teammate picking the task up. This is not a compaction summary. Keep the detail.

Use exactly these markdown headings, in this order:

## Goal
What the user is trying to achieve and why, in their terms, plus what "done" means.

## Context
Everything the reader must know to work here: the project, the setup, the constraints, who and what is involved, relevant background found in the chat.

## Decisions and rules
Each decision made and the reason, and every preference, rule or correction the user gave (quote exact wording where the wording matters). Mark which are locked.

## Progress
Three lists: Done (with the evidence: command output, test result, file, id), In progress (exactly how far), Not started. Name files, paths, commands, ids, numbers and outcomes exactly.

## What was tried and failed
Dead ends and errors, with the cause where known, so the reader does not repeat them.

## Current state
Where the work stands right now: the last action and its result, anything half-done, what is uncommitted or unverified.

## Next steps
A numbered, ordered list. Step 1 must be concrete enough to start immediately. Note dependencies between steps.

## Open questions and blockers
What is unclear, and what needs the user's decision or action.

Rules:
- Be specific and complete. Never compress a detail into a vague phrase. Keep exact names, paths, numbers, error text and quoted wording.
- Do not invent anything. If something is uncertain, say it is uncertain.
- Mention files, skills, tools and links inline where they matter to the story. Do NOT write full lists of them: appendices listing every file, skill, tool, link and shell command are added automatically after your text.
- Do not call tools. No preamble, no closing remarks, no code fence around the whole answer.
- Write in the language the user used in this chat.`

let isTurnRunning = false
let isWorking = false
let isTokenOffered = false
// The Cache Clock request time a cold offer was made for, so one cold spell offers once.
let coldOfferedFor = 0

const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

const stamp = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')

  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

const formatTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

// Cache Clock keeps these in $.state; any plugin reads any value. 0 where Cache Clock is not loaded.
const readCache = async ($: EngineInterface) => {
  const last = (await $.state.get({ plugin: 'cache-clock', key: 'lastRequestAt' } as const)).value ?? 0
  const ttl = (await $.state.get({ plugin: 'cache-clock', key: 'ttlMs' } as const)).value ?? 0
  let tokens = (await $.state.get({ plugin: 'cache-clock', key: 'contextTokens' } as const)).value ?? 0

  if (tokens === 0) {
    try {
      tokens = (await $.session.usage()).context.tokens ?? 0
    } catch {
      tokens = 0
    }
  }

  return { last, ttl, tokens }
}

const git = async ($: EngineInterface, argv: string[]) => {
  try {
    const run = await $.process.run(['git', ...argv], { timeoutMs: 8000 })

    return run.exitCode === 0 ? run.stdout.trim() : ''
  } catch {
    return ''
  }
}

const renderTranscript = async ($: EngineInterface) => {
  const messages = await $.session.messages()
  const lines = messages.map(m => {
    const uses = m.toolUses.map(u => `[tool ${u.tool} ${JSON.stringify(u.input).slice(0, 300)}${u.text ? ` -> ${u.text.slice(0, 400)}` : ''}]`)

    return `${m.role.toUpperCase()}: ${m.text}${uses.length ? `\n${uses.join('\n')}` : ''}`
  })
  const all = lines.join('\n\n')

  if (all.length <= FALLBACK_CHARS) {
    return all
  }

  const head = Math.floor(FALLBACK_CHARS * 0.2)

  return `${all.slice(0, head)}\n\n[... middle of the chat left out to fit ...]\n\n${all.slice(all.length - (FALLBACK_CHARS - head))}`
}

const stripFence = (text: string) => text.trim().replace(/^```(?:markdown|md)?\n/, '').replace(/\n```$/, '').trim()

const generate = async ($: EngineInterface, why: Reason) => {
  if (isWorking) {
    return
  }

  isWorking = true
  await update($, status, () => 'working')
  await update($, reason, () => why)
  await update($, error, () => '')
  await update($, isHidden, () => false)

  try {
    const messages = await $.session.messages()

    if (messages.length === 0) {
      // An empty chat is not a failure: nothing to hand off, so no red band.
      await update($, status, () => 'idle')

      if (why === 'command') {
        $.ui.toast('Nothing to hand off yet: this chat is empty.')
      }

      return
    }

    const facts = extractFacts(messages)
    const cache = await readCache($)
    let body = ''
    const forked = await $.model.fork({ prompt: FORK_PROMPT })

    if (forked.isAnswered) {
      body = stripFence(forked.text)
    } else if (forked.reason === 'nothing-to-fork') {
      // A resumed or fresh chat has no snapshot to fork: hand the rendered transcript to a separate call.
      const asked = await $.model.complete({
        model: 'sonnet',
        system: FORK_PROMPT,
        prompt: `Here is the whole conversation to hand off:\n\n${await renderTranscript($)}`,
        effort: 'medium',
        timeoutMs: 300_000,
      })

      if (!asked.isAnswered) {
        throw new Error(`the handoff could not be written (${asked.reason})`)
      }

      body = stripFence(asked.text)
    } else {
      throw new Error(`the handoff could not be written (${forked.reason})`)
    }

    const now = await $.clock.now()
    const root = await $.session.root()
    const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const dirty = await git($, ['status', '--short'])
    const log = await git($, ['log', '--oneline', '-8'])
    const model = await $.session.model()
    const sessionId = await $.session.id()
    const header = [
      '# Handoff: continue this task in a fresh chat',
      '',
      `Written ${new Date(now).toISOString()} by Claude Code from a chat of about ${formatTokens(cache.tokens)} tokens (${facts.userTurns} user turns). Why now: ${WHY[why]}.`,
      `Project folder: \`${root}\` · Model: ${model} · Original session: \`${sessionId}\``,
      '',
      '## How to use this prompt',
      'You are picking up work another Claude Code session (and its user) stopped partway. You have none of that chat, so everything you need is below.',
      '1. Read it all. Then check the real state before acting: the working tree and files in "Working tree" and the appendices. If this text disagrees with what is on disk, trust the disk and say so.',
      '2. Do not redo what is under "Done". Honor every rule under "Decisions and rules".',
      '3. Start at "Next steps", step 1. Ask the user only about what "Open questions and blockers" lists.',
      '4. Paths are as they were on the original machine; a teammate may need to adapt them.',
      '',
    ].join('\n')
    const tree = [
      '## Working tree',
      `- branch: ${branch || 'unknown (not a git folder)'}`,
      `- uncommitted changes:\n${dirty ? dirty.split('\n').slice(0, 40).map(l => `  ${l}`).join('\n') : '  none'}`,
      `- recent commits:\n${log ? log.split('\n').map(l => `  ${l}`).join('\n') : '  none'}`,
    ].join('\n')
    const text = `${header}\n${body}\n\n${tree}\n\n${renderFacts(facts)}\n`

    let path = ''

    try {
      const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

      if (home) {
        path = `${home.replace(/[\\/]$/, '')}/.claude/handoffs/${stamp(now)}-${sessionId.slice(0, 8)}.md`
        await $.fs.write(path, text)
      }
    } catch {
      path = ''
    }

    await update($, draft, () => text)
    await update($, words, () => wordsOf(text))
    await update($, savedPath, () => path)
    await update($, atTurns, () => facts.userTurns)
    await update($, status, () => 'ready')
    $.ui.toast('Handoff ready. Press "Start fresh chat" when you want to move over.')
  } catch (e) {
    await update($, error, () => (e instanceof Error ? e.message : String(e)))
    await update($, status, () => 'failed')
  } finally {
    isWorking = false
    $.ui.invalidate('ui.render')
  }
}

// Ends this chat with /clear (the old one stays in /resume) and sends the handoff as the first message of the new one.
// Only ever called from the user's click or typed command.
const startFresh = async ($: EngineInterface, surface?: string): Promise<string> => {
  const text = await read($, draft)

  if (!text) {
    return 'No handoff written yet. Type /handover first.'
  }

  if (await read($, isLaunching)) {
    return 'Already moving to a fresh chat.'
  }

  await update($, isLaunching, () => true)

  try {
    await $.command.run({ command: 'clear' })
  } catch (e) {
    await update($, isLaunching, () => false)
    await $.ui.copy({ text, surface: surface as never })

    return `Could not open a fresh chat from here (${String(e)}). The handoff prompt is on your clipboard: run /clear, then paste it.`
  }

  try {
    await $.prompt.submit({ text, asUser: true })

    return 'Fresh chat started with the handoff prompt.'
  } catch (e) {
    const box = await $.prompt.fill({ text })

    return box.isFilled
      ? `Fresh chat opened. The handoff prompt is in the prompt box: press Enter to send it (${String(e)}).`
      : `Fresh chat opened, but the prompt could not be sent (${String(e)}). It is saved in ${(await read($, savedPath)) || 'the handoff band'}.`
  }
}

const check = async ($: EngineInterface) => {
  if (isWorking || isTurnRunning || (await read($, status)) === 'working') {
    return
  }

  const current = await read($, status)

  if (current === 'ready' || current === 'failed') {
    return
  }

  // Cache Clock's numbers can outlive the chat they came from: never fire in a chat with no turns yet.
  if ((await $.session.turns()) === 0) {
    return
  }

  const cache = await readCache($)

  if (!isTokenOffered && cache.tokens >= TOKEN_LIMIT) {
    isTokenOffered = true
    await generate($, 'tokens')

    return
  }

  const now = await $.clock.now()
  const isCold = cache.last > 0 && cache.ttl > 0 && now >= cache.last + cache.ttl

  if (isCold && cache.tokens >= MIN_COLD_TOKENS && coldOfferedFor !== cache.last) {
    // Writing the handoff re-caches the whole chat, so a cold cache only offers it: nothing is spent until the click.
    coldOfferedFor = cache.last
    await update($, reason, () => 'cold')
    await update($, isHidden, () => false)
    await update($, status, () => 'offer')
  }
}

const runCommand = async ($: EngineInterface, args: string): Promise<{ text: string }> => {
  const arg = args.trim().toLowerCase()

  if (arg === 'start') {
    return { text: await startFresh($) }
  }

  if (arg === 'copy' || arg === 'show') {
    const text = await read($, draft)

    if (!text) {
      return { text: 'No handoff written yet. Type /handover first.' }
    }

    if (arg === 'show') {
      return { text }
    }

    const copied = await $.ui.copy({ text })

    return { text: copied.isCopied ? 'Handoff prompt copied.' : `Could not copy (${copied.reason}). Use /handover show.` }
  }

  if (isWorking) {
    return { text: 'The handoff is already being written.' }
  }

  if ((await $.session.turns()) === 0) {
    return { text: 'Nothing to hand off yet: this chat is empty.' }
  }

  void generate($, 'command')

  return { text: 'Writing the handoff prompt. A button to start the fresh chat appears above the prompt when it is ready.' }
}

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
    const description = 'Write a detailed handoff prompt, then start a fresh chat from it. Args: start, copy, show'

    // The installed handoff:handoff skill may own /handoff: then the same command answers as /handover.
    try {
      await $.command.register({ name: 'handoff', description })
    } catch (error) {
      $.ui.log(`chat-handoff: /handoff is taken (${String(error)}); use /handover`, { to: 'debug' })
    }

    await $.command.register({ name: 'handover', description })

    // A leftover working/failed band from another chat must not greet a new one.
    const left = await read($, status)

    if (left === 'working' || left === 'failed') {
      await update($, status, () => 'idle')
    }

    $.clock.every(TICK_MS, () => {
      void check($)
    })

    return next(e)
  })

  on('command.run', { command: 'handoff' }, ($, e) => runCommand($, e.args))
  on('command.run', { command: 'handover' }, ($, e) => runCommand($, e.args))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isTurnRunning = true

      // The cache is warm again: the cold offer no longer applies.
      if ((await read($, status)) === 'offer') {
        await update($, status, () => 'idle')
      }
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isTurnRunning = false
    }

    return next(e)
  })

  // A new chat starts the triggers over.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      isTokenOffered = false
      coldOfferedFor = 0
      isTurnRunning = false
      await update($, status, () => 'idle')
      await update($, draft, () => '')
      await update($, savedPath, () => '')
      await update($, isLaunching, () => false)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const hiddenBy = (await $.state.get({ plugin: 'switchboard', key: 'hidden' } as const)).value ?? []

    if (hiddenBy.includes($.plugin.name)) {
      return below
    }

    const current = await read($, status)

    if (current === 'idle' || e.props.hasSurvey || (await read($, isHidden))) {
      return below
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const why = WHY[await read($, reason)] ?? ''
    const hide = <Button key="hide" label="×" onPress={() => update($, isHidden, () => true)} />

    if (current === 'offer') {
      return stack(Box, below, (
        <Box paddingX={1} gap={1}>
          <Text color={AMBER} weight="bold">⇄ Handoff</Text>
          <Text dimColor>{`${why}: writing a handoff now costs one full re-cache.`}</Text>
          <Button key="write" label="Write handoff" variant="primary" onPress={() => void generate($, 'cold')} />
          {hide}
        </Box>
      ))
    }

    if (current === 'working') {
      return stack(Box, below, (
        <Box paddingX={1} gap={1}>
          <Text color={AMBER} weight="bold">⇄ Handoff</Text>
          <Text dimColor>{`${why}: writing the handoff prompt from the whole chat...`}</Text>
        </Box>
      ))
    }

    if (current === 'failed') {
      return stack(Box, below, (
        <Box paddingX={1} gap={1}>
          <Text color={RED} weight="bold">⇄ Handoff failed</Text>
          <Text dimColor wrap="truncate-end">{await read($, error)}</Text>
          <Button key="retry" label="Retry" onPress={() => void generate($, 'command')} />
          {hide}
        </Box>
      ))
    }

    const path = await read($, savedPath)
    const isStale = (await $.session.turns()) > (await read($, atTurns))
    const launching = await read($, isLaunching)

    return stack(Box, below, (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={1}>
          <Text color={GREEN} weight="bold">⇄ Handoff ready</Text>
          <Text dimColor>{`${why} · ${await read($, words)} words`}</Text>
          <Button
            key="start"
            label={launching ? 'Starting...' : 'Start fresh chat'}
            variant="primary"
            onPress={async () => {
              $.ui.toast(await startFresh($, e.surface))
            }}
          />
          <Button
            key="copy"
            label="Copy"
            onPress={async press => {
              const copied = await $.ui.copy({ text: await read($, draft), surface: press.surface })
              $.ui.toast(copied.isCopied ? 'Handoff prompt copied.' : `Could not copy (${copied.reason}). Use /handover show.`)
            }}
          />
          {hide}
        </Box>
        <Text dimColor wrap="truncate-end">
          {`${isStale ? 'The chat moved on since: /handover writes a fresh one. ' : ''}${path ? `Saved to ${path} (send this file to a teammate)` : '/handover show prints it as plain text'}`}
        </Text>
      </Box>
    ))
  })
}
