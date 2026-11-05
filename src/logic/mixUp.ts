import type { Card, TermCard } from '../model'
import { usableCards } from './buildRound'
import { checkAnswer } from './checkAnswer'

/** The other usable term card whose `answerSide` matches a wrong answer, so feedback can say what that answer belongs to. */
export function mixedUpWith(given: string, answerSide: 'term' | 'definition', cardId: string, cards: Card[]): TermCard | undefined {
  if (!given.trim()) return undefined
  return usableCards(cards)
    .filter((c): c is TermCard => c.type !== 'cloze')
    .find((c) => c.id !== cardId && checkAnswer(given, c[answerSide]))
}
