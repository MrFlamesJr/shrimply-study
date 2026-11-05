import type { Card, Question, StudyOptions } from '../model'
import { clozeQuestion, parseCloze } from './cloze'

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

/** The answer of each blank of a fill-in-the-blank card. */
function blankAnswers(statement: string): string[] {
  const { text, ranges } = parseCloze(statement)
  return ranges.map((_, i) => clozeQuestion(text, ranges, i).answer)
}

/** Adds the answer plus up to 3 other answers from `pool`, the card's own group first. */
function withChoices(question: Question, card: Card, pool: Card[], answersOf: (c: Card) => string[]): Question {
  const answers = (from: Card[]) => [...new Set(from.flatMap(answersOf))]
  const inGroup = card.group ? answers(pool.filter((c) => c.group === card.group)) : []
  const distractors = [...new Set([...shuffled(inGroup), ...shuffled(answers(pool))])]
    .filter((a) => a !== question.answer)
    .slice(0, 3)
  return { ...question, choices: shuffled([question.answer, ...distractors]) }
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
    const question = { cardId: card.id, prompt: card[promptSide].trim(), answer: card[answerSide].trim() }
    if (!choice) return [question]
    return [withChoices(question, card, usablePool, (c) => (c.type !== 'cloze' && c.id !== card.id ? [c[answerSide].trim()] : []))]
  })

  return options.shuffle ? shuffled(questions) : questions
}
