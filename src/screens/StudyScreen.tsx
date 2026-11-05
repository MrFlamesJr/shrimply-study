import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SIDE_IMAGE, type Card, type Format, type Question } from '../model'
import { redirect } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import type { Prefs } from '../App'
import { buildRound, usableCards } from '../logic/buildRound'
import { checkAnswer } from '../logic/checkAnswer'
import { clozeQuestion, parseCloze } from '../logic/cloze'
import { mixedUpWith } from '../logic/mixUp'
import { canScroll } from '../logic/canScroll'
import { AutoText } from '../components/AutoText'
import { ClozeText } from '../components/ClozeText'
import { FeedbackSheet } from '../components/FeedbackSheet'
import { Shortcut } from '../components/Shortcut'
import { CardDialog } from '../components/CardDialog'
import { CardRow, thumb } from '../components/CardRow'
import { Segmented } from '../components/Segmented'
import { CheckIcon, CrossIcon, PencilIcon } from '../components/Icons'

type Props = { lib: LibraryApi; quizId: string; format: Format; prefs: Prefs }

const FORMAT_NAME: Record<Format, string> = { flashcards: 'Flashcards', choice: 'Multiple choice', typing: 'Typing' }

// Longer card text gets the smaller, left-aligned paragraph style.
const LONG_TEXT = 150
// A side with an image has about half the room for its text, so its text counts as long at half the length.
const textClass = (text: string, image?: string) =>
  text.length > (image ? LONG_TEXT / 2 : LONG_TEXT) ? 'prompt-text is-long' : 'prompt-text'
// A multiple choice or typing question whose prompt or a choice is longer than this gets the wider session column.
// Never flashcards and never the hidden answer: a card's size must not give its answer away.
const WIDE_TEXT = 400
// How far one arrow key press scrolls a long card side, in px.
const ARROW_STEP = 40

// How a question went: right or not, what was picked or typed (choice and typing), and whether "I was right"
// counted it as right (a "Marked by you" badge on the answer and in the results).
type Result = { ok: boolean; given?: string; marked?: boolean }
type Filter = 'all' | 'missed' | 'right' | 'marked'

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
  // Which questions the results list shows.
  const [filter, setFilter] = useState<Filter>('all')
  // Flashcards: the card can flip back and forth; grading unlocks after the first flip.
  const [flipped, setFlipped] = useState(false)
  const [seen, setSeen] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [typed, setTyped] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // The id of the card open in the card dialog (from the card's pencil, or a row in the results).
  const [editing, setEditing] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const question = questions[index] as Question | undefined
  const feedback = format === 'choice' ? picked !== null : format === 'typing' ? typed !== null : false
  const exit = () => redirect({ name: 'quiz', id: quizId })

  useEffect(() => {
    if (!canStudy) exit()
  }, [canStudy])

  // `only` keeps just those questions of the round (a cloze card is asked once per blank).
  const begin = (cards: Card[], only?: Question[]) => {
    const round = buildRound(cards, options, usable)
    setQuestions(only ? round.filter((q) => only.some((m) => m.cardId === q.cardId && m.blank === q.blank)) : round)
    setIndex(0)
    setResults([])
    setFilter('all')
    setFlipped(false)
    setSeen(false)
    setPicked(null)
    setTyped(null)
    setDraft('')
    setPhase('session')
  }

  const record = (result: Result) => setResults((r) => [...r.slice(0, index), result])

  const next = () => {
    if (index + 1 >= questions.length) {
      setPhase('summary')
      return
    }
    setIndex(index + 1)
    setFlipped(false)
    setSeen(false)
    setPicked(null)
    setTyped(null)
    setDraft('')
  }

  const flip = () => {
    setFlipped((f) => !f)
    setSeen(true)
  }

  const grade = (ok: boolean) => {
    record({ ok })
    next()
  }

  const pick = (choice: string) => {
    if (!question || picked !== null) return
    setPicked(choice)
    record({ ok: choice === question.answer, given: choice })
  }

  const check = (e: FormEvent) => {
    e.preventDefault()
    // No answer is ever empty (a card needs both sides, a blank needs text), so an empty field can't be checked.
    if (!question || typed !== null || draft.trim() === '') return
    setTyped(draft)
    record({ ok: checkAnswer(draft, question.answer), given: draft })
  }

  // An edit from the card's pencil is saved to the library and shows in this round straight away.
  const saveCard = (edited: Card) => {
    if (!found) return
    const old = found.quiz.cards.find((c) => c.id === edited.id)!
    lib.setCards(quizId, found.quiz.cards.map((c) => (c.id === edited.id ? edited : c)))
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.cardId !== edited.id) return q
        if (edited.type === 'cloze') {
          const { text, ranges } = parseCloze(edited.statement)
          if (q.blank === undefined || q.blank >= ranges.length) return q
          const fresh = clozeQuestion(text, ranges, q.blank)
          return { ...q, ...fresh, choices: q.choices?.map((c) => (c === q.answer ? fresh.answer : c)) }
        }
        if (old.type === 'cloze') return q
        const side = old.term.trim() === q.prompt ? 'term' : 'definition'
        const answer = edited[side === 'term' ? 'definition' : 'term'].trim()
        return { ...q, prompt: edited[side].trim(), answer, choices: q.choices?.map((c) => (c === q.answer ? answer : c)) }
      }),
    )
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The card editor handles its own keys (Esc closes it, not the session).
      if (editing) return
      const target = e.target as HTMLElement
      const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      const onButton = target instanceof HTMLButtonElement
      // A field that already handled the key (Enter in the answer box submits) prevents its default.
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (e.key === 'Escape') {
        exit()
      } else if (phase !== 'session' || !question) {
        return
      } else if (e.key === 'Enter') {
        if (feedback && !onButton) {
          e.preventDefault()
          next()
        } else if (format === 'flashcards' && !onButton && !inField) {
          e.preventDefault()
          flip()
        }
      } else if (inField) {
        return
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !target.closest('.sheet')) {
        // A long card side scrolls inside the card: the arrows scroll it first, then the page as usual.
        const text = document.querySelector<HTMLElement>(
          '.prompt-card .prompt-text, .flip-face[aria-hidden="false"] .prompt-text',
        )
        const down = e.key === 'ArrowDown'
        if (text && canScroll(text, down)) {
          e.preventDefault()
          text.scrollBy({ top: down ? ARROW_STEP : -ARROW_STEP })
        }
      } else if (e.key === ' ') {
        if (format === 'flashcards' && !onButton) {
          e.preventDefault()
          flip()
        }
      } else if (format === 'flashcards' && seen && (e.key === '1' || e.key === '2')) {
        grade(e.key === '2')
      } else if (format === 'choice' && question.choices && /^[1-4]$/.test(e.key)) {
        const choice = question.choices[Number(e.key) - 1]
        if (choice !== undefined) pick(choice)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!found || !canStudy) return null
  const { quiz } = found
  const total = questions.length
  const missed = questions.filter((_, i) => !results[i]?.ok)
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
    const right = total - missed.length
    const markedCount = results.filter((r) => r?.marked).length
    const missedCards = usable.filter((c) => missed.some((m) => m.cardId === c.id))
    // Every question of the round in the order asked (a fill-in-the-blank card once per blank), each with the
    // card as on the quiz page, so this is also a place to go through the cards and fix them.
    const rows = questions
      .map((q, i) => ({ q, i, result: results[i], card: quiz.cards.find((c) => c.id === q.cardId) }))
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
      <div className="session is-results">
        {head}
        <div className="session-main">
          <div className="session-body results">
            <section className="results-summary" aria-label="Score">
              <div>
                <p className="score">{Math.round((right / total) * 100)}%</p>
                <p className="muted">
                  {missed.length === 0 ? `All ${total} right. Nice work.` : `${right} of ${total} right`}
                  {markedCount > 0 && ` · ${markedCount} marked by you`}
                </p>
              </div>
              <div className="actions">
                <button type="button" title="Back to the quiz page" className={missed.length === 0 ? 'primary' : undefined} autoFocus={missed.length === 0} onClick={exit}>
                  Back to quiz
                </button>
                <button type="button" title="A new round with every card" onClick={() => begin(usable)}>
                  Study again
                </button>
                {missed.length > 0 && (
                  <button type="button" className="primary" autoFocus title="A new round with only the questions you missed" onClick={() => begin(missedCards, missed)}>
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
                              {result.marked && (
                                <span className="marked-badge" title={`You selected "I was right" for this answer`}>
                                  Marked by you
                                </span>
                              )}
                            </p>
                          )
                        }
                        onEdit={() => setEditing(q.cardId)}
                      />
                    ),
                )}
              </ol>
            </section>
          </div>
        </div>
        {cardDialog}
      </div>
    )
  }


  if (!question) return null
  const ok = results[index]?.ok
  const card = usable.find((c) => c.id === question.cardId)
  const cloze = card?.type === 'cloze' && question.blank !== undefined ? { ...parseCloze(card.statement), blank: question.blank } : null
  const promptSide = card?.type !== 'cloze' && card && card.term.trim() === question.prompt ? 'term' : 'definition'
  const answerSide = promptSide === 'term' ? 'definition' : 'term'
  const sideLabel = cloze ? 'Fill in the blank' : promptSide === 'term' ? 'Term' : 'Definition'
  // A side's image goes above its text. A fill-in-the-blank card has one image, shown on both sides.
  const imageOf = (side: 'term' | 'definition') => (card?.type === 'cloze' ? card.image : card?.[SIDE_IMAGE[side]])
  const picture = (side: 'term' | 'definition') => {
    const src = imageOf(side)
    return src && <img className="card-img" src={src} alt="Image" />
  }
  const promptText = (
    <span className={textClass(question.prompt, imageOf(promptSide))}>
      {cloze ? <ClozeText text={cloze.text} ranges={cloze.ranges} mode="gap" index={cloze.blank} /> : question.prompt}
    </span>
  )
  const answerText = (
    <span className={textClass(question.answer, imageOf(answerSide))}>
      {cloze ? <ClozeText text={cloze.text} ranges={cloze.ranges} mode="reveal" index={cloze.blank} /> : question.answer}
    </span>
  )
  const wide = format !== 'flashcards' && [question.prompt, ...(question.choices ?? [])].some((t) => t.length > WIDE_TEXT)
  const showSheet = format === 'flashcards' ? seen : feedback
  // A wrong answer that is right for another card says which one, so the two are not mixed up again.
  const given = format === 'choice' ? picked : typed
  const mixUp = ok === false && given && !cloze ? mixedUpWith(given, answerSide, question.cardId, usable) : undefined

  // The sheet only opens for more info when the card has an explanation, or (choice and typing, where only the
  // answer's text was shown) an image on the answer side.
  const explanation = (card?.type === 'cloze' ? card.explanation[question.blank ?? -1] : card?.explanation)?.trim()
  const explanationBlock = explanation ? (
    <div>
      <h3>Explanation</h3>
      <p>{explanation}</p>
    </div>
  ) : null
  const answerImage = format !== 'flashcards' && !cloze ? imageOf(answerSide) : undefined
  // A choice's image: the answer's own, or that of the card the other answer comes from. A blank has none
  // (the card's image goes with its statement).
  const choiceImage = (choice: string) =>
    cloze
      ? undefined
      : choice === question.answer
        ? answerImage
        : mixedUpWith(choice, answerSide, question.cardId, usable)?.[SIDE_IMAGE[answerSide]]
  const imageBlock = answerImage ? (
    <div>
      <h3>Image</h3>
      <img className="sheet-img" src={answerImage} alt="Image" />
    </div>
  ) : null
  // Choice and typing show the whole statement afterwards; a flashcard's back already does.
  const more = cloze && format !== 'flashcards' ? (
    <>
      {explanationBlock}
      <div>
        <h3>Statement</h3>
        <p className="with-thumb">
          {thumb(imageOf('term'))}
          {/* One flex item, so the statement's text and marks flow as one paragraph. */}
          <span>
            <ClozeText text={cloze.text} ranges={cloze.ranges} mode="reveal" index={cloze.blank} />
          </span>
        </p>
      </div>
    </>
  ) : imageBlock || explanationBlock ? (
    <>
      {imageBlock}
      {explanationBlock}
    </>
  ) : null

  const editButton = (
    <button
      type="button"
      className="icon-btn card-edit"
      aria-label="Edit this card"
      title="Edit this card"
      onClick={() => setEditing(question.cardId)}
    >
      <PencilIcon />
    </button>
  )

  return (
    <div className={wide ? 'session is-wide' : 'session'}>
      {head}
      <div className="session-main">
        <div className="session-body">
          {format === 'flashcards' ? (
            // The pencil sits beside the flip button, not in it (a button can't hold a button), on a layer that
            // turns with the card: one pencil per face. Keyed by index so a new card starts on its front
            // instead of flipping back in view.
            <div key={index} className={flipped ? 'card-wrap is-flipped' : 'card-wrap'}>
              <button
                type="button"
                className="flip-card"
                aria-label={flipped ? 'Flip back to the question' : 'Flip to see the answer'}
                onClick={flip}
              >
                <span className="flip-inner">
                  <span className="flip-face" aria-hidden={flipped}>
                    <span className="side-label muted">{sideLabel}</span>
                    {picture(promptSide)}
                    {promptText}
                  </span>
                  <span className="flip-face flip-back" aria-hidden={!flipped}>
                    <span className="side-label muted">{cloze ? sideLabel : sideLabel === 'Term' ? 'Definition' : 'Term'}</span>
                    {picture(answerSide)}
                    {answerText}
                  </span>
                </span>
              </button>
              <div className="flip-edit">
                <div className="flip-edit-face" inert={flipped}>
                  {editButton}
                </div>
                <div className="flip-edit-face flip-back" inert={!flipped}>
                  {editButton}
                </div>
              </div>
            </div>
          ) : (
            <div className="prompt-card">
              <span className="side-label muted">{sideLabel}</span>
              {picture(promptSide)}
              {promptText}
              {editButton}
            </div>
          )}

          {format === 'flashcards' && (
            <p className="flip-hint muted small">
              Click the card to flip it <Shortcut keys="Space" />
            </p>
          )}

          {format === 'choice' && question.choices && (
            <div className="choices">
              {question.choices.map((choice, i) => (
                <button
                  key={i}
                  type="button"
                  className={
                    picked === null
                      ? 'choice'
                      : choice === question.answer
                        ? 'choice is-correct'
                        : choice === picked
                          ? 'choice is-wrong'
                          : 'choice is-dim'
                  }
                  disabled={picked !== null}
                  onClick={() => pick(choice)}
                >
                  <span className="choice-key">{i + 1}</span>
                  {thumb(choiceImage(choice))}
                  {choice}
                </button>
              ))}
            </div>
          )}

          {format === 'typing' && (
            // After Check the answer stays in view, locked: the field and the button are disabled.
            <form ref={formRef} className="type-answer" onSubmit={check}>
              <AutoText
                key={index}
                autoFocus
                aria-label="Your answer"
                placeholder={cloze ? 'Fill in the blank' : `Type the ${answerSide}`}
                autoComplete="off"
                disabled={typed !== null}
                value={draft}
                onChange={setDraft}
                onEnter={() => formRef.current?.requestSubmit()}
              />
              <button type="submit" className="primary" disabled={typed !== null || draft.trim() === ''}>
                Check <Shortcut keys="Enter" />
              </button>
            </form>
          )}
        </div>

        {showSheet && format === 'flashcards' && (
          <FeedbackSheet
            key={index}
            tone="neutral"
            summary={<strong>Did you know it?</strong>}
            actions={
              <>
                <button type="button" className="bad-outline" onClick={() => grade(false)}>
                  Didn't know <Shortcut keys="1" />
                </button>
                <button type="button" className="ok-outline" onClick={() => grade(true)}>
                  Knew it <Shortcut keys="2" />
                </button>
              </>
            }
            more={more}
          />
        )}

        {showSheet && format !== 'flashcards' && (
          <FeedbackSheet
            key={index}
            tone={ok ? 'ok' : 'bad'}
            summary={
              <>
                <strong className={ok ? 'ok' : 'bad'}>{ok ? 'Correct' : 'Incorrect'}</strong>
                {results[index]?.marked && (
                  <span className="marked-badge" title={`You selected "I was right" for this answer`}>
                    Marked by you
                  </span>
                )}
                <dl className="sheet-answers">
                  <dt>Answer</dt>
                  {/* Multiple choice already highlights the right answer above, so here it keeps to one line. */}
                  <dd className="with-thumb">
                    {thumb(answerImage)}
                    {format === 'choice' ? (
                      <span
                        className="is-clipped"
                        // The whole answer as a tooltip, only when it is cut off (checked on each hover).
                        onMouseEnter={(e) => {
                          const el = e.currentTarget
                          el.title = el.scrollWidth > el.clientWidth ? question.answer : ''
                        }}
                      >
                        {question.answer}
                      </span>
                    ) : (
                      <span>{question.answer}</span>
                    )}
                  </dd>
                  {typed !== null && (
                    <>
                      <dt>You typed</dt>
                      <dd className="muted">{typed}</dd>
                    </>
                  )}
                </dl>
                {mixUp && (
                  <p className="muted">
                    “{given}” is the {answerSide} of “{mixUp[promptSide]}”.
                  </p>
                )}
              </>
            }
            actions={
              <>
                {format === 'typing' && !ok && (
                  <button
                    type="button"
                    title="Count this answer as correct, for a typo or another right wording"
                    onClick={() => record({ ok: true, given: typed ?? '', marked: true })}
                  >
                    I was right
                  </button>
                )}
                <button type="button" className="primary" autoFocus onClick={next}>
                  Continue <Shortcut keys="Enter" />
                </button>
              </>
            }
            more={more}
          />
        )}
      </div>
      {cardDialog}
    </div>
  )
}
