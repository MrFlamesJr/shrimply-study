import type { Card } from '../model'
import { parseCloze } from './cloze'

/** True when the card has nothing in it: no text (sides, explanation, or statement) and no image. */
export function isBlank(card: Card): boolean {
  if (card.type === 'cloze') return !card.statement.trim() && !card.image
  return !card.term.trim() && !card.definition.trim() && !card.explanation?.trim() && !card.termImage && !card.definitionImage
}

/**
 * What a half-filled card still needs, otherwise null: a side's text when only one is filled (a card with only
 * an explanation or images is missing its term; an image never stands in for text), or a blank for a statement
 * (or image) without any.
 */
export function missingPart(card: Card): 'term' | 'definition' | 'blank' | null {
  if (card.type === 'cloze') return !isBlank(card) && parseCloze(card.statement).ranges.length === 0 ? 'blank' : null
  const hasTerm = card.term.trim() !== ''
  const hasDefinition = card.definition.trim() !== ''
  if (hasTerm && hasDefinition) return null
  if (!hasTerm && !hasDefinition) return isBlank(card) ? null : 'term'
  return hasTerm ? 'definition' : 'term'
}

const MAX_LISTED = 5

/**
 * Names the half-filled cards by their number in the list, or null when there are none:
 * "Card #2 needs a definition.", "Cards #2 and #5 need a term, definition or blank."
 */
export function unfinishedMessage(cards: Card[]): string | null {
  const bad = cards.flatMap((card, i) => {
    const part = missingPart(card)
    return part ? [{ num: `#${i + 1}`, part }] : []
  })
  if (bad.length === 0) return null
  if (bad.length === 1) return `Card ${bad[0].num} needs a ${bad[0].part}.`
  const nums = bad.map((b) => b.num)
  const list =
    nums.length > MAX_LISTED
      ? `${nums.slice(0, MAX_LISTED).join(', ')} and ${nums.length - MAX_LISTED} more`
      : `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`
  const parts = bad.some((b) => b.part === 'blank') ? 'term, definition or blank' : 'term or definition'
  return `Cards ${list} need a ${parts}.`
}
