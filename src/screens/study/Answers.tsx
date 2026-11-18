import { Thumb } from '../../components/Thumb'
import { CheckIcon, CrossIcon } from '../../components/Icons'

export function MarkedBadge() {
  return (
    <span className="marked-badge" title={`You selected "I was right" for this answer`}>
      Marked by you
    </span>
  )
}

/** Answers one per line, numbered (the steps of a sequence, the right answers of a pick-all question). Spans only, as
 * a flashcard face is inside a button. */
export function AnswerList({ items }: { items: string[] }) {
  return (
    <span className="answer-list" role="list">
      {items.map((item, i) => (
        <span key={i} className="answer-item" role="listitem">
          {item}
        </span>
      ))}
    </span>
  )
}

/** The check or cross after an answer once it is checked, so color is never the only sign. `label` says what it marks. */
export function Mark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="choice-mark" role="img" aria-label={label} title={label}>
      {ok ? <CheckIcon /> : <CrossIcon />}
    </span>
  )
}

type TypedProps = {
  typed: string
  ok: boolean
  marked: boolean | undefined
  answers: string[]
  answerImage: string | undefined
}

/** A typed answer once checked, in place of its field and styled like the choices: what was typed, right or wrong,
 * then each correct answer that reads any other way (one, or several when any of them counts). */
export function TypedAnswer({ typed, ok, marked, answers, answerImage }: TypedProps) {
  return (
    <div className="typed">
      <p className={ok ? 'choice is-correct' : 'choice is-wrong'}>
        {typed}
        {marked && <MarkedBadge />}
        <Mark ok={ok} label={ok ? 'Your answer, right' : 'Your answer, wrong'} />
      </p>
      {answers
        .filter((answer) => typed.trim() !== answer.trim())
        .map((answer, i) => (
          <p key={i} className="choice is-correct">
            <Thumb src={answerImage} alt={answer || 'Image for the answer'} />
            {answer}
            <Mark ok label="Correct answer" />
          </p>
        ))}
    </div>
  )
}
