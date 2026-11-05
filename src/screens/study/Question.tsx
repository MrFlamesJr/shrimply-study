import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SIDE_IMAGE, type Card, type Format, type Question as QuestionData } from '../../model'
import { useKeydown } from '../../hooks/useKeydown'
import { checkAnswer } from '../../logic/checkAnswer'
import { parseCloze } from '../../logic/cloze'
import { mixedUpBlank, mixedUpWith } from '../../logic/mixUp'
import { canScroll } from '../../logic/canScroll'
import { AutoText } from '../../components/AutoText'
import { ClozeText } from '../../components/ClozeText'
import { FeedbackSheet } from '../../components/FeedbackSheet'
import { Shortcut } from '../../components/Shortcut'
import { IconButton } from '../../components/IconButton'
import { Thumb } from '../../components/Thumb'
import { ZoomImage } from '../../components/ZoomImage'
import { PencilIcon } from '../../components/Icons'
import { FlipCard } from './FlipCard'
import { AnswerSummary, MoreInfo } from './SheetContent'

// How a question went: right or not, what was picked or typed (choice and typing), and whether "I was right"
// counted it as right (a "Marked by you" badge on the answer and in the results).
export type Result = { ok: boolean; given?: string; marked?: boolean }

type Props = {
  question: QuestionData
  card: Card | undefined
  format: Format
  usable: Card[]
  result: Result | undefined
  // The card dialog is open: the session's keys stand still.
  paused: boolean
  onRecord: (result: Result) => void
  onNext: () => void
  onEdit: (cardId: string) => void
}

// Longer card text gets the smaller, left-aligned paragraph style.
const LONG_TEXT = 150
// A side with an image has about half the room for its text, so its text counts as long at half the length.
const textClass = (text: string, image?: string) =>
  text.length > (image ? LONG_TEXT / 2 : LONG_TEXT) ? 'prompt-text is-long' : 'prompt-text'
// How far one arrow key press (or one line of a wheel that scrolls by lines) scrolls a long card side, in px.
const ARROW_STEP = 40
// The card side's text that scrolls: the prompt card's, or the flashcard face turned up.
const cardText = () =>
  document.querySelector<HTMLElement>('.prompt-card .prompt-text, .flip-face[aria-hidden="false"] .prompt-text')

/** One question and its feedback sheet. Render it with `key={index}`: its state starts fresh for each question. */
export function StudyQuestion({ question, card, format, usable, result, paused, onRecord, onNext, onEdit }: Props) {
  // Flashcards: the card can flip back and forth; grading unlocks after the first flip.
  const [flipped, setFlipped] = useState(false)
  const [seen, setSeen] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [typed, setTyped] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)

  // The wheel anywhere on the card (its edges, image, label, pencil) scrolls its long text, like right over the
  // text: first the text, then the page as usual. A native listener, as React's onWheel can't prevent the default.
  useEffect(() => {
    const stack = stackRef.current!
    const onWheel = (e: WheelEvent) => {
      const text = cardText()
      const target = e.target as Element
      if (!text || text.contains(target) || !target.closest('.card-wrap, .prompt-card')) return
      if (e.deltaY === 0 || !canScroll(text, e.deltaY > 0)) return
      e.preventDefault()
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? ARROW_STEP : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? text.clientHeight : 1
      text.scrollBy({ top: e.deltaY * unit })
    }
    stack.addEventListener('wheel', onWheel, { passive: false })
    return () => stack.removeEventListener('wheel', onWheel)
  }, [])

  const feedback = format === 'choice' ? picked !== null : format === 'typing' ? typed !== null : false

  const flip = () => {
    setFlipped((f) => !f)
    setSeen(true)
  }

  // Going on: the sheet slides out first, then calls onNext.
  const [leaving, setLeaving] = useState(false)
  const next = () => setLeaving(true)

  const grade = (ok: boolean) => {
    if (leaving) return
    onRecord({ ok })
    next()
  }

  const pick = (choice: string) => {
    if (picked !== null) return
    setPicked(choice)
    onRecord({ ok: choice === question.answer, given: choice })
  }

  const check = (e: FormEvent) => {
    e.preventDefault()
    // No answer is ever empty (a card needs both sides, a blank needs text), so an empty field can't be checked.
    if (typed !== null || draft.trim() === '') return
    setTyped(draft)
    onRecord({ ok: checkAnswer(draft, question.answer), given: draft })
  }

  useKeydown((e) => {
    // A dialog (the card editor, the image viewer) handles its own keys.
    const target = e.target as HTMLElement
    if (paused || target.closest('dialog')) return
    const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    const onButton = target instanceof HTMLButtonElement
    // A field that already handled the key (Enter in the answer box submits) prevents its default.
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
    if (e.key === 'Enter') {
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
      const text = cardText()
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
  })

  const ok = result?.ok
  const cloze = card?.type === 'cloze' && question.blank !== undefined ? { ...parseCloze(card.statement), blank: question.blank } : null
  const promptSide = question.side ?? 'definition'
  const answerSide = promptSide === 'term' ? 'definition' : 'term'
  const sideLabel = cloze ? 'Fill in the blank' : promptSide === 'term' ? 'Term' : 'Definition'
  // A side's image goes above its text. A fill-in-the-blank card has one image, shown on both sides.
  const imageOf = (side: 'term' | 'definition') => (card?.type === 'cloze' ? card.image : card?.[SIDE_IMAGE[side]])
  const picture = (side: 'term' | 'definition') => {
    const src = imageOf(side)
    const text = card?.type === 'cloze' ? cloze?.text : card?.[side]
    return src && <ZoomImage src={src} alt={text || (card?.type === 'cloze' ? 'Image for the card' : `Image for the ${side}`)} className="card-img" hover={format === 'flashcards'} />
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
  const showSheet = format === 'flashcards' ? seen : feedback
  // A wrong answer that is right for another card, or another blank, says which one, so the two are not mixed up again.
  const given = format === 'choice' ? picked : typed
  const wrong = ok === false && given ? given : null
  const mixUp = wrong && !cloze ? mixedUpWith(wrong, answerSide, question.cardId, usable) : undefined
  const blankMixUp = wrong && cloze ? mixedUpBlank(wrong, question.cardId, cloze.blank, usable) : undefined
  const mixUpNote = mixUp ? (
    `“${wrong}” is the ${answerSide} of “${mixUp[promptSide]}”.`
  ) : blankMixUp?.card.id === question.cardId ? (
    `“${wrong}” goes in another blank of this statement.`
  ) : blankMixUp ? (
    <>
      “{wrong}” goes in a blank of “
      <ClozeText {...parseCloze(blankMixUp.card.statement)} mode="reveal" index={blankMixUp.blank} />
      ”.
    </>
  ) : undefined

  // The sheet only opens for more info when the card has an explanation, or (choice and typing) a blank's statement.
  // The answer's image is not repeated there: its preview next to the answer already opens it big.
  const explanation = (card?.type === 'cloze' ? card.explanation[question.blank ?? -1] : card?.explanation)?.trim()
  const answerImage = format !== 'flashcards' && !cloze ? imageOf(answerSide) : undefined
  // A choice's image: the answer's own, or that of the card the other answer comes from. A blank has none
  // (the card's image goes with its statement).
  const choiceImage = (choice: string) =>
    cloze
      ? undefined
      : choice === question.answer
        ? answerImage
        : mixedUpWith(choice, answerSide, question.cardId, usable)?.[SIDE_IMAGE[answerSide]]
  // Choice and typing show the whole statement afterwards; a flashcard's back already does.
  const statement =
    cloze && format !== 'flashcards'
      ? {
          image: imageOf('term'),
          alt: cloze.text,
          text: <ClozeText text={cloze.text} ranges={cloze.ranges} mode="reveal" index={cloze.blank} />,
        }
      : undefined
  const more =
    explanation || statement ? (
      <MoreInfo explanation={explanation} statement={statement} />
    ) : undefined

  const editButton = (
    <IconButton label="Edit this card" className="card-edit" onClick={() => onEdit(question.cardId)}>
      <PencilIcon />
    </IconButton>
  )

  return (
    <div className="session-main">
      <div className="session-body">
        <div ref={stackRef} className="session-stack">
          {format === 'flashcards' ? (
            <FlipCard
              flipped={flipped}
              onFlip={flip}
              front={
                <>
                  <span className="side-label muted">{sideLabel}</span>
                  {picture(promptSide)}
                  {promptText}
                </>
              }
              back={
                <>
                  <span className="side-label muted">{cloze ? sideLabel : sideLabel === 'Term' ? 'Definition' : 'Term'}</span>
                  {picture(answerSide)}
                  {answerText}
                </>
              }
              edit={editButton}
            />
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
                  <Thumb src={choiceImage(choice)} alt={choice || `Image for the ${answerSide}`} hover />
                  {choice}
                </button>
              ))}
            </div>
          )}

          {format === 'typing' && (
            // After Check the answer stays in view, locked: the field and the button are disabled.
            <form ref={formRef} className="type-answer" onSubmit={check}>
              <AutoText
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
      </div>

      {showSheet && format === 'flashcards' && (
        <FeedbackSheet
          tone="neutral"
          summary={<strong>Did you know it?</strong>}
          actions={
            <>
              <button type="button" className="bad-outline grade" onClick={() => grade(false)}>
                Didn't know <Shortcut keys="1" />
              </button>
              <button type="button" className="ok-outline grade" onClick={() => grade(true)}>
                Knew it <Shortcut keys="2" />
              </button>
            </>
          }
          more={more}
          leaving={leaving}
          onLeft={onNext}
        />
      )}

      {showSheet && format !== 'flashcards' && (
        <FeedbackSheet
          tone={ok ? 'ok' : 'bad'}
          summary={
            <AnswerSummary
              ok={ok}
              marked={result?.marked}
              format={format}
              answer={question.answer}
              answerImage={answerImage}
              typed={typed}
              mixUp={mixUpNote}
            />
          }
          actions={
            <>
              {format === 'typing' && !ok && (
                <button
                  type="button"
                  title="Count this answer as correct, for a typo or another right wording"
                  onClick={() => onRecord({ ok: true, given: typed ?? '', marked: true })}
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
          leaving={leaving}
          onLeft={onNext}
        />
      )}
    </div>
  )
}
