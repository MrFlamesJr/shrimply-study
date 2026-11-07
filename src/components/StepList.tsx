import { useState, type ReactNode } from 'react'
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
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconButton } from './IconButton'
import { GripIcon } from './Icons'

// Steps only move up and down, and no further than over the first or the last one (middle on middle, so a tall step
// still gets past a short one): run off the list, a step made the page longer, which then scrolled after it without
// end. `list` is the StepList's box, its tiles are its `.entry` children.
const inList =
  (list: HTMLElement | null): Modifier =>
  ({ transform, draggingNodeRect: tile, containerNodeRect: box }) => {
    const tiles = list?.querySelectorAll<HTMLElement>(':scope > .entry')
    if (!tile || !box || !tiles?.length) return { ...transform, x: 0 }
    const middle = tile.top + tile.height / 2
    const first = box.top + tiles[0].offsetHeight / 2
    const last = box.bottom - tiles[tiles.length - 1].offsetHeight / 2
    return { ...transform, x: 0, y: Math.min(Math.max(transform.y, first - middle), last - middle) }
  }

// What a screen reader hears while a step is moved (dnd-kit's own texts would read out the ids). The places are the
// ones dnd-kit saw while dragging, as the drop has already moved the step when the last one is said.
const at = (item: Active | Over) => (item.data.current?.sortable?.index ?? 0) + 1
const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up step ${at(active)}.`,
  onDragOver: ({ active, over }) => (over ? `Step ${at(active)} is over place ${at(over)}.` : undefined),
  onDragEnd: ({ active, over }) => (over ? `Step ${at(active)} dropped at place ${at(over)}.` : undefined),
  onDragCancel: ({ active }) => `Step ${at(active)} put back.`,
}

type ListProps = {
  /** One id per tile, in their order. */
  ids: string[]
  /** A tile was dropped at another place. */
  onMove: (from: number, to: number) => void
  /** The `StepTile`s, in the order of `ids`. */
  children: ReactNode
}

/**
 * A sequence's steps as tiles to drag into order (dnd-kit), the same in the editor (SequenceField) and when put in
 * order while studying (Arrange). By pointer, or with the keyboard: Space on a tile (or its grip) picks it up, the
 * arrow keys move it, Space drops it, Esc puts it back.
 */
export function StepList({ ids, onMove, children }: ListProps) {
  // State, not a ref: dnd-kit's screen reader texts go in here, as a modal dialog hides everything outside itself.
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const drop = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onMove(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }
  return (
    <div className="step-list" ref={setBox}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[inList(box)]}
        // The page scrolls while the dragged step nears the window's edge, not the pointer, so it stops once the
        // list's end is in view, where the step stops too.
        autoScroll={{ activator: AutoScrollActivator.DraggableRect }}
        onDragEnd={drop}
        accessibility={{ announcements, container: box ?? undefined }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </DndContext>
    </div>
  )
}

type TileProps = {
  id: string
  /** Its place, shown as "1.". */
  number: number
  /** Dragged from anywhere on it (it holds no field), not only by its grip. */
  whole?: boolean
  /** What it holds after its grip: a step's field, or its text. */
  children: ReactNode
}

/**
 * One step in a StepList: its number, then its tile (its grip, then what it holds). The number is the place, so it
 * stays put outside the tile while the tiles move (asked for): the two are siblings in the list's grid, the tile
 * still a child of the list, which `inList` and dnd-kit measure.
 */
export function StepTile({ id, number, whole, children }: TileProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const drag = { ...attributes, ...listeners }
  const classes = ['entry', 'is-step', whole && 'is-whole', isDragging && 'is-dragging']
  return (
    <>
      <span className="entry-number" aria-hidden="true">
        {number}.
      </span>
      <div
        ref={setNodeRef}
        className={classes.filter(Boolean).join(' ')}
        style={{
          transform: CSS.Translate.toString(transform),
          // The steps making way take the theme's timing; dnd-kit's 0ms transition (setting up a move) stays.
          transition: transition && !transition.includes(' 0ms') ? 'transform var(--dur) var(--ease)' : transition,
        }}
        {...(whole ? drag : {})}
      >
        {whole ? (
          <span className="entry-grip" aria-hidden="true">
            <GripIcon />
          </span>
        ) : (
          <IconButton
            ref={setActivatorNodeRef}
            className="entry-grip"
            label={`Move step ${number}`}
            title="Drag to move (Alt+Up or Alt+Down while typing)"
            {...drag}
          >
            <GripIcon />
          </IconButton>
        )}
        {children}
      </div>
    </>
  )
}
