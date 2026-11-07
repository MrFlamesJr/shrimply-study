import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { newId } from '../model'
import { AutoText } from './AutoText'
import { PlusIcon } from './Icons'
import { ImageSlot } from './ImageSlot'
import { StepList, StepTile } from './StepList'

type Props = Omit<ComponentProps<typeof AutoText>, 'value' | 'onChange' | 'placeholder' | 'label'> & {
  title: string
  steps: string[]
  onTitle: (title: string) => void
  onSteps: (steps: string[]) => void
  /** The card's id: every step gets `data-card` and `data-field="step-0"`, `"step-1"`, … so the editor can focus it. */
  cardId?: string
  /** The title box's label in place of the plain "Title" (the editor's, which says what is missing). */
  hint?: ReactNode
  /** The heading of the steps, in place of the plain one (the editor marks what is missing there). */
  stepsHint?: ReactNode
  /** The card's image, beside the title box. */
  image: Omit<ComponentProps<typeof ImageSlot>, 'children'>
}

/** The sequence editor: the title with its image and the steps in their right order, each a tile to drag by its grip. */
export function SequenceField({ title, steps, onTitle, onSteps, cardId, hint, stepsHint, image, ...rest }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  // The step to focus once the list has re-rendered (a new one, a moved one, the one before a removed one).
  const pending = useRef<number | null>(null)
  useEffect(() => {
    if (pending.current === null) return
    wrap.current?.querySelector<HTMLElement>(`[data-entry="step-${pending.current}"]`)?.focus()
    pending.current = null
  })

  // A sequence needs two steps, so two empty ones show until there are more.
  const shown = steps.length >= 2 ? steps : [...steps, ...Array(2 - steps.length).fill('')]
  // Steps are plain texts, so each gets an id here to drag and key it by; the id moves with its step. A new array
  // each time they change, as dnd-kit compares them.
  const ids = useRef<string[]>([])
  if (ids.current.length !== shown.length) {
    ids.current = [
      ...ids.current.slice(0, shown.length),
      ...Array.from({ length: shown.length - ids.current.length }, newId),
    ]
  }

  const set = (i: number, value: string) => onSteps(shown.map((x, j) => (j === i ? value : x)))
  const insert = (at: number) => {
    pending.current = at
    onSteps([...shown.slice(0, at), '', ...shown.slice(at)])
  }
  const remove = (i: number) => {
    pending.current = Math.max(0, i - 1)
    ids.current = ids.current.filter((_, j) => j !== i)
    onSteps(shown.filter((_, j) => j !== i))
  }
  const move = (from: number, to: number) => {
    ids.current = arrayMove(ids.current, from, to)
    onSteps(arrayMove(shown, from, to))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const to = i + (e.key === 'ArrowUp' ? -1 : 1)
      if (to < 0 || to >= shown.length) return
      pending.current = to
      move(i, to)
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && i === shown.length - 1) {
      // Enter goes on to the next box (the card or dialog around moves the focus, see AutoText). In the last step it
      // adds one instead; in an empty last step it leaves the list, and that empty step goes (two always show).
      if (shown[i].trim()) {
        e.preventDefault()
        insert(i + 1)
      } else {
        setLeft(true)
      }
    }
  }
  // The empty step goes after the render, so it builds on what the same Enter did around it (the editor adds a card).
  const [left, setLeft] = useState(false)
  useEffect(() => {
    if (!left) return
    setLeft(false)
    if (shown.length > 2 && !shown[shown.length - 1].trim()) onSteps(shown.slice(0, -1))
  }, [left])

  return (
    <div className="sequence-field" ref={wrap}>
      <ImageSlot {...image}>
        <AutoText {...rest} label={hint ?? 'Title'} value={title} onChange={onTitle} />
      </ImageSlot>
      <div className="entry-list">
        <div className="entry-label">{stepsHint ?? <span className="field-hint">Steps, in order</span>}</div>
        <StepList ids={ids.current} onMove={move}>
          {shown.map((text, i) => (
            <StepTile key={ids.current[i]} id={ids.current[i]} number={i + 1}>
              <AutoText
                aria-label={`Step ${i + 1}`}
                data-card={cardId}
                data-field={`step-${i}`}
                data-entry={`step-${i}`}
                value={text}
                onChange={(value) => set(i, value)}
                onBlur={() => text !== text.trim() && set(i, text.trim())}
                onKeyDown={(e) => onKeyDown(e, i)}
                // A sequence needs two steps, so the last two can not go.
                erase={{
                  label: 'Remove step',
                  onErase: () => remove(i),
                  off: shown.length <= 2,
                }}
              />
            </StepTile>
          ))}
        </StepList>
        <button type="button" className="quiet small entry-add" onClick={() => insert(shown.length)}>
          <PlusIcon /> Step
        </button>
      </div>
    </div>
  )
}
