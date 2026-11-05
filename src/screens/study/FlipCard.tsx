import type { ReactNode } from 'react'

type Props = { flipped: boolean; onFlip: () => void; front: ReactNode; back: ReactNode; edit: ReactNode }

/** The flashcard: one flip button with a face per side. */
export function FlipCard({ flipped, onFlip, front, back, edit }: Props) {
  // The pencil sits beside the flip button, not in it (a button can't hold a button), on a layer that
  // turns with the card: one pencil per face.
  return (
    <div className={flipped ? 'card-wrap is-flipped' : 'card-wrap'}>
      <button
        type="button"
        className="flip-card"
        aria-label={flipped ? 'Flip back to the question' : 'Flip to see the answer'}
        onClick={onFlip}
      >
        <span className="flip-inner">
          <span className="flip-face" aria-hidden={flipped}>
            {front}
          </span>
          <span className="flip-face flip-back" aria-hidden={!flipped}>
            {back}
          </span>
        </span>
      </button>
      <div className="flip-edit">
        <div className="flip-edit-face" inert={flipped}>
          {edit}
        </div>
        <div className="flip-edit-face flip-back" inert={!flipped}>
          {edit}
        </div>
      </div>
    </div>
  )
}
