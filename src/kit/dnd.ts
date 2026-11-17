import { isEditable } from './shortcuts'

export const DRAG_MIME = 'application/x-kit-drag+json'
export type DragPayload = { kind: string; ids: string[] }

// The drag in progress: the drag may end in another of the app's windows (same JavaScript), so this copy is read first.
let current: DragPayload | null = null

/**
 * Starts a drag: the payload as JSON and the text for other apps; effectAllowed copyMove. `source` (the dragged element)
 * names the document whose dragend or drop forgets the payload, even when the source unmounted before its own dragend.
 */
export function startDrag(dt: DataTransfer, payload: DragPayload, text: string, source?: Node): void {
  dt.setData(DRAG_MIME, JSON.stringify(payload))
  dt.setData('text/plain', text)
  dt.effectAllowed = 'copyMove'
  current = payload
  const doc = source?.ownerDocument ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return
  const forget = () => {
    doc.removeEventListener('dragend', forget, true)
    doc.removeEventListener('drop', forget, true)
    if (current === payload) endDrag()
  }
  doc.addEventListener('dragend', forget, true)
  doc.addEventListener('drop', forget, true)
}

/** The drag in progress: this module's copy, else the payload in the DataTransfer when the browser lets it be read. */
export function readDrag(dt: DataTransfer | null): DragPayload | null {
  if (current) return current
  const text = dt?.getData(DRAG_MIME)
  if (!text) return null
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null // something else's drag
  }
  const p = data as Partial<DragPayload> | null
  return p && typeof p.kind === 'string' && Array.isArray(p.ids) ? { kind: p.kind, ids: p.ids.map(String) } : null
}

/** Forgets the drag (on dragend). */
export function endDrag(): void {
  current = null
}

/** Copy with Ctrl (Alt/Option on a Mac), else move. */
export function effectFor(mods: { ctrlKey: boolean; altKey: boolean; metaKey: boolean }, mac: boolean): 'move' | 'copy' {
  return (mac ? mods.altKey : mods.ctrlKey) ? 'copy' : 'move'
}

/** Where on a row `y` falls: with `inside`, the top quarter is before, the bottom quarter after, the middle inside; else halves. */
export function dropPosition(top: number, height: number, y: number, inside: boolean): 'before' | 'inside' | 'after' {
  const f = (y - top) / height
  if (!inside) return f < 0.5 ? 'before' : 'after'
  return f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'inside'
}

/** The outer quarter of a side the point is in (the nearest side in a corner), else center. */
export function edgeZone(rect: { left: number; top: number; width: number; height: number }, x: number, y: number):
  'left' | 'right' | 'top' | 'bottom' | 'center' {
  const fx = (x - rect.left) / rect.width
  const fy = (y - rect.top) / rect.height
  const near: ['left' | 'right' | 'top' | 'bottom', number][] = [['left', fx], ['right', 1 - fx], ['top', fy], ['bottom', 1 - fy]]
  const best = near.reduce((a, b) => (b[1] < a[1] ? b : a))
  return best[1] < 0.25 ? best[0] : 'center'
}

const has = (dt: DataTransfer | null, type: string) => !!dt && Array.from(dt.types).includes(type)

/**
 * The browser's own drag and drop, held back in one document (call it for each window the app draws into, popups too):
 * - a link or an image can not be dragged away (a `dragstart` on `a[href]` or `img` outside a `[draggable="true"]` source
 *   is cancelled), so a drop can not navigate the page;
 * - our own payload is never dropped into a text field (it would insert its `text/plain` label): refused there;
 * - a file from the computer or a dragged link from elsewhere that no target took (no `preventDefault`) is refused too,
 *   where the browser would open it in place of the app. A target that takes files (an image slot) says so by calling
 *   `preventDefault` on `dragover`, and keeps working.
 * Returns the function that takes the guards off again.
 */
export function guardNativeDrags(doc: Document): () => void {
  const start = (e: DragEvent) => {
    const el = e.target as Element | null
    if (el && el.nodeType === 1 && el.closest('a[href], img') && !el.closest('[draggable="true"]')) e.preventDefault()
  }
  const ours = (e: DragEvent) => has(e.dataTransfer, DRAG_MIME)
  const refuse = (e: DragEvent) => {
    if (!ours(e) || !isEditable(e.target)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
  }
  const foreign = (e: DragEvent) => has(e.dataTransfer, 'Files') || has(e.dataTransfer, 'text/uri-list')
  const over = (e: DragEvent) => {
    if (e.defaultPrevented || ours(e) || !foreign(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
  }
  const drop = (e: DragEvent) => {
    if (!ours(e) && foreign(e)) e.preventDefault()
  }
  doc.addEventListener('dragstart', start, true)
  doc.addEventListener('dragover', refuse, true)
  doc.addEventListener('drop', refuse, true)
  doc.addEventListener('dragover', over)
  doc.addEventListener('drop', drop)
  return () => {
    doc.removeEventListener('dragstart', start, true)
    doc.removeEventListener('dragover', refuse, true)
    doc.removeEventListener('drop', refuse, true)
    doc.removeEventListener('dragover', over)
    doc.removeEventListener('drop', drop)
  }
}

if (typeof document !== 'undefined') guardNativeDrags(document)
