// A small line diff. Pure: no file, model or screen is touched here.

export type Line = { sign: '+' | '-'; text: string }

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

// What changed between two texts: lines that went (`-`) and lines that came (`+`), unchanged lines left out.
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

  const all = middle(a.slice(head, a.length - tail), b.slice(head, b.length - tail))
  const added = all.filter(l => l.sign === '+').length
  const removed = all.length - added

  return { lines: all.slice(0, MAX_LINES), added, removed, isCut: all.length > MAX_LINES }
}
