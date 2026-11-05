import type { ReactNode } from 'react'
import type { Format } from '../../model'
import { Thumb } from '../../components/Thumb'

export function MarkedBadge() {
  return (
    <span className="marked-badge" title={`You selected "I was right" for this answer`}>
      Marked by you
    </span>
  )
}

type SummaryProps = {
  ok: boolean | undefined
  marked: boolean | undefined
  format: Format
  answer: string
  answerImage: string | undefined
  typed: string | null
  // A wrong answer that is right for another card, or another blank, says which one.
  mixUp: ReactNode
}

/** The sheet's summary after a choice or typing answer: Correct or Incorrect, the answer, what was typed. */
export function AnswerSummary({ ok, marked, format, answer, answerImage, typed, mixUp }: SummaryProps) {
  return (
    <>
      <strong className={ok ? 'ok' : 'bad'}>{ok ? 'Correct' : 'Incorrect'}</strong>
      {marked && <MarkedBadge />}
      <dl className="sheet-answers">
        <dt>Answer</dt>
        {/* Multiple choice already highlights the right answer above, so here it keeps to one line. */}
        <dd className="with-thumb">
          <Thumb src={answerImage} />
          {format === 'choice' ? (
            <span
              className="is-clipped"
              // The whole answer as a tooltip, only when it is cut off (checked on each hover).
              onMouseEnter={(e) => {
                const el = e.currentTarget
                el.title = el.scrollWidth > el.clientWidth ? answer : ''
              }}
            >
              {answer}
            </span>
          ) : (
            <span>{answer}</span>
          )}
        </dd>
        {typed !== null && (
          <>
            <dt>You typed</dt>
            <dd className="muted">{typed}</dd>
          </>
        )}
      </dl>
      {mixUp && <p className="muted">{mixUp}</p>}
    </>
  )
}

type MoreProps = {
  explanation?: string
  // Choice and typing show the whole statement afterwards; a flashcard's back already does.
  statement?: { image?: string; text: ReactNode }
}

/** The sheet's "more info" blocks. The caller only renders it when at least one of them is set. */
export function MoreInfo({ explanation, statement }: MoreProps) {
  return (
    <>
      {explanation && (
        <div>
          <h3>Explanation</h3>
          <p>{explanation}</p>
        </div>
      )}
      {statement && (
        <div>
          <h3>Statement</h3>
          <p className="with-thumb">
            <Thumb src={statement.image} />
            {/* One flex item, so the statement's text and marks flow as one paragraph. */}
            <span>{statement.text}</span>
          </p>
        </div>
      )}
    </>
  )
}
