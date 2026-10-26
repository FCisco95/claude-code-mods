import type { EngineInterface, Register } from 'claude-code'

// A prompt this long (in words) is treated as a brain dump.
const MIN_WORDS = 120
// Start a prompt with this to send it untouched.
const BYPASS = '!!'
// Routing: judging gaps and restructuring is synthesis, not classification, so the Sonnet tier, not Haiku.
const MODEL = 'sonnet'

type Question = { question: string; options: string[] }

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

// Our own output carries these headings; seeing both means the prompt is already refined.
const isStructured = (text: string) => /THE JOB/i.test(text) && /DONE MEANS/i.test(text)

const parseQuestions = (raw: string): Question[] => {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')

  if (start === -1 || end <= start) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1))

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter(
        (q): q is Question =>
          typeof q?.question === 'string' &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          q.options.every((o: unknown) => typeof o === 'string'),
      )
      .slice(0, 3)
      .map(q => ({ question: q.question, options: q.options.slice(0, 4) }))
  } catch {
    return []
  }
}

const QUESTIONS_SYSTEM = `You read a long, messy brain-dump prompt (often a voice transcription, so it may contain transcription errors, jumps and contradictions) that someone is about to send to a coding assistant.
Find the 2 or 3 gaps that matter most for doing the job well: an unclear goal, a contradiction, a missing constraint, an undefined "done".
Ask only what the text does not already answer. Never ask something the text states.
Write each question in the same language as the brain dump, ending in a question mark, with 2 to 4 short answer options.
Reply with a JSON array only, no prose: [{"question": "...?", "options": ["...", "..."]}]. Reply [] if nothing important is missing.`

const REWRITE_SYSTEM = `You turn a messy brain-dump prompt into one clear prompt for a coding assistant.
Write it in the same language as the brain dump, as plain text with exactly these four headings in capitals:

THE JOB
THE WHY
THE GUARDRAILS
DONE MEANS

Rules:
- THE JOB: what to do, as short bullets or sentences. Fix obvious voice-transcription errors using context.
- THE WHY: the purpose or motivation behind the job, in one or two sentences.
- THE GUARDRAILS: constraints, limits, things not to do.
- DONE MEANS: concrete, checkable completion criteria.
- Use the answers to the clarifying questions to resolve gaps and contradictions. An answer wins over the original text.
- Keep every concrete detail: names, numbers, paths, tools, deadlines. Do not invent facts. If a section has nothing in the source, write one line saying it was not specified.
- Reply with the prompt only, no preamble, no code fences.`

const refine = async ($: EngineInterface, original: string) => {
  const restore = async (message: string) => {
    const box = await $.prompt.fill({ text: original })

    if (!box.isFilled) {
      $.ui.log(`brain-dump: could not refill the prompt box. Your original prompt:\n\n${original}`)
    }

    $.ui.toast(message)
  }

  $.ui.status('brain-dump: reading your prompt...')

  try {
    const asked = await $.model.complete({
      model: MODEL,
      system: QUESTIONS_SYSTEM,
      prompt: original,
      effort: 'low',
      maxTokens: 800,
      timeoutMs: 60000,
    })

    if (!asked.isAnswered) {
      return await restore(`brain-dump: no reply (${asked.reason}). Your original prompt is back in the box.`)
    }

    const answers: { question: string; answer: string }[] = []

    for (const q of parseQuestions(asked.text)) {
      try {
        const answer = await $.ui.ask(q.question, { options: q.options, header: 'Brain-dump' })
        answers.push({ question: q.question, answer })
      } catch {
        return await restore('brain-dump cancelled. Your original prompt is back in the box.')
      }
    }

    $.ui.status('brain-dump: writing the clear prompt...')

    const qa = answers.length
      ? answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')
      : '(no clarifying questions were needed)'

    const rewritten = await $.model.complete({
      model: MODEL,
      system: REWRITE_SYSTEM,
      prompt: `BRAIN DUMP:\n${original}\n\nCLARIFYING ANSWERS:\n${qa}`,
      effort: 'medium',
      maxTokens: 3000,
      timeoutMs: 90000,
    })

    if (!rewritten.isAnswered) {
      return await restore(`brain-dump: rewrite failed (${rewritten.reason}). Your original prompt is back in the box.`)
    }

    const box = await $.prompt.fill({ text: rewritten.text.trim() })

    if (!box.isFilled) {
      $.ui.log(`brain-dump: could not fill the prompt box. The clear prompt:\n\n${rewritten.text.trim()}`)
    }

    $.ui.toast('Prompt ready. Review it, then press Enter.')
  } catch (error) {
    await restore(`brain-dump failed: ${String(error)}. Your original prompt is back in the box.`)
  } finally {
    $.ui.status(undefined)
  }
}

export const register: Register = on => {
  on('prompt.submit', ($, e, next) => {
    const isUsersOwn = e.origin.kind === 'composer'
    const isPlain = !e.command && !e.isMeta && !e.attachments?.length

    if (!isUsersOwn || !isPlain) {
      return next(e)
    }

    if (e.text.startsWith(BYPASS)) {
      return next({ ...e, text: e.text.slice(BYPASS.length).trimStart() })
    }

    if (countWords(e.text) < MIN_WORDS || isStructured(e.text)) {
      return next(e)
    }

    // Hold the prompt back; the refining runs on its own and refills the box.
    void refine($, e.text)

    return { drop: 'brain-dump: long prompt held back. Answer the questions, then review and send the clear prompt.' }
  })
}
