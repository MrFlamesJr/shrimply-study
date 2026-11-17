import { useEffect, useRef, useState } from 'react'

// Everything outside an open modal dialog is inert (no clicks, no hover, no focus), so a popover that must stay usable
// (the debug bar, the toasts) lives inside the topmost one while it is open, else in the body.
const hostOf = (doc: Document): HTMLElement => [...doc.querySelectorAll<HTMLElement>('dialog:modal')].at(-1) ?? doc.body

/** The element to portal into: the open modal dialog on top (the last in the page), else the body. `beforeChange` runs
 *  just before the host changes, while the old one is still on screen. */
export function useModalHost(doc: Document, beforeChange?: () => void): HTMLElement {
  const [host, setHost] = useState(() => hostOf(doc))
  const current = useRef(host)
  const before = useRef(beforeChange)
  before.current = beforeChange
  useEffect(() => {
    const update = () => {
      const next = hostOf(doc)
      if (next === current.current) return
      before.current?.()
      current.current = next
      setHost(next)
    }
    update()
    // A dialog opening or closing changes its `open` attribute; one taken away while open leaves the page.
    const observer = new (doc.defaultView as typeof window).MutationObserver(update)
    observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [doc])
  return host
}
