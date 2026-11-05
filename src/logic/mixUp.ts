import type { Card, ClozeCard, TermCard } from '../model'
import { usableCards } from './buildRound'
import { checkAnswer } from './checkAnswer'
import { blankAnswers } from './cloze'

/** The other usable term card whose `answerSide` matches a wrong answer, so feedback can say what that answer belongs to. */
export function mixedUpWith(given: string, answerSide: 'term' | 'definition', cardId: string, cards: Card[]): TermCard | undefined {
  if (!given.trim()) return undefined
  return usableCards(cards)
    .filter((c): c is TermCard => c.type !== 'cloze')
    .find((c) => c.id !== cardId && checkAnswer(given, c[answerSide]))
}

/**
 * The blank a wrong answer to blank `blank` of card `cardId` belongs to: another blank of the same card first,
 * then a blank of another usable card.
 */
export function mixedUpBlank(given: string, cardId: string, blank: number, cards: Card[]): { card: ClozeCard; blank: number } | undefined {
  if (!given.trim()) return undefined
  const cloze = usableCards(cards).filter((c): c is ClozeCard => c.type === 'cloze')
  for (const card of [...cloze.filter((c) => c.id === cardId), ...cloze.filter((c) => c.id !== cardId)]) {
    const i = blankAnswers(card.statement).findIndex((a, j) => !(card.id === cardId && j === blank) && checkAnswer(given, a))
    if (i >= 0) return { card, blank: i }
  }
  return undefined
}
