// Grading for answers that are lists: a choice question with several right answers, a sequence put in order.

/** Right when the picks are exactly the right answers, in any order. */
export function samePicks(picked: string[], right: string[]): boolean {
  return picked.length === right.length && right.every((r) => picked.includes(r))
}

/** How a pick-all answer went: picks that are not right answers, right answers not picked, and right answers picked. */
export function pickCounts(picked: string[], right: string[]): { wrong: number; missed: number; correct: number } {
  const correct = right.filter((r) => picked.includes(r)).length
  return { wrong: picked.filter((p) => !right.includes(p)).length, missed: right.length - correct, correct }
}

/** Right when every step is in its place. */
export function sameOrder(placed: string[], steps: string[]): boolean {
  return placed.length === steps.length && steps.every((s, i) => placed[i] === s)
}

/** How a sequence put in order went: placed steps that are not in their place, and those that are. */
export function orderCounts(placed: string[], steps: string[]): { wrong: number; correct: number } {
  const correct = placed.filter((p, i) => p === steps[i]).length
  return { wrong: placed.length - correct, correct }
}

/** The placed steps put right: for each step in order, the place in `placed` of the one that goes there. One already
 * in its place stays there; steps with the same text keep the order they were placed in. */
export function rightOrder(placed: string[], steps: string[]): number[] {
  const taken = placed.map((p, i) => p === steps[i])
  return steps.map((step, i) => {
    if (placed[i] === step) return i
    // The first free one with this text, or any free one (the card was edited since).
    let from = placed.findIndex((p, j) => !taken[j] && p === step)
    if (from < 0) from = taken.indexOf(false)
    taken[from] = true
    return from
  })
}
