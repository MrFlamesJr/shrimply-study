import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { KIND_NAME, SIDE_IMAGE, isTermCard, type Card, type ChoiceCard, type ClozeCard, type Group, type SequenceCard, type TermCard, type TrueFalseCard } from '../model'
import type { missingPart } from '../logic/cardStatus'
import { sideNames } from '../logic/sides'
import type { LibraryApi } from '../state/useWorkspace'
import { AutoText, goesOn, nextBox } from './AutoText'
import { ChoiceField } from './ChoiceField'
import { ClozeField } from './ClozeField'
import { ExplanationField } from './ExplanationField'
import { IconButton } from './IconButton'
import { GripIcon, PlusIcon, TrashIcon } from './Icons'
import { ImageSlot } from './ImageSlot'
import { Segmented } from './Segmented'
import { SequenceField } from './SequenceField'
import { SidesSelect } from './SidesSelect'
import { TrueFalseField } from './TrueFalseField'

// A choice question's answers and a sequence's steps are fields too, by their place in their list: `right-0`, `wrong-2`, `step-1`.
export type Field = 'term' | 'definition' | 'explanation' | 'statement' | 'question' | 'title' | `${'right' | 'wrong' | 'step'}-${number}`

export type CardPatch = Partial<TermCard> | Partial<ClozeCard> | Partial<TrueFalseCard> | Partial<ChoiceCard> | Partial<SequenceCard>

type Part = NonNullable<ReturnType<typeof missingPart>>

/** A field's name (its floating label, or a list's heading). When `bad` it turns red with `badText`; the key replays the shake on every blocked Done. */
function FieldHint({ bad, nudge, text, badText }: { bad: boolean; nudge: number; text: string; badText: string }) {
  return (
    <span
      key={bad ? `bad-${nudge}` : 'ok'}
      className={!bad ? 'field-hint' : nudge > 0 ? 'field-hint is-bad is-nudged' : 'field-hint is-bad'}
    >
      {bad ? badText : text}
    </span>
  )
}

// What in a card's head is a control of its own, never the start of a drag.
const CONTROLS = 'button, select, input, textarea, label, a, [popover]'

export type CardSortable = {
  setNodeRef: (element: HTMLElement | null) => void
  setActivatorNodeRef: (element: HTMLElement | null) => void
  style: CSSProperties
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  isDragging: boolean
}

type Props = {
  card: Card
  /** Position in the quiz, from 0: the head's "#1", and in every field's name ("Term 1"). */
  index: number
  /** For the sides menu: the library's side types. */
  lib: LibraryApi
  onPatch: (patch: CardPatch) => void
  /** Shows a trash button in the head that deletes the card (the editor's list, the card dialog). */
  onDelete?: (button: Element) => void
  /**
   * Only in the editor, a list of cards: the drag grip and group move select in the head, Enter in the last box going on
   * to the next card, and what is missing in red after a blocked Done. `CardDialog` leaves it out.
   */
  editor?: {
    groups: Group[]
    /** The part of the card to mark red (only after a blocked Done), if any. */
    flagged: Part | null
    /** Bumped on every blocked Done. */
    nudge: number
    onMove: (group: string) => void
    /** Enter in the card's last box: go on to the next card. */
    onAdvance: () => void
    /** Alt+Shift+Up or Down inside the card: move it one place (-1 or 1) within its section. */
    onShift: (by: -1 | 1) => void
    /** dnd-kit's hold on the card (`EditorCard`, via `useSortableCard`): the card's box, the grip, and while it is dragged. */
    sortable: CardSortable
  }
}

/** One card in its box: a head (number, sides or kind, + Explanation) and its fields. The editor's cards and the Edit card dialog (`CardDialog`) are both this. */
export function EditCard({ card, index, lib, onPatch, onDelete, editor }: Props) {
  const n = index + 1
  const flagged = editor?.flagged ?? null
  const nudge = editor?.nudge ?? 0
  const names = sideNames(isTermCard(card) ? card : {})
  const invalid = (part: Part) => flagged === part || undefined
  const hint = (part: Part, text: string, badText: string) => <FieldHint bad={flagged === part} nudge={nudge} text={text} badText={badText} />
  // Leaving a field drops spaces and empty lines at its start and end (the ones in between stay).
  const trim = (value: string | undefined, field: Field) => {
    if (value !== undefined && value !== value.trim()) onPatch({ [field]: value.trim() })
  }
  // + Explanation opens the field and its eraser closes it; the focus moves to whichever takes the other's place.
  // A fill-in-the-blank card's explanations are per blank, in its field.
  const [swapped, setSwapped] = useState<'field' | 'button'>()
  const canAdd = card.type !== 'cloze' && card.explanation === undefined
  // Back on + Explanation without scrolling: it sits in the head, maybe far above, and the view stays where you were.
  const addButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (canAdd && swapped === 'button') addButton.current?.focus({ preventScroll: true })
  }, [canAdd, swapped])

  return (
    <div
      ref={editor?.sortable.setNodeRef}
      className={editor?.sortable.isDragging ? 'pair is-dragging' : 'pair'}
      style={editor?.sortable.style}
      // Alt+Shift+Up or Down moves the card one place, from any of its boxes (a sequence's step boxes use it for the step). Enter goes on to the card's next box, and
      // from its last one to the next card (Shift+Enter starts a new line). In the dialog its Modal does this, going on to Save.
      onKeyDown={(e) => {
        if (editor && !e.defaultPrevented && e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          editor.onShift(e.key === 'ArrowUp' ? -1 : 1)
          return
        }
        if (!editor || !goesOn(e)) return
        e.preventDefault()
        const next = nextBox(e.target, e.currentTarget)
        if (next) next.focus()
        else editor.onAdvance()
      }}
    >
      <div
        className={editor ? 'pair-head is-movable' : 'pair-head'}
        // In the editor the whole head drags the card (asked for), not only its grip; a press on one of its controls
        // stays theirs. The drag starts once the pointer moves a little (see SortableCard), so clicks still click.
        onPointerDown={editor && ((e) => !(e.target as Element).closest(CONTROLS) && editor.sortable.listeners?.onPointerDown?.(e))}
      >
        <span>
          {editor && (
            <IconButton
              ref={editor.sortable.setActivatorNodeRef}
              className="pair-grip"
              label={`Move card ${n}`}
              title="Drag to move (Alt+Shift+Up or Down while typing)"
              {...editor.sortable.attributes}
              {...editor.sortable.listeners}
            >
              <GripIcon />
            </IconButton>
          )}
          <span className="pair-num">#{n}</span>
          {isTermCard(card) ? (
            <>
              <SidesSelect value={card.sides} lib={lib} label={`Sides of card ${n}`} onChange={(sides) => onPatch({ sides })} />
              <Segmented
                compact
                label={`Side asked of card ${n}`}
                title="Which side studying asks: the front every time, or the front or the back at random"
                options={[
                  { value: 'front', label: `${names.term} first` },
                  { value: 'mixed', label: 'Random' },
                ]}
                value={card.mixed ? 'mixed' : 'front'}
                onChange={(v) => onPatch({ mixed: v === 'mixed' ? true : undefined })}
              />
            </>
          ) : (
            <span className="pair-kind muted small">{KIND_NAME[card.type]}</span>
          )}
        </span>
        <span className="pair-tools">
          {editor && editor.groups.length > 0 && (
            <select
              aria-label={`Group of card ${n}`}
              title="Move this card to another group"
              data-card={card.id}
              data-field="group"
              value={card.group ?? ''}
              onChange={(e) => editor.onMove(e.target.value)}
            >
              <option value="">No group</option>
              {editor.groups.map((g) => (
                <option key={g.id} value={g.id} data-color={g.color}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {canAdd && (
            <button
              ref={addButton}
              type="button"
              className="quiet small"
              onClick={() => {
                setSwapped('field')
                onPatch({ explanation: '' })
              }}
            >
              <PlusIcon /> Explanation
            </button>
          )}
          {onDelete && (
            <IconButton className="pair-delete" label={`Delete card ${n}`} title="Delete card" onClick={(e) => onDelete(e.currentTarget)}>
              <TrashIcon />
            </IconButton>
          )}
        </span>
      </div>
      <div className="pair-fields">
        {card.type === 'cloze' ? (
          <div className="pair-field is-wide">
            <ClozeField
              aria-label={`Statement ${n}`}
              aria-invalid={invalid('blank')}
              data-card={card.id}
              data-field="blank"
              statement={card.statement}
              explanation={card.explanation}
              onChange={(statement, explanation) => onPatch({ statement, explanation })}
              image={{ src: card.image, label: `card ${n}`, onChange: (image) => onPatch({ image }) }}
              hint={hint('blank', 'Statement', 'Add a blank')}
            />
          </div>
        ) : card.type === 'true-false' ? (
          <div className="pair-field is-wide">
            <TrueFalseField
              aria-label={`Statement ${n}`}
              aria-invalid={invalid('statement')}
              data-card={card.id}
              data-field="statement"
              statement={card.statement}
              answer={card.answer}
              onStatement={(statement) => onPatch({ statement })}
              onAnswer={(answer) => onPatch({ answer })}
              onBlur={() => trim(card.statement, 'statement')}
              image={{ src: card.image, label: `statement ${n}`, onChange: (image) => onPatch({ image }) }}
              hint={hint('statement', 'Statement', 'Add text')}
            />
          </div>
        ) : card.type === 'choice' ? (
          <div className="pair-field is-wide">
            <ChoiceField
              aria-label={`Question ${n}`}
              aria-invalid={invalid('question')}
              data-card={card.id}
              data-field="question"
              cardId={card.id}
              question={card.question}
              mode={card.mode}
              right={card.right}
              wrong={card.wrong}
              onMode={(mode) => onPatch({ mode })}
              onQuestion={(question) => onPatch({ question })}
              onList={(list, entries) => onPatch({ [list]: entries })}
              onBlur={() => trim(card.question, 'question')}
              image={{ src: card.image, label: `question ${n}`, onChange: (image) => onPatch({ image }) }}
              hint={hint('question', 'Question', 'Add a question')}
              rightHint={hint('right', 'Correct answers', 'Add a correct answer')}
              wrongHint={hint('wrong', 'Wrong answers', 'Add a wrong answer')}
            />
          </div>
        ) : card.type === 'sequence' ? (
          <div className="pair-field is-wide">
            <SequenceField
              aria-label={`Title ${n}`}
              aria-invalid={invalid('title')}
              data-card={card.id}
              data-field="title"
              cardId={card.id}
              title={card.title}
              steps={card.steps}
              onTitle={(title) => onPatch({ title })}
              onSteps={(steps) => onPatch({ steps })}
              onBlur={() => trim(card.title, 'title')}
              image={{ src: card.image, label: `title ${n}`, onChange: (image) => onPatch({ image }) }}
              hint={hint('title', 'Title', 'Add a title')}
              stepsHint={hint('steps', 'Steps, in order', 'Add two steps')}
            />
          </div>
        ) : (
          (['term', 'definition'] as const).map((field) => (
            <div key={field} className="pair-field">
              <ImageSlot
                src={card[SIDE_IMAGE[field]]}
                label={`${names[field].toLowerCase()} ${n}`}
                onChange={(src) => onPatch({ [SIDE_IMAGE[field]]: src })}
              >
                <AutoText
                  aria-label={`${names[field]} ${n}`}
                  aria-invalid={invalid(field)}
                  label={hint(field, names[field], 'Add text')}
                  data-card={card.id}
                  data-field={field}
                  value={card[field]}
                  onChange={(value) => onPatch({ [field]: value })}
                  onBlur={() => trim(card[field], field)}
                />
              </ImageSlot>
            </div>
          ))
        )}
        {card.type !== 'cloze' && card.explanation !== undefined && (
          <div className="pair-field is-wide">
            <ExplanationField
              aria-label={`Explanation ${n}`}
              removeLabel={`Remove explanation ${n}`}
              data-card={card.id}
              data-field="explanation"
              autoFocus={swapped === 'field'}
              value={card.explanation}
              onChange={(value) => onPatch({ explanation: value })}
              onBlur={() => trim(card.explanation, 'explanation')}
              onRemove={() => {
                setSwapped('button')
                onPatch({ explanation: undefined })
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
