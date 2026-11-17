import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { activeWindow, subscribeWindows } from '../kit/windows'
import { newId } from '../model'
import { pushToast, type Notify, type Toast, type ToastKind } from '../logic/pushToast'
import { toastLift } from '../logic/toastLift'
import { CrossIcon } from './Icons'
import { IconButton } from './IconButton'

export type { Notify }

// What a toast never covers: the controls of a study question and its feedback sheet, in any pane (not the flip card
// itself, which is the card, nor the results list).
const KEEP_CLEAR = '.session:not(.is-results) :is(button, input, textarea, select, a[href]):not(.flip-card)'

const LIFETIME: Record<ToastKind, number> = { info: 5000, warning: 8000, error: 12000 }
// A toast with an action stays long enough to reach it.
const ACTION_LIFETIME = 8000
const LABEL: Record<ToastKind, string> = { info: 'Info', warning: 'Warning', error: 'Error' }
// The badge shape (circle, triangle, octagon) comes from CSS; this is the glyph inside it.
const GLYPH: Record<ToastKind, string> = { info: 'i', warning: '!', error: '!' }

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify: Notify = (kind, text, ms, action) =>
    setToasts((list) =>
      pushToast(list, { id: newId(), kind, text, ms: ms ?? (action ? Math.max(LIFETIME[kind], ACTION_LIFETIME) : LIFETIME[kind]), action }),
    )
  const dismiss = (id: string) => setToasts((list) => list.filter((t) => t.id !== id))
  return { toasts, notify, dismiss }
}

// Bottom-right stack. The kind badge overhangs the top-left corner. The bar on top is a CSS animation; when it ends the toast closes.
// The stack uses column-reverse: the newest toast comes first in the DOM, sits at the bottom, and scrolling starts there.
// The stack is a popover, so it sits in the top layer where nothing on the page covers it. Whatever opens
// there after it (a dialog, the color palette) would sit above it, so it moves back to the top each time
// something opens and each time a toast comes. It renders into the active window (a popped-out pane's popup, or the main one). The debug bar stays above it (it raises itself over the stack in turn).
export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss(id: string): void }) {
  const ref = useRef<HTMLElement>(null)
  const win = useSyncExternalStore(subscribeWindows, activeWindow)
  const raise = () => {
    const stack = ref.current
    if (!stack) return
    if (stack.matches(':popover-open')) stack.hidePopover()
    stack.showPopover()
  }
  useEffect(raise, [toasts.length, win])
  useEffect(() => {
    const onToggle = (e: Event) => {
      const other = e.target !== ref.current && !(e.target as Element).matches('.debug-bar')
      if (other && (e as ToggleEvent).newState === 'open') raise()
    }
    win.document.addEventListener('toggle', onToggle, true)
    return () => win.document.removeEventListener('toggle', onToggle, true)
  }, [win])

  // A study session's controls are never covered (the feedback sheet's buttons sit right in this corner, a question's
  // answers often too): while toasts show, the stack rises above those under its column (`--toasts-lift`, toastLift),
  // measured again whenever the page changes. Not while it is pointed at or focused: it never moves under the pointer.
  useLayoutEffect(() => {
    const stack = ref.current
    if (!stack || toasts.length === 0) return
    const doc = win.document
    let frame = 0
    const place = () => {
      frame = 0
      if (stack.matches(':hover, :focus-within')) return
      const css = win.getComputedStyle(stack)
      const column = stack.getBoundingClientRect()
      const boxes = [...stack.children].map((c) => c.getBoundingClientRect())
      const content = boxes.length ? Math.max(...boxes.map((r) => r.bottom)) - Math.min(...boxes.map((r) => r.top)) : 0
      const height = Math.min(content, parseFloat(css.maxHeight) - parseFloat(css.paddingTop))
      const controls = [...doc.querySelectorAll(KEEP_CLEAR)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0 && r.right > column.left && r.left < column.right)
      const lift = toastLift(win.innerHeight, height, parseFloat(css.bottom), parseFloat(css.rowGap), controls)
      stack.style.setProperty('--toasts-lift', `${lift}px`)
    }
    const soon = () => {
      if (!frame) frame = win.requestAnimationFrame(place)
    }
    place()
    // The sheet coming or going, a question marked, a pane resized or scrolled, a slide ending.
    const watch = new (win as typeof window).MutationObserver(soon)
    watch.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] })
    win.addEventListener('resize', soon)
    for (const type of ['scroll', 'animationend', 'transitionend']) doc.addEventListener(type, soon, true)
    return () => {
      watch.disconnect()
      win.cancelAnimationFrame(frame)
      win.removeEventListener('resize', soon)
      for (const type of ['scroll', 'animationend', 'transitionend']) doc.removeEventListener(type, soon, true)
    }
  }, [toasts, win])

  return createPortal(
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
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <IconButton label="Dismiss" onClick={() => dismiss(t.id)}>
            <CrossIcon />
          </IconButton>
          <div className="toast-track">
            <div className="toast-life" style={{ animationDuration: `${t.ms}ms` }} onAnimationEnd={() => dismiss(t.id)} />
          </div>
        </div>
      ))}
    </section>,
    win.document.body,
  )
}
