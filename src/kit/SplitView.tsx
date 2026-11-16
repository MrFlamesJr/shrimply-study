import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { edgeZone, readDrag, type DragPayload } from './dnd'
import type { GroupId, Node as Tree } from './layout'
import './split.css'

type Min = { width: number; height: number }
type Props = {
  root: Tree
  renderGroup(id: GroupId): ReactNode
  onResize(path: number[], sizes: number[]): void
  minSize?: Min
}

const GAP = 4
const KEY_STEP = 0.02

/** One window's node tree. */
export function SplitView(p: Props) {
  return <Branch node={p.root} path={[]} render={p.renderGroup} onResize={p.onResize} min={p.minSize ?? { width: 320, height: 240 }} />
}

type BranchProps = { node: Tree; path: number[]; render(id: GroupId): ReactNode; onResize(path: number[], sizes: number[]): void; min: Min }

function Branch({ node, path, render, onResize, min }: BranchProps) {
  if (node.kind === 'group') return <>{render(node.id)}</>
  return <Split node={node} path={path} render={render} onResize={onResize} min={min} />
}

function Split({ node, path, render, onResize, min }: BranchProps & { node: Extract<Tree, { kind: 'split' }> }) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<{ win: Window; id: number } | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const row = node.dir === 'row'
  const minPx = row ? min.width : min.height

  useEffect(() => () => {
    if (frame.current) frame.current.win.cancelAnimationFrame(frame.current.id)
  }, [])

  // The room the panes share, without the sashes.
  const room = () => {
    const r = box.current!.getBoundingClientRect()
    return Math.max(1, (row ? r.width : r.height) - GAP * (node.children.length - 1))
  }

  // Sizes with pane i set to `first`, its neighbour taking the rest, both kept above the minimum where they can be.
  const shifted = (sizes: number[], i: number, first: number) => {
    const sum = sizes[i] + sizes[i + 1]
    const lo = Math.min(minPx / room(), sum / 2)
    const a = Math.min(Math.max(first, lo), sum - lo)
    return sizes.map((s, k) => (k === i ? a : k === i + 1 ? sum - a : s))
  }

  const down = (e: PointerEvent<HTMLElement>, i: number) => {
    if (e.button !== 0) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setDragging(i)
    const start = row ? e.clientX : e.clientY
    const sizes = node.sizes.slice()
    const total = room()
    const win = el.ownerDocument.defaultView!
    let next = sizes
    const move = (m: globalThis.PointerEvent) => {
      next = shifted(sizes, i, sizes[i] + ((row ? m.clientX : m.clientY) - start) / total)
      if (!frame.current) {
        frame.current = {
          win,
          id: win.requestAnimationFrame(() => {
            frame.current = null
            onResize(path, next)
          }),
        }
      }
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      setDragging(null)
      if (frame.current) {
        win.cancelAnimationFrame(frame.current.id)
        frame.current = null
      }
      onResize(path, next)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const key = (e: KeyboardEvent, i: number) => {
    const back = row ? 'ArrowLeft' : 'ArrowUp'
    const fwd = row ? 'ArrowRight' : 'ArrowDown'
    if (e.key !== back && e.key !== fwd) return
    e.preventDefault()
    onResize(path, shifted(node.sizes, i, node.sizes[i] + (e.key === fwd ? KEY_STEP : -KEY_STEP)))
  }

  return (
    <div ref={box} className={`kit-split ${row ? 'is-row' : 'is-column'}`}>
      {node.children.map((c, i) => (
        <Fragment key={c.kind === 'group' ? c.id : `split-${i}`}>
          <div className="kit-leaf" style={{ flex: `${node.sizes[i]} 1 0` }}>
            <Branch node={c} path={[...path, i]} render={render} onResize={onResize} min={min} />
          </div>
          {i < node.children.length - 1 && (
            <div
              role="separator"
              tabIndex={0}
              aria-orientation={row ? 'vertical' : 'horizontal'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(node.sizes[i] * 100)}
              className={`kit-sash${dragging === i ? ' is-dragging' : ''}`}
              onPointerDown={(e) => down(e, i)}
              onKeyDown={(e) => key(e, i)}
              onDoubleClick={() => onResize(path, node.sizes.map(() => 1 / node.sizes.length))}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}

type Zone = 'left' | 'right' | 'top' | 'bottom' | 'center'

/** Overlay on a group (its parent element) while an accepted drag is over it. */
export function DropZones(p: { accept(payload: DragPayload): boolean; onDrop(payload: DragPayload, zone: Zone): void }) {
  const mark = useRef<HTMLDivElement>(null)
  const latest = useRef(p)
  latest.current = p
  const [zone, setZone] = useState<Zone | null>(null)

  useEffect(() => {
    const host = mark.current?.parentElement
    if (!host) return
    // Tabs have their own drop line: leave the strip to itself.
    const onStrip = (t: EventTarget | null) => {
      const el = t as Element | null
      return !!el && el.nodeType === 1 && !!el.closest('[role="tablist"]')
    }
    const where = (e: DragEvent): Zone | null => {
      const payload = readDrag(e.dataTransfer)
      if (!payload || !latest.current.accept(payload) || onStrip(e.target)) return null
      return edgeZone(host.getBoundingClientRect(), e.clientX, e.clientY)
    }
    const over = (e: DragEvent) => {
      const z = where(e)
      setZone(z)
      if (z) {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      }
    }
    const leave = (e: DragEvent) => {
      const to = e.relatedTarget as Node | null
      if (!to || !host.contains(to)) setZone(null)
    }
    const drop = (e: DragEvent) => {
      const z = where(e)
      const payload = readDrag(e.dataTransfer)
      setZone(null)
      if (z && payload) {
        e.preventDefault()
        latest.current.onDrop(payload, z)
      }
    }
    const end = () => setZone(null)
    host.addEventListener('dragenter', over)
    host.addEventListener('dragover', over)
    host.addEventListener('dragleave', leave)
    host.addEventListener('drop', drop)
    host.ownerDocument.addEventListener('dragend', end)
    return () => {
      host.removeEventListener('dragenter', over)
      host.removeEventListener('dragover', over)
      host.removeEventListener('dragleave', leave)
      host.removeEventListener('drop', drop)
      host.ownerDocument.removeEventListener('dragend', end)
    }
  }, [])

  return (
    <div ref={mark} className="kit-dropzones" aria-hidden="true">
      {zone && <div className={`kit-dropzone is-${zone}`} />}
    </div>
  )
}
