import { isTermCard, type Card, type ChoiceCard, type Question, type SequenceCard, type StudyOptions, type TrueFalseCard } from '../model'
import { sameAnswer } from './checkAnswer'
import { blankAnswers, clozeQuestion, parseCloze } from './cloze'

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// The non-empty entries of a list, trimmed.
const filled = (items: string[]): string[] => items.map((t) => t.trim()).filter(Boolean)

// A choice card's right answers and all its options, each once: an answer typed twice is one option, not a pick-all.
function choiceOptions(card: ChoiceCard): { right: string[]; options: string[] } {
  const right = [...new Set(filled(card.right))]
  return { right, options: [...new Set([...right, ...filled(card.wrong)])] }
}

/**
 * Cards that can be asked: a term and a definition (after trimming), a statement with at least one blank, a
 * true-or-false statement, a choice question with a right and a wrong answer, or a sequence of two steps.
 */
export function usableCards(cards: Card[]): Card[] {
  return cards.filter((card) => {
    if (card.type === 'cloze') return parseCloze(card.statement).ranges.length > 0
    if (card.type === 'true-false') return card.statement.trim() !== ''
    if (card.type === 'choice') return card.question.trim() !== '' && filled(card.right).length > 0 && filled(card.wrong).length > 0
    if (card.type === 'sequence') return card.title.trim() !== '' && filled(card.steps).length >= 2
    return card.term.trim() && card.definition.trim()
  })
}

/**
 * Can these usable cards be asked as multiple choice: two or more cards give each other wrong answers, and a true or
 * false card, a choice question or a sequence brings its own options, so one of those is enough.
 */
export const canChoose = (usable: Card[]): boolean =>
  usable.length >= 2 || usable.some((c) => c.type === 'true-false' || c.type === 'choice' || c.type === 'sequence')

const numbered = (steps: string[]): string => steps.map((s, i) => `${i + 1}. ${s}`).join(' ')

/** A choice question: its own answers only. One right answer is picked (or typed); several are all picked. */
function choiceQuestion(card: ChoiceCard, format: StudyOptions['format']): Question {
  const { right, options } = choiceOptions(card)
  const question: Question = { cardId: card.id, prompt: card.question.trim(), answer: right.join(', ') }
  if (right.length > 1) return { ...question, answers: right, ...(format !== 'flashcards' && { choices: shuffled(options) }) }
  return format === 'choice' ? { ...question, choices: shuffled(options) } : question
}

/** A sequence asked as a whole: flashcards show the steps, multiple choice has them put in order (shuffled, never in order). */
function sequenceQuestion(card: SequenceCard, format: StudyOptions['format']): Question {
  const steps = filled(card.steps)
  const question: Question = { cardId: card.id, prompt: card.title.trim(), answer: numbered(steps), answers: steps }
  if (format !== 'choice') return question
  const mixed = (): string[] => {
    let order = shuffled(steps)
    while (new Set(steps).size > 1 && order.every((s, i) => s === steps[i])) order = shuffled(steps)
    return order
  }
  return { ...question, arrange: true, choices: mixed() }
}

/** One typing question per step: what comes first, then what comes after the step before. */
function stepQuestion(card: SequenceCard, steps: string[], i: number): Question {
  return {
    cardId: card.id,
    prompt: i === 0 ? 'What comes first?' : `What comes after “${steps[i - 1]}”?`,
    answer: steps[i],
    step: i,
  }
}

const trueFalseQuestion = (card: TrueFalseCard): Question => ({
  cardId: card.id,
  prompt: card.statement.trim(),
  answer: card.answer ? 'True' : 'False',
  choices: ['True', 'False'],
})

const dedupe = (kept: string[], a: string): string[] => (kept.some((k) => sameAnswer(k, a)) ? kept : [...kept, a])

/** The choices with the old answer swapped for the new one, minus any that now read the same as it. */
function swapAnswer(choices: string[] | undefined, old: string, fresh: string): string[] | undefined {
  const swapped = choices?.map((c) => (c === old ? fresh : c))
  return swapped?.filter((c) => c === fresh || !sameAnswer(c, fresh)).reduce(dedupe, [])
}

/** Adds the answer plus up to 3 other answers from `pool`, the card's own group first. */
function withChoices(question: Question, card: Card, pool: Card[], answersOf: (c: Card) => string[]): Question {
  const answers = (from: Card[]) => [...new Set(from.flatMap(answersOf))]
  const inGroup = card.group ? answers(pool.filter((c) => c.group === card.group)) : []
  const distractors = [...new Set([...shuffled(inGroup), ...shuffled(answers(pool))])]
    .filter((a) => !sameAnswer(a, question.answer))
    .reduce(dedupe, [])
    .slice(0, 3)
  return { ...question, choices: shuffled([question.answer, ...distractors]) }
}

/** The new options in the old order: the ones still there first, then the added ones. */
function keepOrder(old: string[] | undefined, options: string[]): string[] {
  const kept = (old ?? []).filter((o) => options.includes(o))
  return [...kept, ...options.filter((o) => !kept.includes(o))]
}

/** The round's questions after `edited` changed: its questions show the new text, and choices swap the old answer for the new one. */
export function refreshQuestions(questions: Question[], edited: Card): Question[] {
  return questions.map((q) => {
    if (q.cardId !== edited.id) return q
    if (edited.type === 'cloze') {
      const { text, ranges } = parseCloze(edited.statement)
      if (q.blank === undefined || q.blank >= ranges.length) return q
      const fresh = clozeQuestion(text, ranges, q.blank)
      return { ...q, ...fresh, choices: swapAnswer(q.choices, q.answer, fresh.answer) }
    }
    if (edited.type === 'true-false') return trueFalseQuestion(edited)
    if (edited.type === 'choice') {
      const { right, options } = choiceOptions(edited)
      const fresh: Question = { cardId: q.cardId, prompt: edited.question.trim(), answer: right.join(', ') }
      // A question that was a list (or a pick) keeps its option order; a question with a single right answer typed stays typed.
      if (right.length > 1) return { ...fresh, answers: right, choices: q.choices ? keepOrder(q.choices, options) : shuffled(options) }
      return q.choices ? { ...fresh, choices: keepOrder(q.choices, options) } : fresh
    }
    if (edited.type === 'sequence') {
      const steps = filled(edited.steps)
      if (q.step !== undefined) return q.step < steps.length ? stepQuestion(edited, steps, q.step) : q
      const fresh: Question = { cardId: q.cardId, prompt: edited.title.trim(), answer: numbered(steps), answers: steps }
      return q.arrange ? { ...fresh, arrange: true, choices: keepOrder(q.choices, steps) } : fresh
    }
    if (!q.side) return q
    const answer = edited[q.side === 'term' ? 'definition' : 'term'].trim()
    return { ...q, prompt: edited[q.side].trim(), answer, choices: swapAnswer(q.choices, q.answer, answer) }
  })
}

/**
 * Builds one question per usable term or true-or-false card and one per blank of each usable fill-in-the-blank card.
 * Multiple-choice distractors come from `pool` (defaults to `cards`): other cards' answers on the same side
 * for term cards, other blanks' answers for blanks.
 */
export function buildRound(cards: Card[], options: StudyOptions, pool: Card[] = cards): Question[] {
  const usablePool = usableCards(pool)
  const answersById = new Map(
    usablePool.flatMap((c): [string, string[]][] => (c.type === 'cloze' ? [[c.id, blankAnswers(c.statement)]] : [])),
  )
  const choice = options.format === 'choice'

  const questions = usableCards(cards).flatMap((card): Question[] => {
    if (card.type === 'cloze') {
      const { text, ranges } = parseCloze(card.statement)
      return ranges.map((_, i) => {
        const question = { cardId: card.id, ...clozeQuestion(text, ranges, i), blank: i }
        return choice ? withChoices(question, card, usablePool, (c) => answersById.get(c.id) ?? []) : question
      })
    }
    if (card.type === 'true-false') return [trueFalseQuestion(card)]
    if (card.type === 'choice') return [choiceQuestion(card, options.format)]
    if (card.type === 'sequence') {
      if (options.format !== 'typing') return [sequenceQuestion(card, options.format)]
      const steps = filled(card.steps)
      return steps.map((_, i) => stepQuestion(card, steps, i))
    }
    const side = options.side === 'mixed' ? (Math.random() < 0.5 ? 'term' : 'definition') : options.side
    const [promptSide, answerSide] =
      side === 'term' ? (['term', 'definition'] as const) : (['definition', 'term'] as const)
    const question: Question = { cardId: card.id, prompt: card[promptSide].trim(), answer: card[answerSide].trim(), side: promptSide }
    if (!choice) return [question]
    return [withChoices(question, card, usablePool, (c) => (isTermCard(c) && c.id !== card.id ? [c[answerSide].trim()] : []))]
  })

  return options.shuffle ? shuffled(questions) : questions
}
