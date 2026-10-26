import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Candidate } from '../types'
import { CHECK_MODEL, CHECK_SYSTEM, checkPrompt, parseVerdict, ruleKey, shouldCheck } from './detect'
import { DESTINATIONS } from './destinations'
import type { Config, Io } from './destinations'

const ORANGE = '#c2410c'
// Rules waiting for a choice; a burst of prompts cannot stack more than this.
const MAX_PENDING = 3

// Change the tag when the fields of a Candidate change: the engine declines what an earlier version stored.
const pending = atom({ plugin: 'reflect', key: 'pending' } as const, [], { shape: 'pending-1' })

// Rules already offered in this chat, so the same one is not asked about twice.
const seen = new Set<string>()
let isSaving = false
let counter = 0

const makeIo = async ($: EngineInterface): Promise<Io> => {
  const home = ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
  const root = await $.session.root()
  const now = await $.clock.now()

  return {
    home,
    root,
    today: new Date(now).toISOString().slice(0, 10),
    read: async path => {
      try {
        return await $.fs.read(path)
      } catch {
        return null
      }
    },
    write: (path, text) => $.fs.write(path, text),
    exists: path => $.fs.exists(path),
  }
}

// Runs in the background after the prompt has gone on its way, so checking never delays a turn.
const check = async ($: EngineInterface, text: string) => {
  try {
    const asked = await $.model.complete({
      model: CHECK_MODEL,
      system: CHECK_SYSTEM,
      prompt: checkPrompt(text),
      maxTokens: 200,
      timeoutMs: 20_000,
    })

    if (!asked.isAnswered) {
      return
    }

    const rule = parseVerdict(asked.text)
    const key = ruleKey(rule)

    if (!rule || seen.has(key)) {
      return
    }

    seen.add(key)
    counter += 1
    await update($, pending, list => [...list, { id: `r${counter}`, rule }].slice(-MAX_PENDING))
  } catch (e) {
    $.ui.log(`reflect: check failed (${String(e)})`, { to: 'debug' })
  }
}

export const register: Register = (on, options) => {
  const config: Config = {
    rulesFile: String(options.rulesFile ?? ''),
    vaultFolder: String(options.vaultFolder ?? ''),
  }
  const destinations = DESTINATIONS.filter(d => d.isAvailable(config))

  on('prompt.submit', async ($, e, next) => {
    // Whatever happens here must never hold a prompt back.
    try {
      if (shouldCheck(e.text, { isCommand: e.command !== undefined, isMeta: e.isMeta === true })) {
        void check($, e.text)
      }
    } catch {
      // the prompt goes on regardless
    }

    return next(e)
  })

  // A new chat starts with nothing pending.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      seen.clear()
      await update($, pending, () => [])
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = (await read($, pending)) as Candidate[]
    const current = list[0]

    if (!current || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const drop = () => update($, pending, l => l.filter(c => c.id !== current.id))

    return (
      <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor={ORANGE}>
        <Box gap={1}>
          <Text color={ORANGE}>●</Text>
          <Text weight="bold">That sounds like a lasting rule. Save it?</Text>
          {list.length > 1 ? <Text dimColor>{`(+${list.length - 1} more)`}</Text> : null}
        </Box>
        <Text>{`“${current.rule}”`}</Text>
        <Box gap={1}>
          {destinations.map((d, i) => (
            <Button
              key={d.id}
              label={d.label}
              variant={i === 0 ? 'primary' : undefined}
              onPress={async () => {
                if (isSaving) {
                  return
                }

                isSaving = true

                try {
                  const where = await d.save(await makeIo($), current.rule, config)

                  await drop()
                  $.ui.toast(`Saved: ${where}`)
                } catch (error) {
                  $.ui.toast(`Could not save (${error instanceof Error ? error.message : String(error)}). Pick another place or Skip.`)
                } finally {
                  isSaving = false
                }
              }}
            />
          ))}
          <Button
            key="skip"
            label="Skip"
            onPress={async () => {
              await drop()
              $.ui.toast('Skipped. Nothing saved.')
            }}
          />
        </Box>
      </Box>
    )
  })
}
