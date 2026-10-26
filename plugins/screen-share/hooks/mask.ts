// Display-only masking. Pure functions: nothing here touches the chat, the model or the disk.

// A medium-shade block reads as a grey bar in any terminal theme. Every category gets the same width,
// so a bar never tells how long the real text was.
export const BAR = '▒▒▒▒▒▒▒▒'

const EMAIL = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g

const MONEY_SYMBOL_FIRST = /(?:US\$|[$€£]|\b(?:USD|EUR|GBP)\b)[ \t]?\d(?:[\d.,]*\d)?(?:[ \t]?(?:[kKmMbB]|thousand|million|billion)(?![A-Za-z]))?/g
const MONEY_SYMBOL_LAST = /\d(?:[\d.,]*\d)?(?:[ \t]?(?:[kKmM]|thousand|million|billion))?[ \t]?(?:€|\$|£|USD\b|EUR\b|GBP\b|dollars?\b|euros?\b|pounds?\b)/gi

// Digits, optionally grouped by spaces, dots, dashes or brackets, optionally led by + or 00.
const PHONE = /(?<![\w.@-])(?:\+|00)?\(?\d{1,4}\)?(?:[ .-]?\(?\d{2,4}\)?){2,5}(?![\w@])/g

const NAME_WORD = "[A-ZÀ-ÝÇ][a-zà-ÿç]+(?:['’-][A-ZÀ-Ý]?[a-zà-ÿ]+)?"
const NAME_PARTICLE = '(?:(?:de|da|do|dos|das|di|van|von|der|del|la|le|bin|al)[ \\t]+)?'
const NAME_SEQUENCE = new RegExp(`(?<![\\w@/\\\\.-])${NAME_WORD}(?:[ \\t]+${NAME_PARTICLE}${NAME_WORD}){1,3}(?![\\w@])`, 'g')
const NAME_AFTER_TITLE = new RegExp(
  `\\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Sr|Sra|Dra|Dear|Hi|Hello|Hey|Ol[aá])\\.?[ \\t]+(${NAME_WORD}(?:[ \\t]+${NAME_PARTICLE}${NAME_WORD}){0,2})`,
  'g',
)

// Capitalised phrases that are not people. A phrase holding any of these is left alone.
const NOT_NAMES = new Set(
  `january february march april may june july august september october november december
  monday tuesday wednesday thursday friday saturday sunday
  claude code anthropic windows linux mac macos ios android microsoft google apple amazon github gitlab git node nodejs
  typescript javascript python rust docker vercel supabase solana anchor obsidian opus sonnet haiku fable codex openai
  next step steps open questions current state goal context decisions decision rules progress done not started what
  tried failed working tree how use read write edit bash grep glob skill skills agent agents tool tools result results
  error errors warning note notes summary overview test tests build run install setup config settings plugin plugins
  mod mods hook hooks handoff reflect screen share mode cache clock chat brain dump helper desk inventory file files
  project projects repo repository true false none the this that these those and but for with from into yes okay
  save skip start fresh copy retry hide show turn off cold warm window pane panel band toast status line command
  commands session sessions model models prompt prompts message messages token tokens context memory vault main
  branch commit push pull merge README license readme package json html css sql api cli url http https
  today tomorrow yesterday home inbox daily weekly monthly quarterly project area areas resource resources archive
  active frozen dropped gated blocker blockers risk risks plan plans spec specs task tasks backlog index log`
    .split(/\s+/)
    .filter(Boolean),
)

// Words in an email address that are a role, not a person.
const ROLE_WORDS = new Set(
  'info hello contact support sales admin office team mail email noreply no-reply billing hr jobs press help service accounts contato geral'.split(' '),
)

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type Span = [number, number]

const merge = (spans: Span[]): Span[] => {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const out: Span[] = []

  for (const span of sorted) {
    const last = out[out.length - 1]

    if (last && span[0] <= last[1]) {
      last[1] = Math.max(last[1], span[1])
    } else {
      out.push([span[0], span[1]])
    }
  }

  return out
}

const matches = (re: RegExp, text: string) => [...text.matchAll(re)]

const isMoney = (found: string) => {
  const digits = found.replace(/\D/g, '')
  const hasSuffix = /[kKmMbB]$|thousand|million|billion/.test(found.trim())
  const hasDecimal = /[.,]\d/.test(found)

  // `$1` and `$2` are shell and regex captures far more often than prices.
  return !(/^\$/.test(found) && digits.length < 2 && !hasSuffix && !hasDecimal)
}

const isPhone = (found: string) => {
  const digits = found.replace(/\D/g, '')

  if (digits.length < 9 || digits.length > 15) {
    return false
  }

  if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(found) || /^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}$/.test(found)) {
    return false
  }

  const hasPlus = /^(\+|00)/.test(found)

  // Dots alone make a version or an IP address; bare digits make an id, except a 9-digit national number.
  if (!hasPlus && !/[ -]/.test(found) && !found.includes('(')) {
    return /^[2-9]\d{8}$/.test(found)
  }

  return true
}

// Fenced blocks and inline code: the Title Case guess stays out of them.
const codeRanges = (text: string): Span[] => [
  ...matches(/```[\s\S]*?(?:```|$)/g, text).map((m): Span => [m.index!, m.index! + m[0].length]),
  ...matches(/`[^`\n]*`/g, text).map((m): Span => [m.index!, m.index! + m[0].length]),
]

const headingRanges = (text: string): Span[] =>
  matches(/^[ \t]*#{1,6}[ \t].*$/gm, text).map((m): Span => [m.index!, m.index! + m[0].length])

const inside = (ranges: Span[], start: number, end: number) => ranges.some(([a, b]) => start >= a && end <= b)

const wordsOf = (name: string) => name.split(/[\s'’-]+/).filter(w => w.length >= 3 && !NOT_NAMES.has(w.toLowerCase()))

export type MaskOptions = {
  // Prose rows (the person's prompt, Claude's answer, command output) also get the Title Case guess.
  // Tool inputs and results do not, since code and logs are full of capitalised phrases.
  isProse: boolean
  // Names the person added with `/screen-share add`.
  names?: readonly string[]
}

export type Masker = {
  mask: (text: string, options: MaskOptions) => string
  maskDeep: <T>(value: T, options: MaskOptions) => T
  count: () => number
  reset: () => void
}

// Keys whose strings the row needs untouched to find its file or draw itself.
const KEEP_KEYS = new Set(['filePath', 'file_path', 'path', 'cwd', 'pattern', 'type', 'tool', 'tool_use_id'])

export const createMasker = (): Masker => {
  // Words of people seen in an email address or a Title Case name: once known, masked wherever they appear.
  const learned = new Set<string>()
  let learnedCache: { size: number; manual: string; re: RegExp | null } = { size: -1, manual: '', re: null }

  const nameRegExp = (manual: readonly string[]) => {
    const key = manual.join('\n')

    if (learnedCache.size === learned.size && learnedCache.manual === key) {
      return learnedCache.re
    }

    const words = new Set(learned)

    for (const name of manual) {
      for (const word of name.split(/[\s]+/)) {
        if (word.length >= 2) {
          words.add(word.toLowerCase())
        }
      }
    }

    const re = words.size
      ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...words].sort((a, b) => b.length - a.length).map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
      : null

    learnedCache = { size: learned.size, manual: key, re }

    return re
  }

  const learnWords = (name: string) => {
    for (const word of wordsOf(name)) {
      learned.add(word.toLowerCase())
    }
  }

  const mask = (text: string, options: MaskOptions) => {
    if (!text || text.length > 500_000) {
      return text
    }

    const spans: Span[] = []
    const add = (m: RegExpMatchArray, from = 0, to = m[0].length) => spans.push([m.index! + from, m.index! + to])

    for (const m of matches(EMAIL, text)) {
      add(m)

      for (const part of m[0].split('@')[0]!.split(/[._+-]+/)) {
        if (/^\p{L}{3,}$/u.test(part) && !ROLE_WORDS.has(part.toLowerCase()) && !NOT_NAMES.has(part.toLowerCase())) {
          learned.add(part.toLowerCase())
        }
      }
    }

    for (const m of matches(MONEY_SYMBOL_FIRST, text)) {
      if (isMoney(m[0])) {
        add(m)
      }
    }

    for (const m of matches(MONEY_SYMBOL_LAST, text)) {
      add(m)
    }

    for (const m of matches(PHONE, text)) {
      if (isPhone(m[0])) {
        add(m)
      }
    }

    for (const m of matches(NAME_AFTER_TITLE, text)) {
      learnWords(m[1]!)
      add(m, m[0].length - m[1]!.length)
    }

    if (options.isProse) {
      const code = codeRanges(text)
      const headings = headingRanges(text)

      for (const m of matches(NAME_SEQUENCE, text)) {
        const start = m.index!
        const end = start + m[0].length

        if (inside(code, start, end) || inside(headings, start, end)) {
          continue
        }

        if (m[0].split(/\s+/).some(w => NOT_NAMES.has(w.toLowerCase()))) {
          continue
        }

        learnWords(m[0])
        add(m)
      }
    }

    const known = nameRegExp(options.names ?? [])

    if (known) {
      for (const m of matches(known, text)) {
        add(m)
      }
    }

    if (spans.length === 0) {
      return text
    }

    let out = ''
    let at = 0

    for (const [start, end] of merge(spans)) {
      out += text.slice(at, start) + BAR
      at = end
    }

    return out + text.slice(at)
  }

  const maskDeep = <T,>(value: T, options: MaskOptions, key = ''): T => {
    if (typeof value === 'string') {
      return (KEEP_KEYS.has(key) ? value : mask(value, options)) as T
    }

    if (Array.isArray(value)) {
      return value.map(item => maskDeep(item, options, key)) as T
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v, options, k)])) as T
    }

    return value
  }

  return {
    mask,
    maskDeep: (value, options) => maskDeep(value, options),
    count: () => learned.size,
    reset: () => {
      learned.clear()
      learnedCache = { size: -1, manual: '', re: null }
    },
  }
}
