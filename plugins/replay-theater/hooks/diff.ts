// A small line diff. Pure: no file, model or screen is touched here.

// `o` and `w` are where the line stands in the old and in the new file (for a `+` line `o` is the spot it comes in at).
export type Line = { sign: '+' | '-' | ' '; text: string; o?: number; w?: number }

export type Change = { lines: Line[]; added: number; removed: number; isCut: boolean }

// A replayed change keeps at most this many lines; the counts stay exact.
export const MAX_LINES = 200
// Past this many cells the longest-common-subsequence step is skipped and the middle shows as replaced.
const MAX_CELLS = 250_000

const split = (text: string) => (text === '' ? [] : text.replace(/\r\n/g, '\n').split('\n'))

// Longest common subsequence of two short line lists, as the lines each side keeps.
const middle = (a: string[], b: string[]): Line[] => {
  if (a.length * b.length > MAX_CELLS) {
    return [...a.map((text): Line => ({ sign: '-', text })), ...b.map((text): Line => ({ sign: '+', text }))]
  }

  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint32Array(rows * cols)

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1]! + 1 : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!)
    }
  }

  const out: Line[] = []
  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ sign: ' ', text: a[i]! })
      i++
      j++
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) {
      out.push({ sign: '-', text: a[i++]! })
    } else {
      out.push({ sign: '+', text: b[j++]! })
    }
  }

  while (i < a.length) {
    out.push({ sign: '-', text: a[i++]! })
  }

  while (j < b.length) {
    out.push({ sign: '+', text: b[j++]! })
  }

  return out
}

// Unchanged lines kept on each side of the change, so it reads in place.
const CONTEXT = 3

// What changed between two texts: lines that went (`-`), lines that came (`+`) and a little unchanged context around them.
export const diffText = (before: string, after: string): Change => {
  const a = split(before)
  const b = split(after)
  let head = 0

  while (head < a.length && head < b.length && a[head] === b[head]) {
    head++
  }

  let tail = 0

  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail++
  }

  const body = middle(a.slice(head, a.length - tail), b.slice(head, b.length - tail))
  const added = body.filter(l => l.sign === '+').length
  const removed = body.filter(l => l.sign === '-').length

  if (added + removed === 0) {
    return { lines: [], added, removed, isCut: false }
  }

  const lead = Math.max(0, head - CONTEXT)
  const full: Line[] = [
    ...a.slice(lead, head).map((text): Line => ({ sign: ' ', text })),
    ...body,
    ...b.slice(b.length - tail, b.length - tail + CONTEXT).map((text): Line => ({ sign: ' ', text })),
  ]
  let oldN = lead + 1
  let newN = lead + 1
  const numbered = full.map((l): Line => {
    const placed = { ...l, o: oldN, w: newN }

    oldN += l.sign === '+' ? 0 : 1
    newN += l.sign === '-' ? 0 : 1

    return placed
  })

  // An unchanged line stays only when it sits within CONTEXT lines of a change.
  const near = numbered.map((_, k) => numbered.slice(Math.max(0, k - CONTEXT), k + CONTEXT + 1).some(l => l.sign !== ' '))
  const kept = numbered.filter((_, k) => near[k])
  const lines: Line[] = []
  let changes = 0

  for (const line of kept) {
    if (line.sign !== ' ' && ++changes > MAX_LINES) {
      break
    }

    lines.push(line)
  }

  return { lines, added, removed, isCut: added + removed > MAX_LINES }
}

// The lines as unified-diff hunks, which the engine's own `Code` component draws with gutters and the theme's diff colours.
export const toUnified = (lines: Line[]): string => {
  const hunks: Line[][] = []
  let prev: Line | undefined

  for (const line of lines) {
    const follows = prev !== undefined && line.o === prev.o! + (prev.sign === '+' ? 0 : 1) && line.w === prev.w! + (prev.sign === '-' ? 0 : 1)

    if (follows) {
      hunks[hunks.length - 1]!.push(line)
    } else {
      hunks.push([line])
    }

    prev = line
  }

  return hunks
    .map(h => {
      const oldCount = h.filter(l => l.sign !== '+').length
      const newCount = h.filter(l => l.sign !== '-').length
      const head = `@@ -${h[0]!.o},${oldCount} +${h[0]!.w},${newCount} @@`

      return [head, ...h.map(l => `${l.sign}${l.text}`)].join('\n')
    })
    .join('\n')
}
