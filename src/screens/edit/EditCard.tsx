import type { KeyboardEvent } from 'react'
import { SIDE_IMAGE, type Card, type ClozeCard, type Group, type TermCard } from '../../model'
import type { missingPart } from '../../logic/cardStatus'
import { AutoText } from '../../components/AutoText'
import { ClozeField } from '../../components/ClozeField'
import { IconButton } from '../../components/IconButton'
import { PlusIcon, TrashIcon } from '../../components/Icons'
import { ImageSlot } from '../../components/ImageSlot'

export type Field = 'term' | 'definition' | 'explanation'
const LABEL: Record<Field, string> = { term: 'Term', definition: 'Definition', explanation: 'Explanation' }

/** The small caption under a field. When `bad` it turns red with `badText`; the key replays the shake on every blocked Done. */
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

type Props = {
  card: Card
  /** Position in the quiz, from 0. */
  index: number
  groups: Group[]
  /** The part of the card to mark red (only after a blocked Done), if any. */
  flagged: ReturnType<typeof missingPart> | null
  /** Bumped on every blocked Done. */
  nudge: number
  onPatch: (patch: Partial<TermCard> | Partial<ClozeCard>) => void
  onMove: (group: string) => void
  onDelete: () => void
  /** Opens the explanation field and focuses it. */
  onAddExplanation: () => void
  /** Enter in a field: go to the next one. */
  onAdvance: (field: Field | 'blank') => void
}

/** One card in the editor: a `.pair` box with its head and fields. */
export function EditCard({ card, index, groups, flagged, nudge, onPatch, onMove, onDelete, onAddExplanation, onAdvance }: Props) {
  const i = index
  // Leaving a field drops spaces and empty lines at its start and end (the ones in between stay).
  const trim = (term: TermCard, field: Field) => {
    const value = term[field]
    if (value !== undefined && value !== value.trim()) onPatch({ [field]: value.trim() })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, field: Field) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    onAdvance(field)
  }
  return (
    <div className="pair">
      <div className="pair-head">
        <span>
          #{i + 1}
          <span className="pair-kind muted small">{card.type === 'cloze' ? 'Fill in the blank' : 'Term and definition'}</span>
        </span>
        <span className="pair-tools">
          {groups.length > 0 && (
            <select
              aria-label={`Group of card ${i + 1}`}
              title="Move this card to another group"
              data-card={card.id}
              data-field="group"
              value={card.group ?? ''}
              onChange={(e) => onMove(e.target.value)}
            >
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id} data-color={g.color}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {card.type !== 'cloze' && card.explanation === undefined && (
            <button type="button" className="quiet small" onClick={onAddExplanation}>
              <PlusIcon /> Explanation
            </button>
          )}
          <IconButton label={`Delete card ${i + 1}`} title="Delete card" onClick={onDelete}>
            <TrashIcon />
          </IconButton>
        </span>
      </div>
      {card.type === 'cloze' ? (
        <div className="pair-fields">
          <div className="pair-field is-wide">
            <ClozeField
              aria-label={`Statement ${i + 1}`}
              aria-invalid={flagged === 'blank' || undefined}
              data-card={card.id}
              data-field="blank"
              statement={card.statement}
              explanation={card.explanation}
              onChange={(statement, explanation) => onPatch({ statement, explanation })}
              image={{ src: card.image, label: `card ${i + 1}`, onChange: (image) => onPatch({ image }) }}
              onEnter={() => onAdvance('blank')}
              hint={<FieldHint bad={flagged === 'blank'} nudge={nudge} text="Statement" badText="Add a blank" />}
            />
          </div>
        </div>
      ) : (
        <div className="pair-fields">
          {(['term', 'definition'] as const).map((field) => (
            <label key={field} className="pair-field">
              <ImageSlot
                src={card[SIDE_IMAGE[field]]}
                label={`${field} ${i + 1}`}
                onChange={(src) => onPatch({ [SIDE_IMAGE[field]]: src })}
              >
                <AutoText
                  aria-label={`${LABEL[field]} ${i + 1}`}
                  aria-invalid={flagged === field || undefined}
                  data-card={card.id}
                  data-field={field}
                  value={card[field]}
                  onChange={(value) => onPatch({ [field]: value })}
                  onBlur={() => trim(card, field)}
                  onKeyDown={(e) => onKeyDown(e, field)}
                />
              </ImageSlot>
              <FieldHint bad={flagged === field} nudge={nudge} text={LABEL[field]} badText={`Add a ${field}`} />
            </label>
          ))}
          {card.explanation !== undefined && (
            <label className="pair-field is-wide">
              <AutoText
                aria-label={`Explanation ${i + 1}`}
                data-card={card.id}
                data-field="explanation"
                value={card.explanation}
                onChange={(value) => onPatch({ explanation: value })}
                onBlur={() => trim(card, 'explanation')}
                onKeyDown={(e) => onKeyDown(e, 'explanation')}
              />
              <span className="field-hint">Explanation</span>
            </label>
          )}
        </div>
      )}
    </div>
  )
}
