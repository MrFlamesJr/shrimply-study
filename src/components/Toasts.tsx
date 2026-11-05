import { useEffect, useRef, useState } from 'react'
import { newId } from '../model'
import { pushToast, type Toast, type ToastKind } from '../logic/pushToast'
import { CrossIcon } from './Icons'
import { IconButton } from './IconButton'

export type Notify = (kind: ToastKind, text: string, ms?: number) => void

const LIFETIME: Record<ToastKind, number> = { info: 5000, warning: 8000, error: 12000 }
const LABEL: Record<ToastKind, string> = { info: 'Info', warning: 'Warning', error: 'Error' }
// The badge shape (circle, triangle, octagon) comes from CSS; this is the glyph inside it.
const GLYPH: Record<ToastKind, string> = { info: 'i', warning: '!', error: '!' }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify: Notify = (kind, text, ms) =>
    setToasts((list) => pushToast(list, { id: newId(), kind, text, ms: ms ?? LIFETIME[kind] }))
  const dismiss = (id: string) => setToasts((list) => list.filter((t) => t.id !== id))
  return { toasts, notify, dismiss }
}

// Bottom-right stack. The kind badge overhangs the top-left corner. The bar on top is a CSS animation; when it ends the toast closes.
// The stack uses column-reverse: the newest toast comes first in the DOM, sits at the bottom, and scrolling starts there.
// The stack is a popover, so it sits in the top layer where nothing on the page covers it. Whatever opens
// there after it (a dialog, the color palette) would sit above it, so it moves back to the top each time
// something opens and each time a toast comes.
export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss(id: string): void }) {
  const ref = useRef<HTMLElement>(null)
  const raise = () => {
    const stack = ref.current
    if (!stack) return
    if (stack.matches(':popover-open')) stack.hidePopover()
    stack.showPopover()
  }
  useEffect(raise, [toasts.length])
  useEffect(() => {
    const onToggle = (e: Event) => {
      if (e.target !== ref.current && (e as ToggleEvent).newState === 'open') raise()
    }
    document.addEventListener('toggle', onToggle, true)
    return () => document.removeEventListener('toggle', onToggle, true)
  }, [])

  return (
    <section
      ref={ref}
      popover="manual"
      className="toasts"
      aria-label="Notifications"
      aria-live="polite"
      onMouseLeave={(e) => {
        e.currentTarget.scrollTop = 0 // back to the newest before it closes
      }}
    >
      {[...toasts].reverse().map((t) => (
        <div key={t.id} className={`toast is-${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
          <span className="toast-kind" role="img" aria-label={LABEL[t.kind]}>
            {GLYPH[t.kind]}
          </span>
          <p>{t.text}</p>
          <IconButton label="Dismiss" onClick={() => dismiss(t.id)}>
            <CrossIcon />
          </IconButton>
          <div className="toast-track">
            <div className="toast-life" style={{ animationDuration: `${t.ms}ms` }} onAnimationEnd={() => dismiss(t.id)} />
          </div>
        </div>
      ))}
    </section>
  )
}
