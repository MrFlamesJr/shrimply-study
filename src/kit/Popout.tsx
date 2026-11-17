import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { mountPopup, onPopupClosed, onPopupUnload, setPopupAddress, setPopupTitle, waitReloaded } from './windows'
import { guardNativeDrags } from './dnd'

// Renders children into a popup window opened by openPopup. Events work: React listens on the portal's container.
// `address` is the URL shown in the popup's address bar (same origin; nothing loads). A popup reloaded by its user is
// taken over again in its new document (`onReload` first, so the host can start its screens afresh); it is closed
// (`onClosed`) only when the window closes or no popup page comes within a few seconds.
export function Popout(p: {
  win: Window
  title: string
  address?: string
  onClosed: () => void
  onReload?: () => void
  children: ReactNode
}): ReactNode {
  const [root, setRoot] = useState<HTMLElement | null>(null)
  const closed = useRef(p.onClosed)
  closed.current = p.onClosed
  const reloaded = useRef(p.onReload)
  reloaded.current = p.onReload
  const title = useRef(p.title)
  title.current = p.title
  const address = useRef(p.address)
  address.current = p.address
  const closing = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(closing.current)
    let cancelled = false
    let ended = false
    let stopUnload = () => {}
    // The popup's document refuses native drags of links, images and stray files, as the main document does.
    let stopGuard = () => {}
    const end = () => {
      if (cancelled || ended) return
      ended = true
      closed.current()
    }
    const attach = (again: boolean) => {
      mountPopup(p.win, { title: title.current, address: address.current }).then((el) => {
        if (cancelled) return
        if (again) reloaded.current?.()
        const doc = el.ownerDocument
        stopGuard = guardNativeDrags(doc)
        stopUnload = onPopupUnload(p.win, () => {
          stopGuard()
          setRoot(null)
          waitReloaded(p.win, doc).then(() => !cancelled && attach(true), end)
        })
        setRoot(el)
      }, end)
    }
    const stopClosed = onPopupClosed(p.win, end)
    attach(false)
    return () => {
      cancelled = true
      stopClosed()
      stopUnload()
      stopGuard()
      // Deferred so React's development double run of effects does not close a popup that stays.
      closing.current = window.setTimeout(() => {
        if (!p.win.closed) p.win.close()
      }, 0)
    }
  }, [p.win])

  useEffect(() => {
    if (root && !p.win.closed) setPopupTitle(p.win, p.title)
  }, [root, p.win, p.title])

  useEffect(() => {
    if (root && !p.win.closed && p.address !== undefined) setPopupAddress(p.win, p.address)
  }, [root, p.win, p.address])

  return root ? createPortal(p.children, root) : null
}
