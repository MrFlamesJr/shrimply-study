import { useState } from 'react'
import { SIDE_IMAGE, type Card } from '../model'
import { parseCloze } from '../logic/cloze'
import { sameCard, tidyCard } from '../logic/cardStatus'
import { AutoText } from './AutoText'
import { ClozeField } from './ClozeField'
import { ImageSlot } from './ImageSlot'
import { Modal, closeModal } from './Modal'

const FIELDS = [
  { field: 'term', label: 'Term' },
  { field: 'definition', label: 'Definition' },
  { field: 'explanation', label: 'Explanation (optional)' },
] as const

/** Edits one card in a modal (from a study session or the quiz page's card list). Term and definition can't be left empty; a fill-in-the-blank card needs a blank. */
export function CardDialog({ card, onSave, onClose }: { card: Card; onSave: (card: Card) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Card>(card)
  const complete =
    draft.type === 'cloze' ? parseCloze(draft.statement).ranges.length > 0 : draft.term.trim() !== '' && draft.definition.trim() !== ''

  const save = (button: Element) => {
    // Spaces and empty lines at the start and end of each field are dropped.
    const edited = tidyCard(draft)
    if (!sameCard(edited, card)) onSave(edited)
    closeModal(button)
  }

  return (
    <Modal title="Edit card" narrow onClose={onClose}>
      {draft.type === 'cloze' ? (
        <ClozeField
          aria-label="Statement"
          statement={draft.statement}
          explanation={draft.explanation}
          onChange={(statement, explanation) => setDraft({ ...draft, statement, explanation })}
          image={{ src: draft.image, label: 'the card', onChange: (image) => setDraft({ ...draft, image }) }}
        />
      ) : (
        FIELDS.map(({ field, label }) => (
          <label key={field} className="dialog-field">
            <span className="muted small">{label}</span>
            {field === 'explanation' ? (
              <AutoText value={draft.explanation ?? ''} onChange={(value) => setDraft({ ...draft, explanation: value })} />
            ) : (
              <ImageSlot
                src={draft[SIDE_IMAGE[field]]}
                label={`the ${field}`}
                onChange={(src) => setDraft({ ...draft, [SIDE_IMAGE[field]]: src })}
              >
                <AutoText value={draft[field]} onChange={(value) => setDraft({ ...draft, [field]: value })} />
              </ImageSlot>
            )}
          </label>
        ))
      )}
      <div className="actions">
        <button type="button" className="primary" disabled={!complete} onClick={(e) => save(e.currentTarget)}>
          Save
        </button>
        <button type="button" onClick={(e) => closeModal(e.currentTarget)}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
