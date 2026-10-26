import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const GREEN = 'success'
const AMBER = 'warning'
const RED = 'error'
// Keep warm never runs longer than this.
const MAX_KEEP_MS = 2 * 60 * 60 * 1000
const TICK_MS = 1000
const PING = 'Cache keep-alive. Reply with the single word: ok'

const ttlMs = atom({ plugin: 'cache-clock', key: 'ttlMs' } as const, 0)
const ttlLabel = atom({ plugin: 'cache-clock', key: 'ttlLabel' } as const, '')
const lastRequestAt = atom({ plugin: 'cache-clock', key: 'lastRequestAt' } as const, 0)
const isTurnRunning = atom({ plugin: 'cache-clock', key: 'isTurnRunning' } as const, false)
const contextTokens = atom({ plugin: 'cache-clock', key: 'contextTokens' } as const, 0)
const keepWarmSince = atom({ plugin: 'cache-clock', key: 'keepWarmSince' } as const, 0)
const pingCount = atom({ plugin: 'cache-clock', key: 'pingCount' } as const, 0)
const lastPing = atom({ plugin: 'cache-clock', key: 'lastPing' } as const, '')
const isHidden = atom({ plugin: 'cache-clock', key: 'isHidden' } as const, false)

const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

// The engine hands a mod only four token counts, so the lifetime is read where Anthropic's reply is kept
// whole: the session transcript. Its usage carries `cache_creation.ephemeral_<n>m|h_input_tokens`; the
// lifetime is read off that field's own name (the shortest if a reply holds several). This runs Node,
// reads the transcript's last 2 MB and prints {ms, label}; exit 2 = no transcript, 3 = no cache data yet.
const TTL_SCRIPT = [
  "const fs=require('fs'),path=require('path'),os=require('os');",
  "const id=process.argv[1];",
  "const root=process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude');",
  "const proj=path.join(root,'projects');",
  "let file;",
  "for(const d of fs.readdirSync(proj)){const f=path.join(proj,d,id+'.jsonl');if(fs.existsSync(f)){file=f;break}}",
  "if(!file)process.exit(2);",
  "const size=fs.statSync(file).size,len=Math.min(size,1<<21),buf=Buffer.alloc(len),fd=fs.openSync(file,'r');",
  "fs.readSync(fd,buf,0,len,size-len);fs.closeSync(fd);",
  "for(const l of buf.toString('utf8').split('\\n').reverse()){",
  "if(!l.includes('\"cache_creation\":{'))continue;",
  "try{const j=JSON.parse(l);const c=j.message&&j.message.usage&&j.message.usage.cache_creation;if(!c)continue;",
  "let best;for(const [k,v] of Object.entries(c)){const m=/^ephemeral_(\\d+)(m|h)_input_tokens$/.exec(k);if(!m||!(Number(v)>0))continue;",
  "const ms=Number(m[1])*(m[2]==='h'?3600000:60000);if(!best||ms<best.ms)best={ms,label:m[1]+m[2]}}",
  "if(best){console.log(JSON.stringify(best));process.exit(0)}}catch(e){}}",
  "process.exit(3)",
].join('')

const readTtl = async ($: EngineInterface): Promise<{ ms: number; label: string } | undefined> => {
  try {
    const run = await $.process.run(['node', '-e', TTL_SCRIPT, await $.session.id()], { timeoutMs: 10_000 })

    if (run.exitCode !== 0) {
      return undefined
    }

    const parsed = JSON.parse(run.stdout.trim()) as { ms?: unknown; label?: unknown }

    return typeof parsed.ms === 'number' && parsed.ms > 0 && typeof parsed.label === 'string'
      ? { ms: parsed.ms, label: parsed.label }
      : undefined
  } catch {
    return undefined
  }
}

// Ping this long before the cache runs out: a fifth of the lifetime, at most a minute.
const marginOf = (ttl: number) => Math.min(60_000, Math.floor(ttl * 0.2))

let isPinging = false
// When to next read the cache lifetime from the transcript (0 = not pending), and how often it came back empty.
let detectAt = 0
let detectTries = 0

const stopKeepWarm = async ($: EngineInterface, why: string) => {
  if ((await read($, keepWarmSince)) === 0) {
    return
  }

  await update($, keepWarmSince, () => 0)
  $.ui.toast(`Keep warm stopped: ${why}.`)
}

const startKeepWarm = async ($: EngineInterface): Promise<string> => {
  const ttl = await read($, ttlMs)
  const last = await read($, lastRequestAt)
  const now = await $.clock.now()

  if (ttl === 0 || last === 0) {
    return 'Cache lifetime not known yet. Send a message first; the next reply shows it.'
  }

  if (now >= last + ttl) {
    return 'The cache is already cold, so a ping would only pay for a cold restart. Send your next message instead.'
  }

  await update($, keepWarmSince, () => now)
  await update($, pingCount, () => 0)
  await update($, lastPing, () => '')

  return `Keep warm on: a hidden ping goes out about ${formatClock(marginOf(ttl))} before the cache runs out. It stops when you send a message or after 2 hours.`
}

const ping = async ($: EngineInterface) => {
  isPinging = true

  try {
    const startedAt = await $.clock.now()
    const reply = await $.model.fork({ prompt: PING })

    if (!reply.isAnswered) {
      await stopKeepWarm($, reply.reason === 'nothing-to-fork' ? 'nothing to keep warm yet' : `the ping failed (${reply.reason})`)

      return
    }

    const read_ = reply.usage.cache_read_input_tokens
    const wrote = reply.usage.cache_creation_input_tokens
    await update($, lastRequestAt, () => startedAt)
    await update($, pingCount, n => n + 1)
    await update($, lastPing, () => `read ${formatTokens(read_)}${wrote > 1000 ? `, re-wrote ${formatTokens(wrote)} (it was already cold)` : ''}`)

  } catch (error) {
    await stopKeepWarm($, `the ping failed (${String(error)})`)
  } finally {
    isPinging = false
  }
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
    await $.command.register({
      name: 'keep',
      description: 'keep warm: ping the chat just before its cache expires. keep off: stop',
    })
    await $.command.register({
      name: 'keep-warm',
      description: 'Toggle keep warm (hidden ping just before the prompt cache expires)',
    })

    // A session picked up mid-chat (a reload, a resume) has replies in its transcript already.
    detectAt = (await $.clock.now()) + 1000

    // One clock for the countdown redraw and for the keep-warm pings.
    $.clock.every(TICK_MS, () => {
      void (async () => {
        const last = await read($, lastRequestAt)

        if (last === 0) {
          return
        }

        $.ui.invalidate('ui.render')

        const at = await $.clock.now()

        if (detectAt > 0 && at >= detectAt) {
          detectAt = 0
          const found = await readTtl($)

          if (found) {
            await update($, ttlMs, () => found.ms)
            await update($, ttlLabel, () => found.label)
          } else if ((await read($, ttlMs)) === 0 && detectTries < 10) {
            // No cache data in the transcript yet: try again in a few seconds, then give up.
            detectTries += 1
            detectAt = at + 4000
          }
        }

        const since = await read($, keepWarmSince)

        if (since === 0 || isPinging || (await read($, isTurnRunning))) {
          return
        }

        const now = await $.clock.now()

        if (now - since >= MAX_KEEP_MS) {
          await stopKeepWarm($, '2 hours passed')

          return
        }

        const ttl = await read($, ttlMs)
        const remaining = last + ttl - now

        if (ttl > 0 && remaining > 0 && remaining <= marginOf(ttl)) {
          await ping($)
        } else if (ttl > 0 && remaining <= 0) {
          await stopKeepWarm($, 'the cache went cold')
        }
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'keep' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'warm') {
      return { text: await startKeepWarm($) }
    }

    if (arg === 'off' || arg === 'stop') {
      await stopKeepWarm($, 'you switched it off')

      return { text: 'Keep warm is off.' }
    }

    return { text: 'Use /keep warm to keep the cache warm, or /keep off to stop.' }
  })

  on('command.run', { command: 'keep-warm' }, async $ => {
    if ((await read($, keepWarmSince)) > 0) {
      await stopKeepWarm($, 'you switched it off')

      return { text: 'Keep warm is off.' }
    }

    return { text: await startKeepWarm($) }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isTurnRunning, () => true)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isTurnRunning, () => false)
      // The transcript is written a moment after the reply: read the lifetime from it on a later tick.
      detectAt = (await $.clock.now()) + 2000
      detectTries = 0
    }

    return next(e)
  })

  // Your next message ends keep warm.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && !e.isMeta) {
      await stopKeepWarm($, 'you sent a message')
    }

    return next(e)
  })

  // Each main-thread request refreshes the cache: restart the clock from when it started.
  on('turn.step', async function* ($, e, next) {
    const startedAt = e.agentId === undefined ? await $.clock.now() : 0
    const response = yield* next(e)

    if (e.agentId === undefined) {
      await update($, lastRequestAt, () => startedAt)

      if (response.usage) {
        const u = response.usage
        await update($, contextTokens, () => u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens)
      }
    }

    return response
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const hiddenBy = (await $.state.get({ plugin: 'switchboard', key: 'hidden' } as const)).value ?? []

    if (hiddenBy.includes($.plugin.name)) {
      return below
    }

    const last = await read($, lastRequestAt)

    if (last === 0 || e.props.hasSurvey || (await read($, isHidden))) {
      return below
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const ttl = await read($, ttlMs)
    const label = await read($, ttlLabel)
    const since = await read($, keepWarmSince)
    const running = await read($, isTurnRunning)
    const now = await $.clock.now()
    const remaining = last + ttl - now
    const isWarm = ttl > 0 && remaining > 0
    const tokens = await read($, contextTokens)
    const toggle = (
      <Button
        key="keep"
        label={since > 0 ? 'Stop' : 'Keep warm'}
        variant={since > 0 ? 'secondary' : 'primary'}
        onPress={async () => {
          if (since > 0) {
            await stopKeepWarm($, 'you switched it off')
          } else {
            $.ui.toast(await startKeepWarm($))
          }
        }}
      />
    )
    const hide = <Button key="hide" label="×" onPress={() => update($, isHidden, () => true)} />

    if (running) {
      return stack(Box, below, (
        <Box paddingX={1} gap={1}>
          <Text dimColor>⏱ Cache in use while Claude works</Text>
          {hide}
        </Box>
      ))
    }

    if (ttl === 0) {
      return stack(Box, below, (
        <Box paddingX={1} gap={1}>
          <Text dimColor>⏱ Cache timer: this reply showed no cache lifetime</Text>
          {hide}
        </Box>
      ))
    }

    if (!isWarm) {
      return stack(Box, below, (
        <Box paddingX={1} gap={1}>
          <Text color={RED} weight="bold">⏱ Cache cold</Text>
          <Text dimColor>{`your next message re-caches about ${formatTokens(tokens)} tokens at full price`}</Text>
          {hide}
        </Box>
      ))
    }

    const color = remaining > ttl * 0.5 ? GREEN : remaining > 60_000 ? AMBER : RED
    const pings = await read($, pingCount)
    const ping_ = await read($, lastPing)

    return stack(Box, below, (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={1}>
          <Text color={color} weight="bold">{`⏱ Cache warm ${formatClock(remaining)}`}</Text>
          <Text dimColor>{`(${label} lifetime)`}</Text>
          {toggle}
          {hide}
        </Box>
        {since > 0 && (
          <Text color={GREEN} wrap="truncate-end">
            {`Keep warm on · stops in ${formatClock(MAX_KEEP_MS - (now - since))} · ${pings} pings${ping_ ? ` · last ${ping_}` : ''}`}
          </Text>
        )}
      </Box>
    ))
  })
}
