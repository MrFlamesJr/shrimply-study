/** A span of the plain text; `end` is exclusive. */
export type Range = { start: number; end: number }
/** `explanation` is null when the blank has none, '' when one was opened but is still empty. */
export type Blank = Range & { explanation: string | null }

/** Outer before inner, which is the order of their `{`. */
const byPosition = (a: Range, b: Range) => a.start - b.start || b.end - a.end

/** Turns a statement with `{...}` blanks into plain text plus ranges, in the order the `{` appear. */
export function parseCloze(statement: string): { text: string; ranges: Range[] } {
  let text = ''
  const ranges: Range[] = []
  const open: Range[] = []
  for (let i = 0; i < statement.length; i++) {
    const c = statement[i]
    const next = statement[i + 1]
    if (c === '\\' && (next === '{' || next === '}' || next === '\\')) {
      text += next
      i++
    } else if (c === '{') {
      const range = { start: text.length, end: -1 }
      ranges.push(range)
      open.push(range)
    } else if (c === '}') {
      const range = open.pop()
      if (!range) throw new Error('"statement" has a } with no matching {.')
      range.end = text.length
      if (text.slice(range.start, range.end).trim() === '') throw new Error('"statement" has an empty blank.')
    } else {
      text += c
    }
  }
  if (open.length > 0) throw new Error('"statement" has a { with no matching }.')
  const seen = new Set<string>()
  for (const r of ranges) {
    const key = `${r.start}:${r.end}`
    if (seen.has(key)) throw new Error('"statement" marks the same text twice.')
    seen.add(key)
  }
  return { text, ranges }
}

/** Parses a statement and attaches explanation i to blank i. */
export function readCloze(statement: string, explanation: (string | null)[]): { text: string; blanks: Blank[] } {
  const { text, ranges } = parseCloze(statement)
  return { text, blanks: ranges.map((r, i) => ({ ...r, explanation: explanation[i] ?? null })) }
}

/** Writes plain text and sorted, nested blanks back into a statement. */
export function writeCloze(text: string, blanks: Blank[]): { statement: string; explanation: (string | null)[] } {
  let statement = ''
  for (let pos = 0; pos <= text.length; pos++) {
    for (const b of blanks) if (b.end === pos) statement += '}'
    for (const b of blanks) if (b.start === pos) statement += '{'
    if (pos < text.length) {
      const c = text[pos]
      statement += c === '{' || c === '}' || c === '\\' ? '\\' + c : c
    }
  }
  return { statement, explanation: blanks.map((b) => b.explanation) }
}

/** Adds a blank over the selection, or returns the message to show when it can't. */
export function markBlank(text: string, blanks: Blank[], start: number, end: number): Blank[] | string {
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  if (start >= end) return 'Select some text first.'
  for (const b of blanks) {
    if (b.start === start && b.end === end) return 'That text is already a blank.'
    const overlap = b.start < end && start < b.end
    const bContains = b.start <= start && end <= b.end
    const newContains = start <= b.start && b.end <= end
    if (overlap && !bContains && !newContains) return "Blanks can sit inside each other but can't cross."
  }
  return [...blanks, { start, end, explanation: null }].sort(byPosition)
}

/** Moves blanks to follow an edit of the text, dropping those that no longer hold text. */
export function shiftBlanks(oldText: string, newText: string, blanks: Blank[]): Blank[] {
  const max = Math.min(oldText.length, newText.length)
  let p = 0
  while (p < max && oldText[p] === newText[p]) p++
  let s = 0
  while (p + s < max && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++
  const a = p
  const b = oldText.length - s
  const len = newText.length - s - p
  const delta = newText.length - oldText.length
  const moved: Blank[] = []
  for (const { start: st, end: en, explanation } of blanks) {
    if (en <= a) moved.push({ start: st, end: en, explanation })
    else if (st >= b) moved.push({ start: st + delta, end: en + delta, explanation })
    else if (a <= st && en <= b) continue
    else moved.push({ start: st <= a ? st : a + len, end: en >= b ? en + delta : a, explanation })
  }
  const merged: Blank[] = []
  for (const blank of moved.filter((m) => newText.slice(m.start, m.end).trim() !== '').sort(byPosition)) {
    const last = merged[merged.length - 1]
    if (last && last.start === blank.start && last.end === blank.end) {
      if (!last.explanation) last.explanation = blank.explanation ?? last.explanation
    } else {
      merged.push({ ...blank })
    }
  }
  return merged
}

/** For each range, how many other ranges contain it. */
export function blankDepth(ranges: Range[]): number[] {
  return ranges.map((r, i) => ranges.filter((o, j) => j !== i && o.start <= r.start && o.end >= r.end).length)
}

/** The question for blank `i`: the text with it replaced by a gap, and the expected answer. */
export function clozeQuestion(text: string, ranges: Range[], i: number): { prompt: string; answer: string } {
  const { start, end } = ranges[i]
  return { prompt: text.slice(0, start) + '_____' + text.slice(end), answer: text.slice(start, end).trim() }
}
