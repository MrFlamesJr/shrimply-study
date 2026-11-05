export type ToastKind = 'info' | 'warning' | 'error'
export type Toast = { id: string; kind: ToastKind; text: string; ms: number }

/** Replaces any toast with the same kind and text, so it moves to the end with a fresh timer. Nothing else is dropped. */
export function pushToast(list: Toast[], toast: Toast): Toast[] {
  return [...list.filter((t) => t.kind !== toast.kind || t.text !== toast.text), toast]
}
