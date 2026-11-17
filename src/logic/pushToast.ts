export type ToastKind = 'info' | 'warning' | 'error'
/** A quiet button after a toast's text (Undo): it runs, then the toast closes. */
export type ToastAction = { label: string; run(): void }
export type Toast = { id: string; kind: ToastKind; text: string; ms: number; action?: ToastAction }
/** Shows a toast (Toasts' `useToasts` makes it): info, a warning or an error, for `ms` or its kind's time. */
export type Notify = (kind: ToastKind, text: string, ms?: number, action?: ToastAction) => void

/** Replaces any toast with the same kind and text, so it moves to the end with a fresh timer. Nothing else is dropped. */
export function pushToast(list: Toast[], toast: Toast): Toast[] {
  return [...list.filter((t) => t.kind !== toast.kind || t.text !== toast.text), toast]
}
