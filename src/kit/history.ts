export type Entry<S> = { label: string; before: S; after: S; key?: string; at: number }
export type History<S> = { past: Entry<S>[]; future: Entry<S>[] }

/** No past, no future. */
export function emptyHistory<S>(): History<S> {
  return { past: [], future: [] }
}

export type RecordOptions<S> = {
  limit?: number // default 100; the oldest go
  mergeMs?: number // default 1500
  // How two snapshots combine when entries merge: `before` keeps the first, `after` the last. Default: a / b.
  merge?: (a: S, b: S, keep: 'first' | 'last') => S
}

/** Adds an entry and clears the future; merges into the last when both share a `key` within `mergeMs`. */
export function record<S>(h: History<S>, e: Entry<S>, o: RecordOptions<S> = {}): History<S> {
  const { limit = 100, mergeMs = 1500, merge = (a: S, b: S, keep: 'first' | 'last') => (keep === 'first' ? a : b) } = o
  const last = h.past[h.past.length - 1]
  const merged: Entry<S>[] =
    last && e.key !== undefined && last.key === e.key && e.at - last.at <= mergeMs
      ? [{ ...last, before: merge(last.before, e.before, 'first'), after: merge(last.after, e.after, 'last'), at: e.at }]
      : last
        ? [last, e]
        : [e]
  const past = [...h.past.slice(0, -1), ...merged]
  return { past: past.length > limit ? past.slice(past.length - limit) : past, future: [] }
}

/** Steps back: the entry to undo (apply its `before`), or null. What is done next never merges into an older step. */
export function undo<S>(h: History<S>): { history: History<S>; entry: Entry<S> } | null {
  const entry = h.past[h.past.length - 1]
  return entry ? { entry, history: seal({ past: h.past.slice(0, -1), future: [...h.future, entry] }) } : null
}

/** Steps forward: the entry to redo (apply its `after`), or null. What is done next never merges into it. */
export function redo<S>(h: History<S>): { history: History<S>; entry: Entry<S> } | null {
  const entry = h.future[h.future.length - 1]
  return entry ? { entry, history: seal({ past: [...h.past, entry], future: h.future.slice(0, -1) }) } : null
}

/** Removes the entries `pred` picks, from past and future. */
export function drop<S>(h: History<S>, pred: (e: Entry<S>) => boolean): History<S> {
  return { past: h.past.filter((e) => !pred(e)), future: h.future.filter((e) => !pred(e)) }
}

/** The next record never merges into the current last entry (it loses its key). */
export function seal<S>(h: History<S>): History<S> {
  const last = h.past[h.past.length - 1]
  return last?.key === undefined ? h : { ...h, past: [...h.past.slice(0, -1), { ...last, key: undefined }] }
}

/** The label of what undo would undo. */
export const undoLabel = <S>(h: History<S>): string | null => h.past[h.past.length - 1]?.label ?? null
/** The label of what redo would redo. */
export const redoLabel = <S>(h: History<S>): string | null => h.future[h.future.length - 1]?.label ?? null
