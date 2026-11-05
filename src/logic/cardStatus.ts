import type { Card, Group } from '../model'
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

/** The card with its text trimmed and an empty explanation closed; the same object when nothing changes. */
export function tidyCard(card: Card): Card {
  if (card.type === 'cloze') {
    const statement = card.statement.trim()
    const explanation = card.explanation.map((x) => x?.trim() || null)
    const same = statement === card.statement && explanation.every((x, i) => x === card.explanation[i])
    return same ? card : { ...card, statement, explanation }
  }
  const term = card.term.trim()
  const definition = card.definition.trim()
  const explanation = card.explanation?.trim() || undefined
  if (term === card.term && definition === card.definition && explanation === card.explanation) return card
  return { ...card, term, definition, explanation }
}

/** True when every field is equal (lists element by element). */
export function sameCard(a: Card, b: Card): boolean {
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].every((key) => {
    const [p, q] = [x[key], y[key]]
    return Array.isArray(p) && Array.isArray(q) ? p.length === q.length && p.every((v, i) => v === q[i]) : p === q
  })
}

/** Blank cards dropped, the rest tidied, groups left without cards dropped. `changed` when any of that happened. */
export function tidyCards(cards: Card[], groups: Group[]): { cards: Card[]; groups: Group[]; changed: boolean } {
  const kept = cards.filter((c) => !isBlank(c)).map(tidyCard)
  const keptGroups = groups.filter((g) => kept.some((c) => c.group === g.id))
  const changed = kept.length !== cards.length || keptGroups.length !== groups.length || kept.some((c, i) => c !== cards[i])
  return { cards: kept, groups: keptGroups, changed }
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
