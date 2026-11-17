import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AutoScrollActivator,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
  type Over,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CardSortable } from '../../components/EditCard'

// The cards' boxes by id, to measure a section when a drag starts.
const nodes = new Map<string, HTMLElement>()

// The pane's scroller scrolls while a card is dragged, never the window itself.
const paneOnly = (el: Element) => el !== el.ownerDocument.scrollingElement

// How far the node's scrolling ancestors are scrolled in all: dnd-kit's modifiers see the pointer's move without it.
const scrolledBy = (node: HTMLElement | undefined) => {
  let total = 0
  for (let el = node?.parentElement; el; el = el.parentElement) total += el.scrollTop
  return total
}

// How far the pointer moves (px) before a card at the pane's edge may scroll it: grabbing alone never scrolls.
const SCROLL_AFTER = 24

// A card only competes for the places of its own section's cards: the gap drawn and the drop are the same card.
const inSection: CollisionDetection = (args) => {
  const section = args.active.data.current?.sortable?.containerId
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.sortable?.containerId === section) })
}

// What a screen reader hears while a card is moved: the card's number, as the editor shows it.
const number = (item: Active | Over) => item.data.current?.number
const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up card ${number(active)}.`,
  onDragOver: ({ active, over }) => (over ? `Card ${number(active)} is over card ${number(over)}.` : undefined),
  onDragEnd: ({ active, over }) => (over ? `Card ${number(active)} dropped at the place of card ${number(over)}.` : undefined),
  onDragCancel: ({ active }) => `Card ${number(active)} put back.`,
}

// Constants, not new objects on each render: DndContext hands its props on to every card, which would then render again.
const autoScroll = { activator: AutoScrollActivator.DraggableRect, canScroll: paneOnly }
const noScroll = { enabled: false }
const accessibility = { announcements }
const keyboardOptions = { coordinateGetter: sortableKeyboardCoordinates }

type ListProps = {
  /** A card was dropped on another (`to`); the screen moves it only when both are in one section. */
  onMove: (id: string, to: string) => void
  children: ReactNode
}

/**
 * The editor's cards, dragged into order by their grip (dnd-kit; Space on the grip and the arrow keys by keyboard).
 * One sortable list per section, so a card makes way only for its own section's cards.
 */
export function CardSortables({ onMove, children }: ListProps) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, keyboardOptions))
  // Up and down only, and no further than the middle of the section's first or last card (middle on middle, so a tall
  // card still gets past a short one): measured when the drag starts, as the cards' own boxes then sit still.
  const room = useRef<{ up: number; down: number; scrolled: number } | null>(null)
  const modifiers = useMemo<Modifier[]>(
    () => [
      ({ transform, active }) => {
        const r = room.current
        if (!r || !active) return { ...transform, x: 0 }
        // The card sits where the pointer put it plus what the pane has scrolled since: that sum is what is held to the section.
        const scrolled = scrolledBy(nodes.get(String(active.id))) - r.scrolled
        return { ...transform, x: 0, y: Math.min(Math.max(transform.y + scrolled, -r.up), r.down) - scrolled }
      },
    ],
    [],
  )
  const [scrolls, setScrolls] = useState(false)
  const start = ({ active }: DragStartEvent) => {
    const ids: string[] = active.data.current?.sortable?.items ?? []
    const mine = nodes.get(String(active.id))
    const first = nodes.get(ids[0])
    const last = nodes.get(ids[ids.length - 1])
    if (!mine || !first || !last) return
    const middle = (el: HTMLElement) => el.getBoundingClientRect().top + el.offsetHeight / 2
    room.current = { up: middle(mine) - middle(first), down: middle(last) - middle(mine), scrolled: scrolledBy(mine) }
  }
  const move = ({ delta }: DragMoveEvent) => {
    if (Math.abs(delta.y) > SCROLL_AFTER) setScrolls(true)
  }
  const end = () => {
    room.current = null
    setScrolls(false)
  }
  const drop = ({ active, over }: DragEndEvent) => {
    end()
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id))
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={inSection}
      modifiers={modifiers}
      autoScroll={scrolls ? autoScroll : noScroll}
      onDragStart={start}
      onDragMove={move}
      onDragEnd={drop}
      onDragCancel={end}
      accessibility={accessibility}
    >
      {children}
    </DndContext>
  )
}

/** One section's cards as a sortable list. */
export function SectionSortable({ ids, children }: { ids: string[]; children: ReactNode }) {
  // The same array while the ids are the same: a new one tells every card in the list to render again, on each keystroke.
  const kept = useRef(ids)
  if (kept.current.length !== ids.length || kept.current.some((id, i) => id !== ids[i])) kept.current = ids
  return (
    <SortableContext items={kept.current} strategy={verticalListSortingStrategy}>
      {children}
    </SortableContext>
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
