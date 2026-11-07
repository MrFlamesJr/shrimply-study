import { useId, useState } from 'react'
import { AddPill } from './AddPill'

export type CardKind = 'term' | 'cloze' | 'true-false' | 'choice' | 'sequence'

const KINDS: { kind: CardKind; label: string; hint: string }[] = [
  { kind: 'term', label: 'Front and back', hint: 'Two sides: one to ask, one to answer.' },
  { kind: 'cloze', label: 'Fill in the blank', hint: 'A sentence with words hidden as blanks.' },
  { kind: 'true-false', label: 'True or false', hint: 'A statement to judge true or false.' },
  { kind: 'choice', label: 'Choice question', hint: 'Your own question with correct and incorrect answers.' },
  { kind: 'sequence', label: 'Sequence', hint: 'Steps to arrange in the correct order.' },
]
const REST = 'Choose the kind of card to add.'

/**
 * Under a section's cards: a dashed box titled "Add new card" on its top edge, with a pill per kind of card.
 * The pointed or focused pill's description shows on the line under the pills, which always keeps its room.
 */
export function AddRow({ onAdd }: { onAdd: (kind: CardKind) => void }) {
  const id = useId()
  const [shown, setShown] = useState<CardKind | null>(null)
  return (
    <fieldset
      className="add-new"
      onMouseLeave={() => setShown(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setShown(null)
      }}
    >
      <legend>Add new card</legend>
      <div className="add-pills">
        {KINDS.map(({ kind, label }) => (
          <AddPill
            key={kind}
            aria-describedby={`${id}-${kind}`}
            onMouseEnter={() => setShown(kind)}
            onFocus={() => setShown(kind)}
            onClick={() => onAdd(kind)}
          >
            {label}
          </AddPill>
        ))}
      </div>
      {/* Every description sits in the same cell, so the line is as tall as the longest one and nothing moves. */}
      <p className="add-hints" aria-hidden="true">
        <span className={shown === null ? 'is-shown' : undefined}>{REST}</span>
        {KINDS.map(({ kind, hint }) => (
          <span key={kind} id={`${id}-${kind}`} className={shown === kind ? 'is-shown' : undefined}>
            {hint}
          </span>
        ))}
      </p>
    </fieldset>
  )
}
