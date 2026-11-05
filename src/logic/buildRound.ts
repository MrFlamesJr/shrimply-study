import type { Card, Question, StudyOptions } from '../model'
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

/** Cards that can be asked: a term and a definition (after trimming), or a statement with at least one blank. */
export function usableCards(cards: Card[]): Card[] {
  return cards.filter((card) =>
    card.type === 'cloze' ? parseCloze(card.statement).ranges.length > 0 : card.term.trim() && card.definition.trim(),
  )
}

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
    if (!q.side) return q
    const answer = edited[q.side === 'term' ? 'definition' : 'term'].trim()
    return { ...q, prompt: edited[q.side].trim(), answer, choices: swapAnswer(q.choices, q.answer, answer) }
  })
}

/**
 * Builds one question per usable term card and one per blank of each usable fill-in-the-blank card.
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
    const side = options.side === 'mixed' ? (Math.random() < 0.5 ? 'term' : 'definition') : options.side
    const [promptSide, answerSide] =
      side === 'term' ? (['term', 'definition'] as const) : (['definition', 'term'] as const)
    const question: Question = { cardId: card.id, prompt: card[promptSide].trim(), answer: card[answerSide].trim(), side: promptSide }
    if (!choice) return [question]
    return [withChoices(question, card, usablePool, (c) => (c.type !== 'cloze' && c.id !== card.id ? [c[answerSide].trim()] : []))]
  })

  return options.shuffle ? shuffled(questions) : questions
}
