import type { CSSProperties, ReactNode } from 'react'
import type { Card } from '../model'
import { parseCloze } from '../logic/cloze'
import { blankColor, ClozeText } from './ClozeText'
import { PencilIcon } from './Icons'

type Props = {
  card: Card
  /** The first column: the card number (quiz page) or whether it was right (results). */
  lead: ReactNode
  /** Fill-in-the-blank: show only this blank (revealed) and its explanation, not every blank. */
  blank?: number
  /** A line under the card's text, across both text columns. */
  note?: ReactNode
  onEdit: () => void
}

/** A card side's image as a small square preview, to go next to its text wherever that text shows. */
export const thumb = (src: string | undefined) => src && <img className="thumb" src={src} alt="Image" />

/**
 * One card in a `.card-rows` list (quiz page, study results): the term and definition with their images and the
 * explanation under the definition, or a fill-in-the-blank statement; a pencil that opens the card dialog.
 */
export function CardRow({ card, lead, blank, note, onEdit }: Props) {
  // The pencil comes before the note, so the note takes a row of its own under the text.
  const edit = (
    <button type="button" className="icon-btn row-edit" aria-label="Edit card" title="Edit card" onClick={onEdit}>
      <PencilIcon />
    </button>
  )
  const extra = note && <div className="row-extra">{note}</div>

  if (card.type === 'cloze') {
    const { text, ranges } = parseCloze(card.statement)
    // An edit can remove the asked blank; then the whole card shows.
    const only = blank !== undefined && ranges[blank] ? blank : undefined
    return (
      <li>
        {lead}
        <div className="row-statement">
          {!text ? (
            <span className="missing">No statement</span>
          ) : only === undefined ? (
            <ClozeText text={text} ranges={ranges} mode="marks" />
          ) : (
            <ClozeText text={text} ranges={ranges} mode="reveal" index={only} />
          )}
          {thumb(card.image)}
          {card.explanation.map(
            (explanation, i) =>
              explanation &&
              ranges[i] &&
              (only === undefined || i === only) && (
                // Each blank's explanation starts with the blank, underlined in its color.
                <p key={i} className="row-note">
                  <span className="row-blank" style={{ '--mark': blankColor(i) } as CSSProperties}>
                    {text.slice(ranges[i].start, ranges[i].end)}
                  </span>
                  : {explanation}
                </p>
              ),
          )}
        </div>
        {edit}
        {extra}
      </li>
    )
  }
  return (
    <li>
      {lead}
      <strong className="row-term">
        {card.term || <span className="missing">No term</span>}
        {thumb(card.termImage)}
      </strong>
      <div className="row-def">
        {card.definition || <span className="missing">No definition</span>}
        {thumb(card.definitionImage)}
        {card.explanation && <p className="row-note">{card.explanation}</p>}
      </div>
      {edit}
      {extra}
    </li>
  )
}
