import type { CSSProperties, ReactNode } from 'react'
import { KIND_NAME, isTermCard, type Card } from '../model'
import { parseCloze } from '../logic/cloze'
import { sideNames } from '../logic/sides'
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
  /** Head the card like the editor's card head (quiz page): its number (`lead`), its sides or kind, the pencil. */
  kind?: boolean
  onEdit: () => void
}

/**
 * One card in a `.card-rows` list (quiz page, study results): the term and definition with their images and the
 * explanation under the definition, a fill-in-the-blank statement, or a true-or-false statement with its answer, a choice question with its right and wrong answers, a sequence with its steps; a pencil that opens the card dialog.
 */
export function CardRow({ card, lead, blank, note, kind, onEdit }: Props) {
  // The pencil comes before the note, so the note takes a row of its own under the text.
  const edit = (
    <IconButton className="row-edit" label="Edit card" onClick={onEdit}>
      <PencilIcon />
    </IconButton>
  )
  const extra = note && <div className="row-extra">{note}</div>
  // With `kind`, a head like the editor's card head: the number, then the card's name (a term card's sides, any other
  // card's kind), the pencil at its right end; the text starts under it.
  const name = isTermCard(card) ? `${sideNames(card).term} / ${sideNames(card).definition}` : KIND_NAME[card.type]
  const start = kind ? (
    <div className="row-head">
      {lead}
      <span className="pair-kind">{name}</span>
      {edit}
    </div>
  ) : (
    lead
  )
  const end = kind ? null : edit

  if (card.type === 'cloze') {
    const { text, ranges } = parseCloze(card.statement)
    // An edit can remove the asked blank; then the whole card shows.
    const only = blank !== undefined && ranges[blank] ? blank : undefined
    const explained = ranges.flatMap((_, i) => (card.explanation[i] && (only === undefined || i === only) ? [i] : []))
    return (
      <li>
        {start}
        <div className="row-statement">
          {!text ? (
            <span className="missing">No statement</span>
          ) : only === undefined ? (
            <ClozeText text={text} ranges={ranges} mode="marks" />
          ) : (
            <ClozeText text={text} ranges={ranges} mode="reveal" index={only} />
          )}
          <Thumb src={card.image} alt={text || 'Image for the card'} />
          {explained.length > 0 && (
            // Like the editor's blanks, a faint line between them; each starts with the blank in its color.
            <div className="row-blanks">
              {explained.map((i) => (
                <p key={i} className="row-note">
                  <span className="row-blank" style={{ '--mark': blankColor(i) } as CSSProperties}>
                    {text.slice(ranges[i].start, ranges[i].end)}
                  </span>
                  : {card.explanation[i]}
                </p>
              ))}
            </div>
          )}
        </div>
        {end}
        {extra}
      </li>
    )
  }
  if (card.type === 'true-false') {
    return (
      <li>
        {start}
        <strong className="row-term">
          {card.statement || <span className="missing">No text</span>}
          <Thumb src={card.image} alt={card.statement || 'Image for the card'} />
        </strong>
        <div className="row-def">
          {card.answer ? 'True' : 'False'}
          {card.explanation && <p className="row-note">{card.explanation}</p>}
        </div>
        {end}
        {extra}
      </li>
    )
  }
  if (card.type === 'choice') {
    const right = card.right.filter((x) => x.trim())
    const wrong = card.wrong.filter((x) => x.trim())
    return (
      <li>
        {start}
        <strong className="row-term">
          {card.question || <span className="missing">No text</span>}
          <Thumb src={card.image} alt={card.question || 'Image for the card'} />
        </strong>
        <div className="row-def">
          {right.length === 0 ? (
            <span className="missing">No right answer</span>
          ) : (
            // Several are numbered, like the editor and the flashcard; a lone answer is not a list.
            right.map((x, i) => (
              <p key={i} className="row-line">
                {right.length > 1 && <span className="row-step">{i + 1}.</span>}
                {x}
              </p>
            ))
          )}
          {wrong.length > 0 && <p className="row-note">Wrong: {wrong.join(', ')}</p>}
          {card.explanation && <p className="row-note">{card.explanation}</p>}
        </div>
        {end}
        {extra}
      </li>
    )
  }
  if (card.type === 'sequence') {
    const steps = card.steps.filter((x) => x.trim())
    return (
      <li>
        {start}
        <strong className="row-term">
          {card.title || <span className="missing">No text</span>}
          <Thumb src={card.image} alt={card.title || 'Image for the card'} />
        </strong>
        <div className="row-def">
          {steps.length === 0 ? (
            <span className="missing">No steps</span>
          ) : (
            steps.map((x, i) => (
              <p key={i} className="row-line">
                <span className="row-step">{i + 1}.</span>
                {x}
              </p>
            ))
          )}
          {card.explanation && <p className="row-note">{card.explanation}</p>}
        </div>
        {end}
        {extra}
      </li>
    )
  }
  const names = sideNames(card)
  return (
    <li>
      {start}
      <strong className="row-term">
        {card.term || <span className="missing">No text</span>}
        <Thumb src={card.termImage} alt={card.term || `${names.term} image`} />
      </strong>
      <div className="row-def">
        {card.definition || <span className="missing">No text</span>}
        <Thumb src={card.definitionImage} alt={card.definition || `${names.definition} image`} />
        {card.explanation && <p className="row-note">{card.explanation}</p>}
      </div>
      {end}
      {extra}
    </li>
  )
}
