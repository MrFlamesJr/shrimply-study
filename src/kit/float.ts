import { useLayoutEffect, type RefObject } from 'react'

/**
 * A small popup that hangs under a field (a refused name's reason), in the top layer, so no scroll box or narrow
 * column it sits in can cut it off: under its anchor, moved left to stay inside the window, above it when there is
 * no room below.
 */

export type Box = { left: number; top: number; bottom: number }

/** Where a popup of `size` goes under `anchor`, kept `margin` inside a `view` of that size. */
export function placeBelow(
  anchor: Box,
  size: { width: number; height: number },
  view: { width: number; height: number },
  margin = 8,
  gap = 4,
): { left: number; top: number } {
  const left = Math.max(margin, Math.min(anchor.left, view.width - size.width - margin))
  let top = anchor.bottom + gap
  if (top + size.height > view.height - margin && anchor.top - gap - size.height >= margin) top = anchor.top - gap - size.height
  return { left, top: Math.max(margin, top) }
}

/** Puts `el` under `at`, inside its window. */
function place(el: HTMLElement, at: Element) {
  const view = el.ownerDocument.defaultView
  if (!view) return
  const { left, top } = placeBelow(at.getBoundingClientRect(), { width: el.offsetWidth, height: el.offsetHeight }, { width: view.innerWidth, height: view.innerHeight })
  el.style.left = `${left}px`
  el.style.top = `${top}px`
}

/**
 * Shows `popup` (a `popover="manual"` element, rendered while `shown`) under `anchor`, and places it again on every
 * render (its text may change), when its window is resized and when anything in it scrolls. Its own CSS lays it out
 * from the window's top left (`inset: auto; margin: 0`) and keeps it inside the window (a `max-width`).
 */
export function useFloatBelow(popup: RefObject<HTMLElement | null>, anchor: RefObject<Element | null>, shown: boolean): void {
  useLayoutEffect(() => {
    const el = popup.current
    const at = anchor.current
    const view = el?.ownerDocument.defaultView
    if (!shown || !el || !at || !view) return
    el.showPopover()
    const again = () => place(el, at)
    view.addEventListener('resize', again)
    view.addEventListener('scroll', again, true)
    return () => {
      view.removeEventListener('resize', again)
      view.removeEventListener('scroll', again, true)
      if (el.isConnected && el.matches(':popover-open')) el.hidePopover()
    }
  }, [shown])
  useLayoutEffect(() => {
    if (shown && popup.current && anchor.current) place(popup.current, anchor.current)
  })
}
