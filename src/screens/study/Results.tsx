import { useState } from 'react'
import type { Card, Format, Question } from '../../model'
import { BackToTop } from '../../components/BackToTop'
import { Segmented } from '../../components/Segmented'
import { CardRow } from '../../components/CardRow'
import { CheckIcon, CrossIcon } from '../../components/Icons'
import { MarkedBadge } from './SheetContent'
import type { Result } from './Question'

type Filter = 'all' | 'missed' | 'right' | 'marked'

type Props = {
  questions: Question[]
  results: Result[]
  cards: Card[]
  usable: Card[]
  format: Format
  onExit: () => void
  onBegin: (cards: Card[], only?: Question[]) => void
  onEdit: (cardId: string) => void
}

export function Results({ questions, results, cards, usable, format, onExit, onBegin, onEdit }: Props) {
  // Which questions the results list shows.
  const [filter, setFilter] = useState<Filter>('all')
  // The scroll box, for the back-to-top button.
  const [body, setBody] = useState<HTMLDivElement | null>(null)
  const total = questions.length
  const missed = questions.filter((_, i) => !results[i]?.ok)
  const right = total - missed.length
  const markedCount = results.filter((r) => r?.marked).length
  const missedCards = usable.filter((c) => missed.some((m) => m.cardId === c.id))
  // Every question of the round in the order asked (a fill-in-the-blank card once per blank), each with the
  // card as on the quiz page, so this is also a place to go through the cards and fix them.
  const rows = questions
    .map((q, i) => ({ q, i, result: results[i], card: cards.find((c) => c.id === q.cardId) }))
    .filter(({ result }) =>
      filter === 'missed' ? !result?.ok : filter === 'right' ? result?.ok : filter === 'marked' ? result?.marked : true,
    )
  const givenLabel = format === 'choice' ? 'You picked' : 'You typed'
  // Missed and Right only when both have questions, Marked by you only when it has any; no bar with nothing to pick.
  const filters: { value: Filter; label: string; title?: string }[] = [
    { value: 'all', label: `All (${total})` },
    ...(missed.length > 0 && right > 0
      ? [
          { value: 'missed' as const, label: `Missed (${missed.length})` },
          { value: 'right' as const, label: `Right (${right})` },
        ]
      : []),
    // One word like the others, so four still fit side by side on a phone.
    ...(markedCount > 0
      ? [{ value: 'marked' as const, label: `Marked (${markedCount})`, title: `Answers where you selected "I was right"` }]
      : []),
  ]
  return (
    <div className="session-main">
      <div ref={setBody} className="session-body results">
        <section className="results-summary" aria-label="Score">
          <div>
            <p className="score">{Math.round((right / total) * 100)}%</p>
            <p className="muted">
              {missed.length === 0 ? `All ${total} right. Nice work.` : `${right} of ${total} right`}
              {markedCount > 0 && ` · ${markedCount} marked by you`}
            </p>
          </div>
          <div className="actions">
            <button type="button" title="Back to the quiz page" className={missed.length === 0 ? 'primary' : undefined} autoFocus={missed.length === 0} onClick={onExit}>
              Back to quiz
            </button>
            <button type="button" title="A new round with every card" onClick={() => onBegin(usable)}>
              Study again
            </button>
            {missed.length > 0 && (
              <button type="button" className="primary" autoFocus title="A new round with only the questions you missed" onClick={() => onBegin(missedCards, missed)}>
                Retry {missed.length} missed
              </button>
            )}
          </div>
          <div className="score-bar" aria-hidden="true">
            <div style={{ width: `${(right / total) * 100}%` }} />
          </div>
        </section>

        <section aria-labelledby="round-title">
          <div className="results-head">
            <h2 id="round-title">Cards in this round</h2>
            {filters.length > 1 && <Segmented label="Show" options={filters} value={filter} onChange={setFilter} />}
          </div>
          <ol className="card-list card-rows result-rows">
            {rows.map(
              ({ q, i, result, card }) =>
                card && (
                  <CardRow
                    key={i}
                    card={card}
                    blank={q.blank}
                    lead={
                      <span
                        className={result?.ok ? 'row-mark' : 'row-mark is-missed'}
                        role="img"
                        aria-label={result?.ok ? 'Right' : 'Missed'}
                        title={result?.ok ? 'Right' : 'Missed'}
                      >
                        {result?.ok ? <CheckIcon /> : <CrossIcon />}
                      </span>
                    }
                    // What was picked or typed, when it wasn't the answer itself.
                    note={
                      result?.given !== undefined &&
                      (!result.ok || result.marked) && (
                        <p className="row-note">
                          {givenLabel}: <span className="row-given">{result.given}</span>
                          {result.marked && <MarkedBadge />}
                        </p>
                      )
                    }
                    onEdit={() => onEdit(q.cardId)}
                  />
                ),
            )}
          </ol>
        </section>
      </div>
      {body && <BackToTop scroller={body} />}
    </div>
  )
}
