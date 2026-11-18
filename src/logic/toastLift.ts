// Where the toast stack sits while a study session shows: as low in its corner as it can without covering a control.

/** A control's vertical extent in window px (only the controls under the stack's column count). */
export type Span = { top: number; bottom: number }

/**
 * How far (px) the toast stack rises from its corner so it covers none of `controls`: the stack is `height` tall, its
 * bottom `edge` above the window's bottom, and it keeps `gap` from every control. The lowest clear spot wins (its
 * corner, or just above a control), staying inside the window. With no clear spot (a short window), the one that
 * covers the fewest controls, the lowest of those.
 */
export function toastLift(viewH: number, height: number, edge: number, gap: number, controls: Span[]): number {
  const covered = (lift: number) => {
    const bottom = viewH - edge - lift
    const top = bottom - height
    return controls.filter((c) => c.bottom + gap > top && c.top - gap < bottom).length
  }
  const fits = (lift: number) => viewH - edge - lift - height >= 0
  const lifts = [0, ...controls.map((c) => viewH - edge - c.top + gap)].filter((l) => l >= 0 && fits(l)).sort((a, b) => a - b)
  if (lifts.length === 0) return 0
  return lifts.reduce((best, l) => (covered(l) < covered(best) ? l : best))
}

/** Whether a stack spanning `top` to `bottom` (window px) sits over any of `controls`. */
export function coversControl(top: number, bottom: number, controls: Span[]): boolean {
  return controls.some((c) => c.bottom > top && c.top < bottom)
}
