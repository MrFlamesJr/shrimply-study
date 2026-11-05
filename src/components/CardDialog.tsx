import { useState } from 'react'
import { SIDE_IMAGE, type Card } from '../model'
import { parseCloze } from '../logic/cloze'
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
  const [draft, setDraft] = useState(
    card.type === 'cloze'
      ? { term: '', definition: '', explanation: '', statement: card.statement, blanks: card.explanation }
      : { term: card.term, definition: card.definition, explanation: card.explanation ?? '', statement: '', blanks: [] as (string | null)[] },
  )
  const [images, setImages] = useState<{ image?: string; termImage?: string; definitionImage?: string }>(
    card.type === 'cloze' ? { image: card.image } : { termImage: card.termImage, definitionImage: card.definitionImage },
  )
  const complete =
    card.type === 'cloze'
      ? parseCloze(draft.statement).ranges.length > 0
      : draft.term.trim() !== '' && draft.definition.trim() !== ''

  const save = (button: Element) => {
    // Spaces and empty lines at the start and end of each field are dropped.
    if (card.type === 'cloze') {
      const statement = draft.statement.trim()
      const explanation = draft.blanks.map((x) => x?.trim() || null)
      if (statement !== card.statement || explanation.some((x, i) => x !== card.explanation[i]) || images.image !== card.image) {
        onSave({ ...card, statement, explanation, image: images.image })
      }
    } else {
      const edited: Card = {
        ...card,
        term: draft.term.trim(),
        definition: draft.definition.trim(),
        explanation: draft.explanation.trim() || undefined,
        termImage: images.termImage,
        definitionImage: images.definitionImage,
      }
      const changed = (['term', 'definition', 'explanation', 'termImage', 'definitionImage'] as const).some((f) => edited[f] !== card[f])
      if (changed) onSave(edited)
    }
    closeModal(button)
  }

  return (
    <Modal title="Edit card" narrow onClose={onClose}>
      {card.type === 'cloze' ? (
        <ClozeField
          aria-label="Statement"
          statement={draft.statement}
          explanation={draft.blanks}
          onChange={(statement, blanks) => setDraft({ ...draft, statement, blanks })}
          image={{ src: images.image, label: 'the card', onChange: (image) => setImages({ ...images, image }) }}
        />
      ) : (
        FIELDS.map(({ field, label }) => (
          <label key={field} className="dialog-field">
            <span className="muted small">{label}</span>
            {field === 'explanation' ? (
              <AutoText value={draft[field]} onChange={(value) => setDraft({ ...draft, [field]: value })} />
            ) : (
              <ImageSlot
                src={images[SIDE_IMAGE[field]]}
                label={`the ${field}`}
                onChange={(src) => setImages({ ...images, [SIDE_IMAGE[field]]: src })}
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
