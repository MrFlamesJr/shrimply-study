import { useEffect, useState } from 'react'
import type { Card, Format, Question, StudyOptions } from '../model'
import { redirect } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { useKeydown } from '../hooks/useKeydown'
import { buildRound, refreshQuestions, usableCards } from '../logic/buildRound'
import { Shortcut } from '../components/Shortcut'
import { CardDialog } from '../components/CardDialog'
import { StudyQuestion, type Result } from './study/Question'
import { Results } from './study/Results'

type Props = { lib: LibraryApi; quizId: string; format: Format; prefs: StudyOptions }

const FORMAT_NAME: Record<Format, string> = { flashcards: 'Flashcards', choice: 'Multiple choice', typing: 'Typing' }

// A multiple choice or typing question whose prompt or a choice is longer than this gets the wider session column.
// Never flashcards and never the hidden answer: a card's size must not give its answer away.
const WIDE_TEXT = 400

export function StudyScreen({ lib, quizId, format, prefs }: Props) {
  const found = lib.findQuiz(quizId)
  const usable = found ? usableCards(found.quiz.cards) : []
  const canStudy = usable.length > 0 && (format !== 'choice' || usable.length >= 2)
  const options = { ...prefs, format }

  const [phase, setPhase] = useState<'session' | 'summary'>('session')
  const [questions, setQuestions] = useState<Question[]>(() => (canStudy ? buildRound(usable, options, usable) : []))
  const [index, setIndex] = useState(0)
  // One per answered question, in the order asked.
  const [results, setResults] = useState<Result[]>([])
  // The id of the card open in the card dialog (from the card's pencil, or a row in the results).
  const [editing, setEditing] = useState<string | null>(null)

  const exit = () => found && redirect({ name: 'quiz', course: found.course.name, quiz: found.quiz.name })

  useEffect(() => {
    if (!canStudy) exit()
  }, [canStudy])

  // `only` keeps just those questions of the round (a cloze card is asked once per blank).
  const begin = (cards: Card[], only?: Question[]) => {
    const round = buildRound(cards, options, usable)
    setQuestions(only ? round.filter((q) => only.some((m) => m.cardId === q.cardId && m.blank === q.blank)) : round)
    setIndex(0)
    setResults([])
    setPhase('session')
  }

  const record = (result: Result) => setResults((r) => [...r.slice(0, index), result])

  const next = () => {
    if (index + 1 >= questions.length) setPhase('summary')
    else setIndex(index + 1)
  }

  // An edit from the card's pencil is saved to the library and shows in this round straight away.
  const saveCard = (edited: Card) => {
    if (!found) return
    lib.updateCard(quizId, edited)
    setQuestions((qs) => refreshQuestions(qs, edited))
  }

  useKeydown((e) => {
    // A dialog (the card editor, the image viewer) handles its own keys (Esc closes it, not the session).
    if (editing || (e.target as HTMLElement).closest('dialog')) return
    // A field that already handled the key prevents its default.
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
    if (e.key === 'Escape') exit()
  })

  if (!found || !canStudy) return null
  const { quiz } = found
  const total = questions.length
  const progress = phase === 'summary' ? 100 : (index / total) * 100
  const editCard = editing ? quiz.cards.find((c) => c.id === editing) : undefined
  const cardDialog = editCard && <CardDialog card={editCard} onSave={saveCard} onClose={() => setEditing(null)} />

  const head = (
    <>
      <div className="session-head">
        <button type="button" className="quiet" onClick={exit}>
          ✕ Exit <Shortcut keys="Esc" />
        </button>
        <span className="session-title">
          {quiz.name} · {phase === 'summary' ? 'Results' : FORMAT_NAME[format]}
        </span>
        <span className="session-count">{phase === 'summary' ? '' : `${index + 1} / ${total}`}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={phase === 'summary' ? total : index}>
        <div style={{ width: `${progress}%` }} />
      </div>
    </>
  )

  if (phase === 'summary') {
    return (
      <div className="session is-results">
        {head}
        <Results
          questions={questions}
          results={results}
          cards={quiz.cards}
          usable={usable}
          format={format}
          onExit={exit}
          onBegin={begin}
          onEdit={setEditing}
        />
        {cardDialog}
      </div>
    )
  }

  const question = questions[index] as Question | undefined
  if (!question) return null
  const wide = format !== 'flashcards' && [question.prompt, ...(question.choices ?? [])].some((t) => t.length > WIDE_TEXT)

  return (
    <div className={wide ? 'session is-wide' : 'session'}>
      {head}
      <StudyQuestion
        key={index}
        question={question}
        card={usable.find((c) => c.id === question.cardId)}
        format={format}
        usable={usable}
        result={results[index]}
        paused={editing !== null}
        onRecord={record}
        onNext={next}
        onEdit={setEditing}
      />
      {cardDialog}
    </div>
  )
}
