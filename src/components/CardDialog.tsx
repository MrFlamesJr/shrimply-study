import { useState } from 'react'
import type { Card } from '../model'
import { isBlank, missingPart, sameCard, tidyCard } from '../logic/cardStatus'
import type { LibraryApi } from '../state/useLibrary'
import { EditCard, type CardPatch } from './EditCard'
import { Modal, closeModal } from './Modal'

type Props = {
  card: Card
  /** Position in the quiz, from 0, for the card's "#1". */
  index: number
  lib: LibraryApi
  onSave: (card: Card) => void
  onClose: () => void
}

/** Edits one card in a modal (from a study session, the results or the quiz page's card list): the editor's `EditCard`, with Save and Cancel. Save waits until the card is complete (both sides, a blank, a statement, a question with a right and a wrong answer, a title and two steps). */
export function CardDialog({ card, index, lib, onSave, onClose }: Props) {
  // Only what was changed here, over the card as it is now, so a change the sides menu makes to every card using a
  // type (renamed, deleted) still shows.
  const [patch, setPatch] = useState<CardPatch>({})
  const draft = { ...card, ...patch } as Card
  const complete = !isBlank(draft) && missingPart(draft) === null

  const save = (button: Element) => {
    // Spaces and empty lines at the start and end of each field are dropped.
    const edited = tidyCard(draft)
    if (!sameCard(edited, card)) onSave(edited)
    closeModal(button)
  }

  return (
    <Modal title="Edit card" narrow onClose={onClose}>
      <EditCard card={draft} index={index} lib={lib} onPatch={(change) => setPatch((p) => ({ ...p, ...change }) as CardPatch)} />
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
