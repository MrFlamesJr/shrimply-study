import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import './menu.css'

export type MenuItem = 'separator' | {
  label: string; onSelect?: () => void; shortcut?: string; disabled?: boolean
  reason?: string; danger?: boolean; checked?: boolean; submenu?: MenuItem[]
}

type Place =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'below'; rect: DOMRect }
  | { kind: 'side'; rect: DOMRect }

const SUB_DELAY = 200
const MARGIN = 4

let open: { root: Root; container: HTMLElement; before: Element | null; doc: Document } | null = null

/** Closes the open menu and gives the focus back to what had it, unless the user clicked somewhere else meanwhile. */
export function closeMenu(): void {
  if (!open) return
  const { root, container, before, doc } = open
  open = null
  const active = doc.activeElement
  const idle = !active || active === doc.body || container.contains(active)
  root.unmount()
  container.remove()
  if (idle && before && before.isConnected) (before as HTMLElement).focus()
}

/** Opens a menu at a point or under an anchor; one at a time. */
export function openMenu(items: MenuItem[], at: { x: number; y: number; doc?: Document } | { anchor: Element }): void {
  closeMenu()
  const anchor = 'anchor' in at ? at.anchor : null
  const doc = 'anchor' in at ? at.anchor.ownerDocument : (at.doc ?? document)
  const container = doc.createElement('div')
  doc.body.appendChild(container)
  const root = createRoot(container)
  open = { root, container, before: doc.activeElement, doc }
  const place: Place = anchor
    ? { kind: 'below', rect: anchor.getBoundingClientRect() }
    : { kind: 'point', x: (at as { x: number }).x, y: (at as { y: number }).y }
  root.render(<Menu items={items} place={place} focusFirst onDismiss={closeMenu} />)
}

type Real = Exclude<MenuItem, 'separator'>
const isItem = (i: MenuItem): i is Real => i !== 'separator'
const canUse = (i: MenuItem) => isItem(i) && !i.disabled

function Menu({ items, place, focusFirst, onDismiss }: {
  items: MenuItem[]; place: Place; focusFirst: boolean; onDismiss(): void
}) {
  const el = useRef<HTMLDivElement>(null)
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [sub, setSub] = useState<{ index: number; focus: boolean } | null>(null)
  const timer = useRef<number | null>(null)
  const typed = useRef({ text: '', at: 0 })
  // A long press opens the menu under the finger: the lift that follows must not pick an item.
  const pressedIn = useRef(false)

  useLayoutEffect(() => {
    const menu = el.current!
    const view = menu.ownerDocument.defaultView!
    menu.showPopover()
    const w = menu.offsetWidth
    const h = menu.offsetHeight
    const vw = view.innerWidth
    const vh = view.innerHeight
    let left: number
    let top: number
    if (place.kind === 'point') {
      left = place.x
      top = place.y
    } else if (place.kind === 'below') {
      left = place.rect.left
      top = place.rect.bottom
      if (top + h > vh - MARGIN) top = place.rect.top - h
    } else {
      left = place.rect.right
      top = place.rect.top - 5
      if (left + w > vw - MARGIN) left = place.rect.left - w
    }
    if (left + w > vw - MARGIN) left = place.kind === 'point' ? place.x - w : vw - w - MARGIN
    if (top + h > vh - MARGIN) top = vh - h - MARGIN
    setPos({ left: Math.max(MARGIN, left), top: Math.max(MARGIN, top) })
  }, [])

  useEffect(() => {
    const menu = el.current!
    if (focusFirst) refs.current[items.findIndex(canUse)]?.focus()
    const toggled = (e: Event) => {
      if ((e as Event & { newState?: string }).newState === 'closed') onDismiss()
    }
    menu.addEventListener('toggle', toggled)
    // A popup window that closes takes its menu with it.
    const win = menu.ownerDocument.defaultView
    const gone = () => closeMenu()
    if (place.kind !== 'side') win?.addEventListener('pagehide', gone)
    return () => {
      menu.removeEventListener('toggle', toggled)
      win?.removeEventListener('pagehide', gone)
      if (timer.current !== null) menu.ownerDocument.defaultView?.clearTimeout(timer.current)
    }
  }, [])

  const focusAt = (i: number) => refs.current[i]?.focus()
  const current = () => refs.current.findIndex((r) => !!r && r === r.ownerDocument.activeElement)
  const move = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= items.length; k++) {
      const i = (from + dir * k + items.length * 2) % items.length
      if (canUse(items[i])) return i
    }
    return from
  }
  const choose = (i: number, viaKey: boolean) => {
    const item = items[i]
    if (!isItem(item) || item.disabled) return
    if (item.submenu) {
      setSub({ index: i, focus: viaKey })
      return
    }
    closeMenu()
    item.onSelect?.()
  }
  const cancelTimer = () => {
    if (timer.current !== null) el.current!.ownerDocument.defaultView!.clearTimeout(timer.current)
    timer.current = null
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const at = current()
    const stop = () => { e.preventDefault(); e.stopPropagation() }
    switch (e.key) {
      case 'ArrowDown': stop(); focusAt(move(at < 0 ? -1 : at, 1)); return
      case 'ArrowUp': stop(); focusAt(move(at < 0 ? 0 : at, -1)); return
      case 'Home': stop(); focusAt(items.findIndex(canUse)); return
      case 'End': stop(); focusAt(items.length - 1 - [...items].reverse().findIndex(canUse)); return
      case 'Enter': case ' ': stop(); if (at >= 0) choose(at, true); return
      case 'ArrowRight': {
        const item = items[at]
        if (at >= 0 && isItem(item) && item.submenu) { stop(); choose(at, true) }
        return
      }
      case 'ArrowLeft': {
        // A submenu closes itself; the root has nothing to go back to.
        if (place.kind === 'side') { stop(); onDismiss() }
        return
      }
      case 'Tab': stop(); closeMenu(); return
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      stop()
      const t = typed.current
      const now = Date.now()
      t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase()
      t.at = now
      for (let k = 0; k < items.length; k++) {
        const i = (Math.max(at, -1) + (t.text.length === 1 ? k + 1 : k) + items.length) % items.length
        const item = items[i]
        if (isItem(item) && !item.disabled && item.label.toLowerCase().startsWith(t.text)) { focusAt(i); return }
      }
    }
  }

  const subItem = sub ? items[sub.index] : null
  return (
    <div ref={el} popover="auto" role="menu" className={'kit-menu' + (items.some((i) => isItem(i) && i.checked !== undefined) ? ' has-check' : '')} style={pos} onKeyDown={onKeyDown}
      onPointerDown={() => { pressedIn.current = true }}>
      {items.map((item, i) => {
        if (!isItem(item)) return <div key={i} className="kit-menu-gap" role="separator" />
        return (
          <div
            key={i}
            ref={(n) => { refs.current[i] = n }}
            role={item.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={item.checked !== undefined ? item.checked : undefined}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={item.submenu ? 'menu' : undefined}
            aria-expanded={item.submenu ? sub?.index === i : undefined}
            tabIndex={-1}
            title={item.disabled ? item.reason : undefined}
            className={'kit-menu-item' + (item.danger ? ' is-danger' : '')}
            onMouseEnter={() => {
              cancelTimer()
              if (!item.disabled) focusAt(i)
              if (sub && sub.index !== i) setSub(null)
              if (item.submenu && !item.disabled) {
                timer.current = el.current!.ownerDocument.defaultView!.setTimeout(() => setSub({ index: i, focus: false }), SUB_DELAY)
              }
            }}
            onClick={(e) => { e.stopPropagation(); if (pressedIn.current) choose(i, false) }}
          >
            {item.checked && (
              <svg className="kit-menu-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            )}
            <span className="kit-menu-label">{item.label}</span>
            {item.shortcut && <span className="kit-menu-shortcut">{item.shortcut}</span>}
            {item.submenu && (
              <svg className="kit-menu-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 3.5l4.5 4.5L6 12.5" />
              </svg>
            )}
            {sub?.index === i && subItem && isItem(subItem) && subItem.submenu && refs.current[i] && (
              <Menu
                items={subItem.submenu}
                place={{ kind: 'side', rect: refs.current[i]!.getBoundingClientRect() }}
                focusFirst={sub.focus}
                onDismiss={() => { setSub(null); focusAt(i) }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
