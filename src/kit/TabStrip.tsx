import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { endDrag, readDrag, startDrag, type DragPayload } from './dnd'
import { createLongPress } from './longPress'
import './tabs.css'

export type TabItem = { id: string; title: string; description?: string; tooltip?: string; dirty?: boolean; icon?: ReactNode }

type Props = {
  group: string
  tabs: TabItem[]
  active: string | null
  focused: boolean
  dragKind: string
  onActivate(id: string): void
  onClose(id: string): void
  onMove(id: string, index: number): void
  onDrop(payload: DragPayload, index: number): void
  canDrop(payload: DragPayload): boolean
  onContextMenu(id: string, at: { x: number; y: number }): void
  actions?: ReactNode
}

const Cross = () => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
  </svg>
)

/** One group's tabs. */
export function TabStrip(p: Props) {
  const scroll = useRef<HTMLDivElement>(null)
  // A long press on a tab is the touch version of a right click.
  const pressed = useRef('')
  const menu = useRef(p.onContextMenu)
  menu.current = p.onContextMenu
  const [hold] = useState(() => createLongPress((x, y) => menu.current(pressed.current, { x, y })))
  // Where a drag would land: the index and the line's left edge inside the scrolling part.
  const [drop, setDrop] = useState<{ index: number; x: number } | null>(null)
  const focusTab = (id: string) => {
    const tabs = Array.from(scroll.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
    tabs.find((t) => t.dataset.tab === id)?.focus()
  }
  // The focused tab and its place: when it closes with the focus in the strip, the neighbour takes the focus.
  const lastFocus = useRef<{ id: string; index: number } | null>(null)
  const rovingId = p.active !== null && p.tabs.some((t) => t.id === p.active) ? p.active : p.tabs[0]?.id

  // The wheel scrolls sideways (a native listener: React's wheel is passive).
  useEffect(() => {
    const el = scroll.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || e.deltaX !== 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  // The active tab scrolls into view when it changes.
  useEffect(() => {
    const el = scroll.current
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!el || !tab) return
    if (tab.offsetLeft < el.scrollLeft) el.scrollLeft = tab.offsetLeft
    else if (tab.offsetLeft + tab.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = tab.offsetLeft + tab.offsetWidth - el.clientWidth
  }, [p.active])

  useEffect(() => {
    const el = scroll.current
    const last = lastFocus.current
    if (!el || !last || p.tabs.some((t) => t.id === last.id)) return
    lastFocus.current = null
    const active = el.ownerDocument.activeElement
    if (active && active.nodeName !== 'BODY' && active.nodeName !== 'HTML') return
    const next = p.tabs[Math.min(last.index, p.tabs.length - 1)]
    if (next) focusTab(next.id)
  }, [p.tabs])

  const keyDown = (e: KeyboardEvent<HTMLElement>, id: string, i: number) => {
    const go = (k: number) => {
      e.preventDefault()
      const t = p.tabs[(k + p.tabs.length) % p.tabs.length]
      if (t) focusTab(t.id)
    }
    if (e.key === 'ArrowLeft') go(i - 1)
    else if (e.key === 'ArrowRight') go(i + 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(p.tabs.length - 1)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      p.onActivate(id)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      p.onClose(id)
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      p.onContextMenu(id, { x: r.left, y: r.bottom })
    }
  }

  const aux = (e: MouseEvent, id: string) => {
    if (e.button !== 1) return
    e.preventDefault()
    p.onClose(id)
  }

  // The index a pointer at clientX lands on, and where the line goes.
  const landing = (clientX: number) => {
    const el = scroll.current
    if (!el) return null
    const box = el.getBoundingClientRect()
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[role="tab"]'))
    let index = 0
    for (const t of tabs) {
      const r = t.getBoundingClientRect()
      if (clientX > r.left + r.width / 2) index++
    }
    const next = tabs[index]?.getBoundingClientRect()
    const prev = tabs[index - 1]?.getBoundingClientRect()
    const edge = next ? next.left : prev ? prev.right : box.left
    return { index, x: edge - box.left + el.scrollLeft }
  }

  const dragOver = (e: DragEvent) => {
    const payload = readDrag(e.dataTransfer)
    if (!payload || !p.canDrop(payload)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDrop(landing(e.clientX))
  }

  const dropped = (e: DragEvent) => {
    const payload = readDrag(e.dataTransfer)
    const at = landing(e.clientX)
    setDrop(null)
    if (!payload || !at || !p.canDrop(payload)) return
    e.preventDefault()
    endDrag()
    const own = payload.kind === p.dragKind && payload.ids.length === 1 && p.tabs.some((t) => t.id === payload.ids[0])
    if (own) p.onMove(payload.ids[0], at.index)
    else p.onDrop(payload, at.index)
  }

  return (
    <div className={`kit-tabstrip${p.focused ? ' is-focused' : ''}`}>
      <div
        ref={scroll}
        className="kit-tabs-scroll"
        role="tablist"
        aria-label={p.group}
        onDragOver={dragOver}
        onDragLeave={(e) => {
          // Decided by the pointer, as Safari gives no relatedTarget.
          const r = e.currentTarget.getBoundingClientRect()
          if (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom) setDrop(null)
        }}
        onDrop={dropped}
      >
        {p.tabs.map((t, i) => (
          <div
            key={t.id}
            role="tab"
            data-tab={t.id}
            aria-selected={t.id === p.active}
            tabIndex={t.id === rovingId ? 0 : -1}
            aria-label={t.dirty ? `${t.title}, unsaved` : t.title}
            title={t.tooltip}
            className={`kit-tab${t.id === p.active ? ' is-active' : ''}${t.dirty ? ' is-dirty' : ''}`}
            draggable
            onFocus={() => (lastFocus.current = { id: t.id, index: i })}
            onBlur={(e) => e.currentTarget.isConnected && (lastFocus.current = null)}
            onClick={() => !hold.fired && p.onActivate(t.id)}
            onPointerDown={(e) => {
              pressed.current = t.id
              hold.down(e)
            }}
            onPointerMove={hold.move}
            onPointerUp={hold.end}
            onPointerCancel={hold.cancel}
            onAuxClick={(e) => aux(e, t.id)}
            onMouseDown={(e) => e.button === 1 && e.preventDefault()}
            onContextMenu={(e) => {
              e.preventDefault()
              p.onContextMenu(t.id, { x: e.clientX, y: e.clientY })
            }}
            onKeyDown={(e) => e.target === e.currentTarget && keyDown(e, t.id, i)}
            onDragStart={(e) => {
              if (hold.fired) e.preventDefault()
              else startDrag(e.dataTransfer, { kind: p.dragKind, ids: [t.id] }, t.title, e.currentTarget)
            }}
            onDragEnd={() => {
              endDrag()
              setDrop(null)
            }}
          >
            {t.icon && <span className="kit-tab-icon">{t.icon}</span>}
            <span className="kit-tab-title">{t.title}</span>
            {t.description && <span className="kit-tab-desc">{t.description}</span>}
            <button
              type="button"
              className="kit-tab-close"
              tabIndex={-1}
              aria-hidden="true"
              title={`Close ${t.title}`}
              draggable={false}
              onClick={(e) => {
                e.stopPropagation()
                p.onClose(t.id)
              }}
            >
              <span className="kit-tab-dot" />
              <Cross />
            </button>
          </div>
        ))}
        {drop && <span className="kit-tab-drop" style={{ left: drop.x }} />}
      </div>
      {p.actions && <div className="kit-tabs-actions">{p.actions}</div>}
    </div>
  )
}
