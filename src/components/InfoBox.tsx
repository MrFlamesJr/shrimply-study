import { useId, type ReactNode } from 'react'
import { ChevronDownIcon, InfoIcon } from './Icons'

type Props = {
  title: string
  /** A muted aside after the title, kept exactly as written (body font, never transformed). */
  note?: string
  /** Whole, or minimized to a compact chip with just the title. */
  open: boolean
  onToggle: (open: boolean) => void
  children: ReactNode
}

/** A box of help on a faint info tint. Its title is one button that minimizes it to the title and expands it again. */
export function InfoBox({ title, note, open, onToggle, children }: Props) {
  const id = useId()
  return (
    <aside className={open ? 'info-box' : 'info-box is-min'} aria-labelledby={`${id}-title`}>
      <h3>
        <button
          type="button"
          className="info-box-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          title={open ? 'Minimize' : 'Expand'}
          onClick={() => onToggle(!open)}
        >
          <InfoIcon />
          <span id={`${id}-title`} className="info-box-title">
            {title}
            {note && <span className="info-box-note"> {note}</span>}
          </span>
          <span className="info-box-chevron">
            <ChevronDownIcon />
          </span>
        </button>
      </h3>
      <div className="info-box-body" id={`${id}-body`}>
        <div>
          <div className="info-box-content">{children}</div>
        </div>
      </div>
    </aside>
  )
}
