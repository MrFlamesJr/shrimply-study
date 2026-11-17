import { useRef, type ReactNode } from 'react'
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
  type DragEndEvent,
  type Modifier,
  type Over,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CardSortable } from '../../components/EditCard'

// Cards only move up and down.
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 })

// What a screen reader hears while a card is moved: the card's number, as the editor shows it.
const number = (item: Active | Over) => item.data.current?.number
const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up card ${number(active)}.`,
  onDragOver: ({ active, over }) => (over ? `Card ${number(active)} is over card ${number(over)}.` : undefined),
  onDragEnd: ({ active, over }) => (over ? `Card ${number(active)} dropped at the place of card ${number(over)}.` : undefined),
  onDragCancel: ({ active }) => `Card ${number(active)} put back.`,
}

// Constants, not new objects on each render: DndContext hands its props on to every card, which would then render again.
const modifiers = [vertical]
const autoScroll = { activator: AutoScrollActivator.DraggableRect }
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
  const drop = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id))
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={modifiers}
      autoScroll={autoScroll}
      onDragEnd={drop}
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
  return {
    setNodeRef,
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
