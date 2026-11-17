import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { dropPosition, effectFor, endDrag, readDrag, startDrag } from './dnd'
import type { DragPayload } from './dnd'
import { ordered, select, selectAll } from './selection'
import type { Selection } from './selection'
import { isEditable, isMac } from './shortcuts'
import { createLongPress } from './longPress'
import { flatten, keyNav, typeahead } from './tree'
import type { Row, TreeSource } from './tree'
import './tree.css'

export type DropRule = { ok: true } | { ok: false; reason: string }
type Pos = 'before' | 'inside' | 'after'
type Effect = 'move' | 'copy'

const INDENT = 16
const OVERSCAN = 8
const EXPAND_DELAY = 600
const EDGE = 28

type Drag = {
  kind(ids: string[]): string | null
  /** Whether a drag of this payload is the tree's business at all (default: all). When not, the tree ignores it entirely: no `preventDefault`, no drop effect, no highlight, no label. */
  accepts?(payload: DragPayload): boolean
  rule(payload: DragPayload, target: string | null, pos: Pos, effect: Effect): DropRule
  allowInside(target: string): boolean
  onDrop(payload: DragPayload, target: string | null, pos: Pos, effect: Effect): void
  label(payload: DragPayload, effect: Effect): string
}
type Rename = { id: string | null; commit(id: string, name: string): void; cancel(): void; check?(id: string, name: string): string | null }

type Over = { target: string | null; pos: Pos; effect: Effect; ok: boolean; text: string }

export function TreeView(p: {
  label: string; source: TreeSource; rowHeight: number
  expanded: ReadonlySet<string>; onExpanded(next: Set<string>): void
  selection: Selection; onSelection(next: Selection): void
  filter?: string
  icon?(id: string): ReactNode; description?(id: string): ReactNode; dimmed?(id: string): boolean
  onActivate(id: string): void
  onContextMenu(target: string | null, at: { x: number; y: number }): void
  onKeyDown?(e: KeyboardEvent, focus: string | null): boolean
  drag?: Drag
  rename?: Rename
  empty?: ReactNode
}): ReactNode {
  const { source, rowHeight: h, expanded, selection, drag } = p
  const box = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const [over, setOver] = useState<Over | null>(null)
  const wantFocus = useRef(false)
  const typed = useRef({ text: '', at: 0 })
  const expandTimer = useRef<{ id: string; timer: number } | null>(null)

  const rows = useMemo(() => flatten(source, expanded, p.filter), [source, expanded, p.filter])
  const order = useMemo(() => rows.map((r) => r.id), [rows])
  const indexOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order])
  const focusId = selection.focus !== null && indexOf.has(selection.focus) ? selection.focus : (order[0] ?? null)
  const selected = useMemo(() => new Set(selection.ids), [selection.ids])

  useLayoutEffect(() => {
    const el = box.current!
    const view = el.ownerDocument.defaultView!
    setHeight(el.clientHeight)
    const ro = new view.ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => () => {
    if (expandTimer.current) box.current?.ownerDocument.defaultView?.clearTimeout(expandTimer.current.timer)
  }, [])

  // Keeps the focused row in view, then gives it the DOM focus when the keyboard moved it.
  useEffect(() => {
    const el = box.current!
    if (focusId === null || !wantFocus.current) return
    const i = indexOf.get(focusId)!
    if (i * h < el.scrollTop) el.scrollTop = i * h
    else if ((i + 1) * h > el.scrollTop + el.clientHeight) el.scrollTop = (i + 1) * h - el.clientHeight
    const node = rowEl(focusId)
    if (node) {
      node.focus({ preventScroll: true })
      wantFocus.current = false
    }
  })

  const rowEl = (id: string) =>
    (Array.from(body.current!.children) as HTMLElement[]).find((n) => n.dataset.id === id) ?? null
  const rowAt = (clientY: number): { row: Row | null; top: number } => {
    const top = body.current!.getBoundingClientRect().top
    const i = Math.floor((clientY - top) / h)
    return { row: i >= 0 && i < rows.length ? rows[i] : null, top: top + i * h }
  }
  const view = () => box.current!.ownerDocument.defaultView!

  const clearOver = () => {
    setOver(null)
    if (expandTimer.current) view().clearTimeout(expandTimer.current.timer)
    expandTimer.current = null
  }

  const toggleExpand = (id: string, open: boolean) => {
    const next = new Set(expanded)
    if (open) next.add(id)
    else next.delete(id)
    p.onExpanded(next)
  }

  const focusOnly = (id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    wantFocus.current = true
    if (e.shiftKey) p.onSelection(select(selection, id, { shift: true, ctrl: e.ctrlKey || e.metaKey }, order))
    else if (e.ctrlKey || e.metaKey) p.onSelection({ ...selection, focus: id })
    else p.onSelection({ ids: [id], anchor: id, focus: id })
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (p.onKeyDown?.(e.nativeEvent, focusId)) return
    if ((e.target as Element).nodeName === 'INPUT') return
    const mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
    if (e.key === 'a' && mods.ctrl && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      p.onSelection(selectAll(order))
      return
    }
    if (e.key === ' ' && focusId !== null) {
      e.preventDefault()
      p.onSelection(select(selection, focusId, { ctrl: true }, order))
      return
    }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (focusId === null) return
      e.preventDefault()
      const node = rowEl(focusId)
      const r = node?.getBoundingClientRect()
      if (!selected.has(focusId)) p.onSelection({ ids: [focusId], anchor: focusId, focus: focusId })
      p.onContextMenu(focusId, { x: (r?.left ?? 0) + 24, y: r?.bottom ?? 0 })
      return
    }
    if (e.altKey) return
    const nav = keyNav(rows, focusId, e.key, Math.max(1, Math.floor(height / h) - 1))
    if (nav) {
      e.preventDefault()
      if (nav.focus !== undefined) focusOnly(nav.focus, e)
      if (nav.expand) toggleExpand(nav.expand, true)
      if (nav.collapse) toggleExpand(nav.collapse, false)
      if (nav.activate) p.onActivate(nav.activate)
      return
    }
    if (e.key.length === 1 && !mods.ctrl) {
      const t = typed.current
      const now = Date.now()
      t.text = now - t.at > 700 ? e.key : t.text + e.key
      t.at = now
      const hit = typeahead(rows, focusId, t.text, source.label)
      if (hit) {
        e.preventDefault()
        focusOnly(hit, { shiftKey: false, ctrlKey: false, metaKey: false })
      }
    }
  }

  const onClick = (e: ReactMouseEvent) => {
    if (hold.fired) return
    const t = e.target as Element
    if (t.closest('input')) return
    const { row } = rowAt(e.clientY)
    if (!row) return
    if (t.closest('[data-chevron]') && row.expandable) {
      toggleExpand(row.id, !row.expanded)
      return
    }
    p.onSelection(select(selection, row.id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }, order))
  }
  const onDoubleClick = (e: ReactMouseEvent) => {
    if (hold.fired) return
    const t = e.target as Element
    if (t.closest('input') || t.closest('[data-chevron]')) return
    const { row } = rowAt(e.clientY)
    if (row) p.onActivate(row.id)
  }
  const openMenuAt = (x: number, y: number) => {
    const { row } = rowAt(y)
    if (row && !selected.has(row.id)) p.onSelection({ ids: [row.id], anchor: row.id, focus: row.id })
    p.onContextMenu(row ? row.id : null, { x, y })
  }
  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault()
    openMenuAt(e.clientX, e.clientY)
  }
  // A long press is the touch version of a right click; the latest render's handler is the one that runs.
  const press = useRef(openMenuAt)
  press.current = openMenuAt
  const [hold] = useState(() => createLongPress((x, y) => press.current(x, y)))

  const dragIds = (id: string) => (selected.has(id) ? ordered(selection, order) : [id])
  const onDragStart = (e: ReactDragEvent) => {
    if (hold.fired) {
      e.preventDefault()
      return
    }
    const { row } = rowAt(e.clientY)
    const kind = row && drag ? drag.kind(dragIds(row.id)) : null
    if (!row || !drag || kind === null) {
      e.preventDefault()
      return
    }
    const ids = dragIds(row.id)
    startDrag(e.dataTransfer, { kind, ids }, ids.map(source.label).join(', '), e.currentTarget as Node)
  }

  const target = (e: ReactDragEvent, payload: DragPayload) => {
    const { row, top } = rowAt(e.clientY)
    const pos: Pos = row ? dropPosition(top, h, e.clientY, drag!.allowInside(row.id)) : 'after'
    const effect = effectFor(e, isMac(view().navigator.platform))
    const rule = drag!.rule(payload, row ? row.id : null, pos, effect)
    return { row, pos, effect, rule }
  }
  const onDragOver = (e: ReactDragEvent) => {
    if (!drag) return
    const payload = readDrag(e.dataTransfer)
    if (!payload || drag.accepts?.(payload) === false || isEditable(e.target)) return
    const { row, pos, effect, rule } = target(e, payload)
    const el = box.current!
    const r = el.getBoundingClientRect()
    if (e.clientY < r.top + EDGE) el.scrollTop -= 12
    else if (e.clientY > r.bottom - EDGE) el.scrollTop += 12
    e.preventDefault()
    e.dataTransfer.dropEffect = rule.ok ? effect : 'none'
    const next: Over = {
      target: row ? row.id : null, pos, effect, ok: rule.ok,
      text: rule.ok ? drag.label(payload, effect) : rule.reason,
    }
    if (!over || over.target !== next.target || over.pos !== next.pos || over.effect !== next.effect || over.text !== next.text) {
      setOver(next)
    }
    const timer = expandTimer.current
    if (!row || !row.expandable || row.expanded) {
      if (timer) view().clearTimeout(timer.timer)
      expandTimer.current = null
    } else if (!timer || timer.id !== row.id) {
      if (timer) view().clearTimeout(timer.timer)
      expandTimer.current = { id: row.id, timer: view().setTimeout(() => toggleExpand(row.id, true), EXPAND_DELAY) }
    }
  }
  const onDragLeave = (e: ReactDragEvent) => {
    // Safari sends no relatedTarget: then the pointer's place says whether it left.
    const to = e.relatedTarget as Node | null
    const r = box.current!.getBoundingClientRect()
    const outside = e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom
    if (to ? !box.current!.contains(to) : outside) clearOver()
  }
  const onDrop = (e: ReactDragEvent) => {
    if (!drag) return
    const payload = readDrag(e.dataTransfer)
    if (!payload || drag.accepts?.(payload) === false || isEditable(e.target)) return
    e.preventDefault()
    const { row, pos, effect, rule } = target(e, payload)
    clearOver()
    endDrag()
    if (rule.ok) drag.onDrop(payload, row ? row.id : null, pos, effect)
  }

  const first = Math.max(0, Math.floor(scrollTop / h) - OVERSCAN)
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / h) + OVERSCAN)
  const shown: number[] = []
  for (let i = first; i < last; i++) shown.push(i)
  const fi = focusId === null ? -1 : indexOf.get(focusId)!
  if (fi >= 0 && (fi < first || fi >= last)) shown.push(fi)

  const labelAt = over && (over.target === null ? rows.length : indexOf.get(over.target)!)

  return (
    <div
      ref={box}
      className={'kit-tree' + (over && over.target === null && over.ok ? ' is-drop-end' : '')}
      role="tree"
      aria-label={p.label}
      aria-multiselectable="true"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onPointerDown={hold.down}
      onPointerMove={hold.move}
      onPointerUp={hold.end}
      onPointerCancel={hold.cancel}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={() => { clearOver(); endDrag() }}
    >
      {rows.length === 0 && <div className="kit-tree-empty">{p.empty}</div>}
      <div ref={body} className="kit-tree-body" style={{ height: rows.length * h }}>
        {shown.map((i) => {
          const row = rows[i]
          const renaming = p.rename?.id === row.id
          const mine = over && over.target === row.id
          return (
            <div
              key={row.id}
              data-id={row.id}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-setsize={row.setSize}
              aria-posinset={row.posInSet}
              aria-expanded={row.expandable ? row.expanded : undefined}
              aria-selected={selected.has(row.id)}
              tabIndex={row.id === focusId ? 0 : -1}
              draggable={!!drag && !renaming}
              className={
                'kit-row' + (p.dimmed?.(row.id) ? ' is-dimmed' : '') +
                (mine && over.ok ? ` is-drop-${over.pos}` : '')
              }
              style={{ top: i * h, height: h, paddingLeft: row.depth * INDENT + 4 }}
            >
              <span
                className={'kit-row-glyph' + (row.expandable ? ' is-foldable' : '') + (row.expanded ? ' is-open' : '')}
                data-chevron={row.expandable ? '' : undefined}
                aria-hidden="true"
              >
                {p.icon?.(row.id)}
                {row.expandable && (
                  <span className="kit-row-chevron">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 3.5l4.5 4.5L6 12.5" />
                    </svg>
                  </span>
                )}
              </span>
              {renaming && p.rename ? (
                <RenameInput id={row.id} start={source.label(row.id)} rename={p.rename} onKey={() => { wantFocus.current = true }} />
              ) : (
                <>
                  <span className="kit-row-label">{labelOf(source.label(row.id), row.match)}</span>
                  {p.description?.(row.id) && <span className="kit-row-desc">{p.description(row.id)}</span>}
                </>
              )}
            </div>
          )
        })}
        {over && labelAt !== null && (
          <div
            className={'kit-tree-drop-label' + (over.ok ? '' : ' is-refused')}
            style={{ top: Math.min(labelAt, rows.length) * h + 2 }}
          >
            {over.text}
          </div>
        )}
      </div>
    </div>
  )
}

function labelOf(text: string, match: [number, number] | null): ReactNode {
  if (!match) return text
  return (
    <>
      {text.slice(0, match[0])}
      <mark>{text.slice(match[0], match[1])}</mark>
      {text.slice(match[1])}
    </>
  )
}

function RenameInput({ id, start, rename, onKey }: { id: string; start: string; rename: Rename; onKey(): void }) {
  const input = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const [text, setText] = useState(start)
  const error = rename.check?.(id, text) ?? null

  useEffect(() => {
    input.current!.focus()
    input.current!.select()
  }, [])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit && !error) rename.commit(id, text)
    else rename.cancel()
  }
  return (
    <>
      <input
        ref={input}
        className="kit-row-input"
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            if (!error) {
              onKey()
              finish(true)
            }
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onKey()
            finish(false)
          }
        }}
        onBlur={() => finish(true)}
      />
      {error && <div className="kit-row-error" role="alert">{error}</div>}
    </>
  )
}
