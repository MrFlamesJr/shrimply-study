import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AutoScrollActivator,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
  type Over,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CardSortable } from '../../components/EditCard'

// The cards' boxes by id (to copy the lifted one), and the drop zones of whole sections by their id (to tint one).
const nodes = new Map<string, HTMLElement>()
const zones = new Map<string, HTMLElement>()

// The pane's scroller scrolls while a card is dragged, never the window itself.
const paneOnly = (el: Element) => el !== el.ownerDocument.scrollingElement

// How far the pointer moves (px) before a card at the pane's edge may scroll it: grabbing alone never scrolls.
const SCROLL_AFTER = 24

// The section a sortable list holds: a group's id, or this one for the cards in no group.
const UNGROUPED = 'ungrouped'
const sectionOf = (id: string | number | undefined) => (id === undefined || id === UNGROUPED ? null : String(id))

// What the pointer is in (a card of any section, or a section's drop zone), else the closest card (the keyboard).
const collide: CollisionDetection = (args) => {
  const hit = pointerWithin(args)
  return hit.length ? hit : closestCenter(args)
}

/** Where to the card moves into another section: `group` (null: none), before or after card `near`, or at its end. */
export type Into = { group: string | null; near?: string; after?: boolean }

/**
 * What the dragged card is over: a card of its own section (dnd-kit's sorting makes way), another section's card or an
 * empty section's Add box (the card moves in there while dragged, so that section makes way), or a collapsed group's
 * head (it joins that group on the drop).
 */
type Target = { kind: 'same'; to: string } | { kind: 'into'; into: Into } | { kind: 'head'; group: string }
function targetOf(active: Active, over: Over | null): Target | null {
  if (!over || over.id === active.id) return null
  const from = sectionOf(active.data.current?.sortable?.containerId)
  const zone = over.data.current?.zone as { group: string | null; part: 'head' | 'add' } | undefined
  if (zone?.part === 'head' && zone.group !== null) return zone.group === from ? null : { kind: 'head', group: zone.group }
  if (zone) return zone.group === from ? null : { kind: 'into', into: { group: zone.group } }
  const into = sectionOf(over.data.current?.sortable?.containerId)
  if (into === from) return { kind: 'same', to: String(over.id) }
  // Into another section: before the card it is over, or after it once the dragged card's middle is past that card's.
  const r = active.rect.current.translated
  const after = !!r && r.top + r.height / 2 > over.rect.top + over.rect.height / 2
  return { kind: 'into', into: { group: into, near: String(over.id), after } }
}

// A collapsed group's head the card would join is tinted, at once.
let marked: HTMLElement | null = null
function mark(el: HTMLElement | undefined) {
  if (marked && marked !== el) delete marked.dataset.drop
  marked = el ?? null
  if (el) el.dataset.drop = 'inside'
}

/**
 * The dragged card as it looks, lifted over the page while its own place stays in the list (dnd-kit's DragOverlay):
 * a still copy of its box, with what its fields hold, that takes no clicks.
 */
function Lifted({ id }: { id: string }) {
  const fill = useCallback(
    (box: HTMLDivElement | null) => {
      const card = nodes.get(id)
      if (!box || !card) return
      const copy = card.cloneNode(true) as HTMLElement
      copy.classList.remove('is-dragging')
      copy.classList.add('is-lifted')
      copy.removeAttribute('style')
      copy.querySelectorAll('[popover]').forEach((el) => el.remove())
      // Nothing in the copy may be found or act as the card: no ids, no data the editor looks cards up by, and no radio
      // names (a checked radio of the same name would uncheck the card's own).
      for (const el of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
        for (const name of ['id', 'name', 'data-card', 'data-field', 'data-group-name']) el.removeAttribute(name)
      }
      const from = card.querySelectorAll<HTMLTextAreaElement>('textarea')
      copy.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((el, i) => (el.value = from[i]?.value ?? ''))
      copy.inert = true
      box.replaceChildren(copy)
    },
    [id],
  )
  return <div ref={fill} aria-hidden="true" />
}

// The theme's own timing for the lifted card settling into its place; none under reduced motion.
function settle(doc: Document) {
  if (doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  const ms = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--dur-slide')) || 0
  return { duration: ms, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
}

// What a screen reader hears while a card is moved: the card's number, as the editor shows it, or the section's end.
const number = (item: Active | Over) => item.data.current?.number
const place = (over: Over) => (over.data.current?.zone ? "a section's end" : `card ${number(over)}`)
const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up card ${number(active)}.`,
  onDragOver: ({ active, over }) => (over ? `Card ${number(active)} is over ${place(over)}.` : undefined),
  onDragEnd: ({ active, over }) => (over ? `Card ${number(active)} dropped at ${place(over)}.` : undefined),
  onDragCancel: ({ active }) => `Card ${number(active)} put back.`,
}

// Constants, not new objects on each render: DndContext hands its props on to every card, which would then render again.
const autoScroll = { activator: AutoScrollActivator.DraggableRect, canScroll: paneOnly }
const noScroll = { enabled: false }
const accessibility = { announcements }
const keyboardOptions = { coordinateGetter: sortableKeyboardCoordinates }

// Up and down only, and never out of the editor's cards (asked for: dragged far past them was wrong): the lifted card
// stays inside their box, `.pairs`, measured live as the pane scrolls. Exact to the px: from the lifted copy as it
// shows now, less the move it shows with (dnd-kit's own rects can be measured mid-move or before the copy settles).
const inCards: Modifier = ({ transform, active }) => {
  const card = active ? nodes.get(String(active.id)) : undefined
  const box = card?.closest('.pairs')?.getBoundingClientRect()
  const lift = card?.ownerDocument.querySelector<HTMLElement>('.pair-lift')
  const view = card?.ownerDocument.defaultView
  if (!box || !lift || !view) return { ...transform, x: 0 }
  const now = lift.getBoundingClientRect()
  const top = now.top - new view.DOMMatrixReadOnly(view.getComputedStyle(lift).transform).m42
  return { ...transform, x: 0, y: Math.min(Math.max(transform.y, box.top - top), box.bottom - top - now.height) }
}
const upDown: Modifier[] = [inCards]
// A press on the card's head starts a drag only once the pointer moved a little, so its buttons and fields still click.
const pointerOptions = { activationConstraint: { distance: 4 } }

type ListProps = {
  /** While dragged over another section (a card there, or an empty section's Add box), the card moves in there for now. */
  onPreview: (id: string, into: Into) => void
  /** The drop: the card takes the place of card `to` in its section as it now is, or joins a collapsed `group` at its end. */
  onDrop: (id: string, at: { to?: string; group?: string }) => void
  /** Put back: the card goes back to where it was. */
  onCancel: () => void
  children: ReactNode
}

/**
 * The editor's cards, dragged by their head or grip (dnd-kit; Space on the grip and the arrow keys by keyboard). The
 * card lifts over the page and its place moves with it (asked for: smooth, the cards really moving): its own section's
 * cards make way, and over another section (in or out of a group) it moves in there at once, that section's cards
 * making way; on a collapsed group's head (tinted) it joins that group on the drop.
 */
export function CardSortables({ onPreview, onDrop, onCancel, children }: ListProps) {
  const sensors = useSensors(useSensor(PointerSensor, pointerOptions), useSensor(KeyboardSensor, keyboardOptions))
  const [scrolls, setScrolls] = useState(false)
  const [lifted, setLifted] = useState<string | null>(null)
  // Just moved into another section: wait for the cards to settle there before deciding again, so it never flips back.
  const settling = useRef(false)
  const start = ({ active }: DragStartEvent) => setLifted(String(active.id))
  const move = ({ delta }: DragMoveEvent) => {
    if (Math.abs(delta.y) > SCROLL_AFTER) setScrolls(true)
  }
  const over = ({ active, over }: DragOverEvent) => {
    const t = targetOf(active, over)
    mark(t?.kind === 'head' ? zones.get(String(over?.id)) : undefined)
    if (t?.kind !== 'into' || settling.current) return
    settling.current = true
    onPreview(String(active.id), t.into)
    requestAnimationFrame(() => requestAnimationFrame(() => (settling.current = false)))
  }
  const end = () => {
    mark(undefined)
    setScrolls(false)
    setLifted(null)
  }
  const drop = ({ active, over }: DragEndEvent) => {
    const t = targetOf(active, over)
    end()
    onDrop(String(active.id), t?.kind === 'same' ? { to: t.to } : t?.kind === 'head' ? { group: t.group } : {})
  }
  const cancel = () => {
    end()
    onCancel()
  }
  const doc = lifted ? nodes.get(lifted)?.ownerDocument : undefined
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      modifiers={upDown}
      autoScroll={scrolls ? autoScroll : noScroll}
      onDragStart={start}
      onDragMove={move}
      onDragOver={over}
      onDragEnd={drop}
      onDragCancel={cancel}
      accessibility={accessibility}
    >
      {children}
      {/* In the card's own document's body: the pane may be moved by a transform, which would shift a fixed box. */}
      {doc &&
        createPortal(
          <DragOverlay modifiers={upDown} dropAnimation={settle(doc)} className="pair-lift">
            {lifted && <Lifted id={lifted} />}
          </DragOverlay>,
          doc.body,
        )}
    </DndContext>
  )
}

/** One section's cards as a sortable list: a group's (`group`), or those in no group (null). */
export function SectionSortable({ group, ids, children }: { group: string | null; ids: string[]; children: ReactNode }) {
  // The same array while the ids are the same: a new one tells every card in the list to render again, on each keystroke.
  const kept = useRef(ids)
  if (kept.current.length !== ids.length || kept.current.some((id, i) => id !== ids[i])) kept.current = ids
  return (
    <SortableContext id={group ?? UNGROUPED} items={kept.current} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
  )
}

/**
 * A whole section as a place to drop a card (a collapsed group's head, an empty section's Add box; `part` keeps their
 * ids apart): the ref for its element while `enabled`. A card dropped there goes to the section's end.
 */
export function useSectionDrop(group: string | null, enabled: boolean, part: 'head' | 'add') {
  const id = `zone:${group ?? UNGROUPED}:${part}`
  const { setNodeRef } = useDroppable({ id, disabled: !enabled, data: { zone: { group, part } } })
  return useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node)
      if (node) zones.set(id, node)
      else zones.delete(id)
    },
    [id, setNodeRef],
  )
}

/** Gives a card its place in the sortable list: the hold `EditCard` takes. */
export function useSortableCard(id: string, n: number): CardSortable {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, data: { number: n } })
  const ref = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node)
      if (node) nodes.set(id, node)
      else nodes.delete(id)
    },
    [id, setNodeRef],
  )
  return {
    setNodeRef: ref,
    setActivatorNodeRef,
    attributes,
    listeners,
    isDragging,
    style: {
      transform: CSS.Translate.toString(transform),
      // The cards making way take the theme's timing; dnd-kit's 0ms transition (setting up a move) stays.
      transition: transition && !transition.includes(' 0ms') ? 'transform var(--dur) var(--ease)' : transition,
    },
  }
}
