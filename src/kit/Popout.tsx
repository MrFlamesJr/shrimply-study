import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { mountPopup, onPopupClosed, setPopupTitle } from './windows'

// Renders children into a popup window opened by openPopup. Events work: React listens on the portal's container.
export function Popout(p: { win: Window; title: string; onClosed: () => void; children: ReactNode }): ReactNode {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const closed = useRef(p.onClosed)
  closed.current = p.onClosed
  const title = useRef(p.title)
  title.current = p.title
  const closing = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(closing.current)
    let cancelled = false
    let stop = () => {}
    mountPopup(p.win, { title: title.current }).then(
      (el) => {
        if (cancelled) return
        stop = onPopupClosed(p.win, () => closed.current())
        setRoot(el)
      },
      () => {
        if (!cancelled) closed.current()
      },
    )
    return () => {
      cancelled = true
      stop()
      // Deferred so React's development double run of effects does not close a popup that stays.
      closing.current = window.setTimeout(() => {
        if (!p.win.closed) p.win.close()
      }, 0)
    }
  }, [p.win])

  useEffect(() => {
    if (root && !p.win.closed) setPopupTitle(p.win, p.title)
  }, [root, p.win, p.title])

  return root ? createPortal(p.children, root) : null
}
