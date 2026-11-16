export type Selection = { ids: string[]; anchor: string | null; focus: string | null }

/** Nothing selected. */
export const emptySelection: Selection = { ids: [], anchor: null, focus: null }

/** The ids from `a` to `b` in `order` (just `b` when either is not in it). */
function range(order: string[], a: string, b: string): string[] {
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  return i < 0 || j < 0 ? [b] : order.slice(Math.min(i, j), Math.max(i, j) + 1)
}

const union = (a: string[], b: string[]) => [...a, ...b.filter((id) => !a.includes(id))]

/** A click on `id`: plain selects just it; ctrl toggles it; shift selects anchor..id; ctrl+shift adds that range. */
export function select(s: Selection, id: string, mods: { ctrl?: boolean; shift?: boolean }, order: string[]): Selection {
  if (mods.shift) {
    const anchor = s.anchor ?? id
    const ids = range(order, anchor, id)
    return { ids: mods.ctrl ? union(s.ids, ids) : ids, anchor, focus: id }
  }
  if (mods.ctrl) {
    return { ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id], anchor: id, focus: id }
  }
  return { ids: [id], anchor: id, focus: id }
}

/** An arrow key: moves focus by `delta` (clamped). Plain selects the new focus; shift anchor..focus; ctrl moves focus only. */
export function step(s: Selection, delta: number, order: string[], mods: { shift?: boolean; ctrl?: boolean }): Selection {
  if (order.length === 0) return s
  const at = s.focus === null ? -1 : order.indexOf(s.focus)
  const from = at < 0 ? (delta > 0 ? -1 : order.length) : at
  const next = order[Math.min(Math.max(from + delta, 0), order.length - 1)]
  if (mods.shift) {
    const anchor = s.anchor ?? s.focus ?? next
    const ids = range(order, anchor, next)
    return { ids: mods.ctrl ? union(s.ids, ids) : ids, anchor, focus: next }
  }
  if (mods.ctrl) return { ...s, focus: next }
  return { ids: [next], anchor: next, focus: next }
}

/** Everything selected, anchored at the first and focused on the last. */
export function selectAll(order: string[]): Selection {
  return { ids: [...order], anchor: order[0] ?? null, focus: order[order.length - 1] ?? null }
}

/** Forgets ids that no longer exist; the same object when none went. */
export function prune(s: Selection, exists: (id: string) => boolean): Selection {
  const ids = s.ids.filter(exists)
  const anchor = s.anchor !== null && exists(s.anchor) ? s.anchor : null
  const focus = s.focus !== null && exists(s.focus) ? s.focus : null
  return ids.length === s.ids.length && anchor === s.anchor && focus === s.focus ? s : { ids, anchor, focus }
}

/** The selected ids in `order`'s order. */
export function ordered(s: Selection, order: string[]): string[] {
  return order.filter((id) => s.ids.includes(id))
}
