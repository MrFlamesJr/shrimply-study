import type { CSSProperties, ReactNode } from 'react'
import type { Card } from '../model'
import { parseCloze } from '../logic/cloze'
import { blankColor, ClozeText } from './ClozeText'
import { IconButton } from './IconButton'
import { PencilIcon } from './Icons'
import { Thumb } from './Thumb'

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

/**
 * One card in a `.card-rows` list (quiz page, study results): the term and definition with their images and the
 * explanation under the definition, or a fill-in-the-blank statement; a pencil that opens the card dialog.
 */
export function CardRow({ card, lead, blank, note, onEdit }: Props) {
  // The pencil comes before the note, so the note takes a row of its own under the text.
  const edit = (
    <IconButton className="row-edit" label="Edit card" onClick={onEdit}>
      <PencilIcon />
    </IconButton>
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
          <Thumb src={card.image} alt={text || 'Image for the card'} />
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
        <Thumb src={card.termImage} alt={card.term || 'Image for the term'} />
      </strong>
      <div className="row-def">
        {card.definition || <span className="missing">No definition</span>}
        <Thumb src={card.definitionImage} alt={card.definition || 'Image for the definition'} />
        {card.explanation && <p className="row-note">{card.explanation}</p>}
      </div>
      {edit}
      {extra}
    </li>
  )
}
