import { useState } from 'react'
import type { Card } from '../model'
import { isBlank, missingPart, sameCard, tidyCard } from '../logic/cardStatus'
import type { LibraryApi } from '../state/useWorkspace'
import { EditCard, type CardPatch } from './EditCard'
import { Modal, closeModal } from './Modal'

type Props = {
  card: Card
  /** Position in the quiz, from 0, for the card's "#1". */
  index: number
  lib: LibraryApi
  onSave: (card: Card) => void
  /** Shows a trash button in the card's head: the card is deleted and the dialog closes. */
  onDelete?: () => void
  /** A card that does not exist yet (the Explorer's New card): Save adds it, even as it came, and the title says so. */
  isNew?: boolean
  /** With `isNew`: a Save and add another button, which saves and leaves the dialog open for the host to start a fresh one. */
  onSaveAndAdd?: (card: Card) => void
  onClose: () => void
}

/** Edits one card in a modal (from a study session, the results or the quiz page's card list): the editor's `EditCard`, with Save and Cancel. Save waits until the card is complete (both sides, a blank, a statement, a question with a right and a wrong answer, a title and two steps). */
export function CardDialog({ card, index, lib, onSave, onDelete, isNew, onSaveAndAdd, onClose }: Props) {
  // Only what was changed here, over the card as it is now, so a change the sides menu makes to every card using a
  // type (renamed, deleted) still shows.
  const [patch, setPatch] = useState<CardPatch>({})
  const draft = { ...card, ...patch } as Card
  const complete = !isBlank(draft) && missingPart(draft) === null

  const save = (button: Element) => {
    // Spaces and empty lines at the start and end of each field are dropped.
    const edited = tidyCard(draft)
    if (isNew || !sameCard(edited, card)) onSave(edited)
    closeModal(button)
  }

  return (
    <Modal title={isNew ? 'New card' : 'Edit card'} narrow onClose={onClose}>
      <EditCard card={draft} index={index} lib={lib} onPatch={(change) => setPatch((p) => ({ ...p, ...change }) as CardPatch)}
        onDelete={
          onDelete &&
          ((button) => {
            closeModal(button)
            onDelete()
          })
        }
      />
      <div className="actions">
        <button type="button" className="primary" disabled={!complete} onClick={(e) => save(e.currentTarget)}>
          Save
        </button>
        {isNew && onSaveAndAdd && (
          <button type="button" disabled={!complete} onClick={() => onSaveAndAdd(tidyCard(draft))}>
            Save and add another
          </button>
        )}
        <button type="button" onClick={(e) => closeModal(e.currentTarget)}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
