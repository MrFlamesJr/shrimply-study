import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SIDE_IMAGE, isTermCard, type Card, type Format, type Question as QuestionData } from '../../model'
import { useKeydown } from '../../hooks/useKeydown'
import { checkAnswer } from '../../logic/checkAnswer'
import { orderCounts, pickCounts } from '../../logic/grade'
import { parseCloze } from '../../logic/cloze'
import { mixedUpBlank, mixedUpStep, mixedUpWith } from '../../logic/mixUp'
import { sideNames } from '../../logic/sides'
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
import { AnswerList, Mark, TypedAnswer } from './Answers'
import { Arrange } from './Arrange'
import { PickAll } from './PickAll'

// How a question went: right or not, what was picked, placed or typed (choice and typing), and whether "I was right"
// counted it as right (a "Marked by you" badge on the answer and in the results).
// A pick-all question also keeps its picks, so the sheet can say how many were wrong and how many were missed, and a
// sequence put in order the order it was put in, so the sheet can say how many steps were out of place.
export type Result = { ok: boolean; given?: string; marked?: boolean; picked?: string[] }

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
// A wheel step at least this big (px) is a mouse wheel's notch, which glides; a trackpad's small steps follow the fingers.
const WHEEL_NOTCH = 50
// A notch within this long (ms) of the last one adds to the glide still under way rather than starting from where it is.
const GLIDE_MS = 300
// The card side's scroll box: the prompt card's, or the flashcard face turned up.
const cardScroll = () =>
  document.querySelector<HTMLElement>('.prompt-card .card-scroll, .flip-face[aria-hidden="false"] .card-scroll')

/** One question and its feedback sheet. Render it with `key={index}`: its state starts fresh for each question. */
export function StudyQuestion({ question, card, format: asked, usable, result, paused, onRecord, onNext, onEdit }: Props) {
  // A question with fixed choices (true or false) has nothing to type, so typing asks it as multiple choice.
  const format = asked === 'typing' && question.choices ? 'choice' : asked
  // Flashcards: the card can flip back and forth; grading unlocks after the first flip.
  const [flipped, setFlipped] = useState(false)
  const [seen, setSeen] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [typed, setTyped] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)

  // The wheel anywhere on the card (its insides, label, pencil and edges) scrolls the card's insides while they can
  // still move that way, then the page as usual once they reach their end. Decided here for every step rather than
  // left to the browser, which can't be trusted with it: over the flashcard it may hand the wheel to the face stacked
  // behind the one turned up, and a gesture that began on the page sticks to the page, so the card wouldn't scroll.
  // A native listener, as React's onWheel can't prevent the default.
  useEffect(() => {
    const stack = stackRef.current!
    let glideTo: number | null = null
    let lastNotch = 0
    const onWheel = (e: WheelEvent) => {
      const box = cardScroll()
      if (!box || !(e.target as Element).closest('.card-wrap, .prompt-card')) return
      if (e.deltaY === 0 || !canScroll(box, e.deltaY > 0)) return
      e.preventDefault()
      const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? ARROW_STEP : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? box.clientHeight : 1
      const delta = e.deltaY * unit
      if (Math.abs(delta) < WHEEL_NOTCH || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        glideTo = null
        box.scrollBy({ top: delta })
        return
      }
      // A notch glides like the browser's own wheel scrolling, each one adding to where the glide is heading.
      if (e.timeStamp - lastNotch > GLIDE_MS) glideTo = null
      lastNotch = e.timeStamp
      glideTo = Math.min(Math.max((glideTo ?? box.scrollTop) + delta, 0), box.scrollHeight - box.clientHeight)
      box.scrollTo({ top: glideTo, behavior: 'smooth' })
    }
    stack.addEventListener('wheel', onWheel, { passive: false })
    return () => stack.removeEventListener('wheel', onWheel)
  }, [])

  // Several right answers are picked all at once, a sequence is put in order: both are checked with a button and
  // keep their own state (PickAll, Arrange), so the question is answered once there is a result.
  const arrange = format === 'choice' && question.arrange === true
  const pickAll = format === 'choice' && !arrange && !!question.choices && (question.answers?.length ?? 0) > 1
  const feedback = format === 'choice' ? (arrange || pickAll ? result !== undefined : picked !== null) : format === 'typing' ? typed !== null : false

  // The sheet takes its room at the bottom of the column: what was answered (choices, the checked order, the typed
  // answer) is scrolled into view above it when it would be hidden.
  useEffect(() => {
    if (!feedback) return
    const answered = [...stackRef.current!.querySelectorAll('.choices, .order-check, .typed')].pop()
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    answered?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [feedback])

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
      const box = cardScroll()
      const down = e.key === 'ArrowDown'
      if (box && canScroll(box, down)) {
        e.preventDefault()
        box.scrollBy({ top: down ? ARROW_STEP : -ARROW_STEP })
      }
    } else if (e.key === ' ') {
      if (format === 'flashcards' && !onButton) {
        e.preventDefault()
        flip()
      }
    } else if (format === 'flashcards' && seen && (e.key === '1' || e.key === '2')) {
      grade(e.key === '2')
    } else if (format === 'choice' && question.choices && !arrange && !pickAll && /^[1-9]$/.test(e.key)) {
      const choice = question.choices[Number(e.key) - 1]
      if (choice !== undefined) pick(choice)
    }
  })

  const ok = result?.ok
  const cloze = card?.type === 'cloze' && question.blank !== undefined ? { ...parseCloze(card.statement), blank: question.blank } : null
  const promptSide = question.side ?? 'definition'
  const answerSide = promptSide === 'term' ? 'definition' : 'term'
  const trueFalse = card?.type === 'true-false'
  const sequence = card?.type === 'sequence'
  // These cards (not term cards) have one image, which belongs to the statement, question or title: never to an answer.
  const plain = trueFalse || sequence || card?.type === 'choice'
  const names = sideNames(card && isTermCard(card) ? card : {})
  const multi = (question.answers?.length ?? 0) > 1
  const listed = !!question.answers && (multi || sequence)
  // The card's corner names what it is, as the editor does: a term card's side (each face its own), any other card its
  // kind. Typed one step at a time, a sequence keeps its title there too, as the question only names a step.
  const kindName = cloze
    ? 'Fill in the blank'
    : trueFalse
      ? 'True or false'
      : sequence
        ? question.step !== undefined
          ? `Sequence: ${card.title.trim()}`
          : 'Sequence'
        : card?.type === 'choice'
          ? 'Choice question'
          : undefined
  const frontLabel = kindName ?? names[promptSide]
  const backLabel = kindName ?? names[answerSide]
  // Under the card, in every mode: what to do, as briefly as it can be said. A term card names the side it asks for.
  const think = format === 'flashcards'
  const task = cloze ? (
    'Complete the statement'
  ) : trueFalse ? (
    'Is the statement true or false?'
  ) : sequence ? (
    question.step !== undefined ? (
      <>
        <strong>Item {question.step + 1}</strong> of {card.steps.filter((s) => s.trim()).length}
      </>
    ) : think ? (
      'Recall the correct order'
    ) : (
      'Arrange the items in the correct order'
    )
  ) : card?.type === 'choice' ? (
    multi ? (
      <>
        {think ? 'Recall' : 'Select'} <strong>all</strong> correct answers
      </>
    ) : think ? (
      'Recall the answer'
    ) : question.choices ? (
      'Select the correct answer'
    ) : (
      'Type the answer'
    )
  ) : (
    <>
      Looking for: <strong>{names[answerSide]}</strong>
    </>
  )
  // A side's image goes above its text. A fill-in-the-blank card has one image, shown on both sides; a true-or-false
  // card's image belongs to its statement, so its answer has none.
  const imageOf = (side: 'term' | 'definition') => (card && !isTermCard(card) ? card.image : card?.[SIDE_IMAGE[side]])
  const picture = (side: 'term' | 'definition') => {
    const src = imageOf(side)
    const text =
      card?.type === 'cloze' ? cloze?.text : card?.type === 'true-false' ? card.statement : card?.type === 'choice' ? card.question : card?.type === 'sequence' ? card.title : card?.[side]
    return src && <ZoomImage src={src} alt={text || (card && !isTermCard(card) ? 'Image for the card' : `${names[side]} image`)} className="card-img" hover={format === 'flashcards'} />
  }
  // Once answered, a blank's statement shows the blank filled in.
  const promptText = (
    <span className={textClass(question.prompt, imageOf(promptSide))}>
      {cloze ? <ClozeText text={cloze.text} ranges={cloze.ranges} mode={feedback ? 'reveal' : 'gap'} index={cloze.blank} /> : question.prompt}
    </span>
  )
  const answerText = (
    <span className={textClass(question.answer, plain ? undefined : imageOf(answerSide))}>
      {cloze ? <ClozeText text={cloze.text} ranges={cloze.ranges} mode="reveal" index={cloze.blank} /> : question.answer}
    </span>
  )
  const showSheet = format === 'flashcards' ? seen : feedback
  // In the sheet, a wrong answer that is right for another card, another blank or another step says which one, so the
  // two are not mixed up again.
  const given = format === 'choice' ? picked : typed
  const wrong = ok === false && given ? given : null
  const mixUp = wrong && !cloze && !plain ? mixedUpWith(wrong, answerSide, question.cardId, usable) : undefined
  const stepMixUp = wrong && sequence && question.step !== undefined ? mixedUpStep(wrong, card, question.step) : undefined
  const blankMixUp = wrong && cloze ? mixedUpBlank(wrong, question.cardId, cloze.blank, usable) : undefined
  const mixUpNote =
    stepMixUp !== undefined ? (
      `“${wrong}” is item ${stepMixUp + 1} of this sequence.`
    ) : mixUp ? (
      `“${wrong}” goes with “${mixUp[promptSide]}”.`
    ) : blankMixUp?.card.id === question.cardId ? (
      `“${wrong}” goes in another blank of this statement.`
    ) : blankMixUp ? (
      <>
        “{wrong}” goes in a blank of “
        <ClozeText {...parseCloze(blankMixUp.card.statement)} mode="reveal" index={blankMixUp.blank} />
        ”.
      </>
    ) : undefined
  // A wrong pick-all answer: how many picks were wrong, how many right answers were missed and how many were picked.
  const counts = pickAll && ok === false && result?.picked ? pickCounts(result.picked, question.answers!) : undefined
  // A wrong order: how many steps were out of place and how many were in it.
  const places = arrange && ok === false && result?.picked ? orderCounts(result.picked, question.answers!) : undefined
  const note = counts
    ? `${counts.wrong} wrong, ${counts.missed} missed, ${counts.correct} correct`
    : places
      ? `${places.wrong} in the wrong place, ${places.correct} correct`
      : mixUpNote

  // The sheet never repeats the answer: the question itself shows what was right and wrong.
  const explanation = (card?.type === 'cloze' ? card.explanation[question.blank ?? -1] : card?.explanation)?.trim()
  const answerImage = format !== 'flashcards' && !cloze && !plain ? imageOf(answerSide) : undefined
  // A choice's image: the answer's own, or that of the card the other answer comes from. A blank has none
  // (the card's image goes with its statement), nor has a true or false choice.
  const choiceImage = (choice: string) =>
    cloze || plain
      ? undefined
      : choice === question.answer
        ? answerImage
        : mixedUpWith(choice, answerSide, question.cardId, usable)?.[SIDE_IMAGE[answerSide]]


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
                  <span className="side-label muted">{frontLabel}</span>
                  <span className="card-scroll">
                    {picture(promptSide)}
                    {promptText}
                  </span>
                </>
              }
              back={
                <>
                  <span className="side-label muted">{backLabel}</span>
                  <span className="card-scroll">
                    {!plain && picture(answerSide)}
                    {listed ? (
                      <span className="prompt-text is-long">
                        <AnswerList items={question.answers!} />
                      </span>
                    ) : (
                      answerText
                    )}
                  </span>
                </>
              }
              edit={editButton}
            />
          ) : (
            <div className="prompt-card">
              <span className="side-label muted">{frontLabel}</span>
              <div className="card-scroll">
                {picture(promptSide)}
                {promptText}
              </div>
              {editButton}
            </div>
          )}

          {format === 'flashcards' ? (
            <p className="study-hint muted small">
              <span>{task}</span>
              <span className="study-flip">
                Click the card to flip it <Shortcut keys="Space" />
              </span>
            </p>
          ) : (
            <p className="study-hint muted small">
              <span>{task}</span>
            </p>
          )}

          {arrange && <Arrange question={question} result={result} paused={paused} onRecord={onRecord} />}
          {pickAll && <PickAll question={question} result={result} paused={paused} onRecord={onRecord} />}

          {format === 'choice' && question.choices && !arrange && !pickAll && (
            <div className="choices">
              {question.choices.map((choice, i) => {
                // Once picked: the right answer and a wrong pick are marked, the rest step back.
                const state = picked === null ? '' : choice === question.answer ? 'is-correct' : choice === picked ? 'is-wrong' : 'is-dim'
                return (
                  <button
                    key={i}
                    type="button"
                    className={`choice ${state}`}
                    disabled={picked !== null}
                    onClick={() => pick(choice)}
                  >
                    <span className="choice-key">{i + 1}</span>
                    <Thumb src={choiceImage(choice)} alt={choice || `${names[answerSide]} image`} hover />
                    {choice}
                    {state === 'is-correct' && <Mark ok label="Right answer" />}
                    {state === 'is-wrong' && <Mark ok={false} label="Your answer, wrong" />}
                  </button>
                )
              })}
            </div>
          )}

          {format === 'typing' &&
            (typed === null ? (
              <form ref={formRef} className="type-answer" onSubmit={check}>
                <AutoText
                  autoFocus
                  aria-label="Your answer"
                  placeholder={cloze ? 'Fill in the blank' : 'Type the answer'}
                  autoComplete="off"
                  value={draft}
                  onChange={setDraft}
                  onEnter={() => formRef.current?.requestSubmit()}
                />
                <button type="submit" className="primary" disabled={draft.trim() === ''}>
                  Check <Shortcut keys="Enter" />
                </button>
              </form>
            ) : (
              <TypedAnswer
                typed={typed}
                ok={ok === true}
                marked={result?.marked}
                answer={question.answer}
                answerImage={answerImage}
              />
            ))}
        </div>
      </div>

      {showSheet && (
        <FeedbackSheet
          tone={format === 'flashcards' ? 'neutral' : ok ? 'ok' : 'bad'}
          note={note}
          explanation={explanation}
          actions={
            format === 'flashcards' ? (
              <>
                <button type="button" className="bad-outline" onClick={() => grade(false)}>
                  Didn't know <Shortcut keys="1" />
                </button>
                <button type="button" className="ok-outline" onClick={() => grade(true)}>
                  Knew it <Shortcut keys="2" />
                </button>
              </>
            ) : (
              <>
                {format === 'typing' && !ok && (
                  <button
                    type="button"
                    title="Count this answer as correct, for a typo or another correct wording"
                    onClick={() => onRecord({ ok: true, given: typed ?? '', marked: true })}
                  >
                    I was right
                  </button>
                )}
                <button type="button" className="primary" autoFocus onClick={next}>
                  Continue <Shortcut keys="Enter" />
                </button>
              </>
            )
          }
          leaving={leaving}
          onLeft={onNext}
        />
      )}
    </div>
  )
}
