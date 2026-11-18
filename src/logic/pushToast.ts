export type ToastKind = 'info' | 'warning' | 'error'
/** A quiet button after a toast's text (Undo): it runs, then the toast closes. */
export type ToastAction = { label: string; run(): void }
/** What a toast can carry besides its text: More info lines, the error behind it, an action, its lifetime. */
export type ToastMore = {
  detail?: string | (string | false | null | undefined)[]
  cause?: unknown
  action?: ToastAction
  ms?: number
}
/** `detail` is already resolved (`toastDetail`); `open` is whether More info is showing. */
export type Toast = { id: string; kind: ToastKind; text: string; detail: string[]; ms: number; action?: ToastAction; open?: boolean }
/** Shows a toast (Toasts' `useToasts` makes it): info, a warning or an error, for `more.ms` or its kind's time. */
export type Notify = (kind: ToastKind, text: string, more?: ToastMore) => void

/** The original error in words: a string as is, an object's `original` (a DriveError), an Error as "Name: message"; else null. */
export function causeText(err: unknown): string | null {
  if (typeof err === 'string') return err.trim() || null
  if (typeof err !== 'object' || err === null) return null
  const { original, name, message } = err as { original?: unknown; name?: unknown; message?: unknown }
  if (typeof original === 'string') return original.trim() || null
  if (typeof message !== 'string') return null
  const body = message.trim()
  const lead = typeof name === 'string' && name && name !== 'Error' ? `${name}: ` : ''
  return body ? `${lead}${body}` : null
}

/** The lines under More info: the detail (empty and false ones dropped), then the original error unless it is already said. */
export function toastDetail(text: string, more: Pick<ToastMore, 'detail' | 'cause'> = {}): string[] {
  const given = Array.isArray(more.detail) ? more.detail : [more.detail]
  const lines = given.filter((l): l is string => typeof l === 'string').map((l) => l.trim()).filter(Boolean)
  const cause = causeText(more.cause)
  if (cause && ![text, ...lines].some((l) => l.includes(cause))) lines.push(`Original error: ${cause}`)
  return lines
}

/** Replaces any toast with the same kind, text and detail, so it moves to the end with a fresh timer. Nothing else is dropped. */
export function pushToast(list: Toast[], toast: Toast): Toast[] {
  const key = (t: Toast) => `${t.kind}\n${t.text}\n${t.detail.join('\n')}`
  return [...list.filter((t) => key(t) !== key(toast)), toast]
}
