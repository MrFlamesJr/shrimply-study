import type { Card, Group } from '../model'
import { parseCloze } from './cloze'

/** True when the card has nothing in it: no text (sides, explanation, or statement) and no image. */
export function isBlank(card: Card): boolean {
  if (card.type === 'cloze') return !card.statement.trim() && !card.image
  if (card.type === 'true-false') return !card.statement.trim() && !card.image && !card.explanation?.trim()
  if (card.type === 'choice') {
    return !card.question.trim() && !card.image && !card.explanation?.trim() && [...card.right, ...card.wrong].every((t) => !t.trim())
  }
  if (card.type === 'sequence') return !card.title.trim() && !card.image && !card.explanation?.trim() && card.steps.every((t) => !t.trim())
  return !card.term.trim() && !card.definition.trim() && !card.explanation?.trim() && !card.termImage && !card.definitionImage
}

/**
 * What a half-filled card still needs, otherwise null: a side's text when only one is filled (a card with only
 * an explanation or images is missing its term; an image never stands in for text), or a blank for a statement
 * (or image) without any, or a statement's text when a true-or-false card has an image or explanation only.
 */
export function missingPart(
  card: Card,
): 'term' | 'definition' | 'blank' | 'statement' | 'question' | 'right' | 'wrong' | 'title' | 'steps' | null {
  if (card.type === 'cloze') return !isBlank(card) && parseCloze(card.statement).ranges.length === 0 ? 'blank' : null
  if (card.type === 'true-false') return !isBlank(card) && !card.statement.trim() ? 'statement' : null
  if (card.type === 'choice') {
    if (isBlank(card)) return null
    if (!card.question.trim()) return 'question'
    if (!card.right.some((t) => t.trim())) return 'right'
    return card.wrong.some((t) => t.trim()) ? null : 'wrong'
  }
  if (card.type === 'sequence') {
    if (isBlank(card)) return null
    if (!card.title.trim()) return 'title'
    return card.steps.filter((t) => t.trim()).length >= 2 ? null : 'steps'
  }
  const hasTerm = card.term.trim() !== ''
  const hasDefinition = card.definition.trim() !== ''
  if (hasTerm && hasDefinition) return null
  if (!hasTerm && !hasDefinition) return isBlank(card) ? null : 'term'
  return hasTerm ? 'definition' : 'term'
}

// The entries trimmed, empty ones dropped; the same array when nothing changes.
const tidyList = (items: string[]): string[] => {
  const tidy = items.map((t) => t.trim()).filter(Boolean)
  return tidy.length === items.length && tidy.every((t, i) => t === items[i]) ? items : tidy
}

/** The card with its text trimmed and an empty explanation closed; the same object when nothing changes. */
export function tidyCard(card: Card): Card {
  if (card.type === 'cloze') {
    const statement = card.statement.trim()
    const explanation = card.explanation.map((x) => x?.trim() || null)
    const same = statement === card.statement && explanation.every((x, i) => x === card.explanation[i])
    return same ? card : { ...card, statement, explanation }
  }
  if (card.type === 'true-false') {
    const statement = card.statement.trim()
    const explanation = card.explanation?.trim() || undefined
    if (statement === card.statement && explanation === card.explanation) return card
    return { ...card, statement, explanation }
  }
  if (card.type === 'choice') {
    const question = card.question.trim()
    const right = tidyList(card.right)
    const wrong = tidyList(card.wrong)
    const explanation = card.explanation?.trim() || undefined
    if (question === card.question && right === card.right && wrong === card.wrong && explanation === card.explanation) return card
    return { ...card, question, right, wrong, explanation }
  }
  if (card.type === 'sequence') {
    const title = card.title.trim()
    const steps = tidyList(card.steps)
    const explanation = card.explanation?.trim() || undefined
    if (title === card.title && steps === card.steps && explanation === card.explanation) return card
    return { ...card, title, steps, explanation }
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

// How a missing part reads after "needs a"; the others read as they are.
const PHRASES: Record<string, string> = {
  term: 'front',
  definition: 'back',
  right: 'right answer',
  wrong: 'wrong answer',
  steps: 'two steps',
}

/**
 * Names the half-filled cards by their number in the list, or null when there are none:
 * "Card #2 needs a back.", "Cards #2 and #5 need a front, back or blank."
 */
export function unfinishedMessage(cards: Card[]): string | null {
  const bad = cards.flatMap((card, i) => {
    const part = missingPart(card)
    return part ? [{ num: `#${i + 1}`, part: PHRASES[part] ?? part }] : []
  })
  if (bad.length === 0) return null
  // "two steps" takes no "a"; it is the last part named, so it only starts the sentence when it is the only one.
  const needs = (named: string) => (named === 'two steps' ? named : `a ${named}`)
  if (bad.length === 1) return `Card ${bad[0].num} needs ${needs(bad[0].part)}.`
  const nums = bad.map((b) => b.num)
  const list =
    nums.length > MAX_LISTED
      ? `${nums.slice(0, MAX_LISTED).join(', ')} and ${nums.length - MAX_LISTED} more`
      : `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`
  // A half-filled term card makes both its sides the ones to fill; a blank and a statement are named only when missing.
  const sides = bad.some((b) => b.part === 'front' || b.part === 'back')
  const others = ['blank', 'statement', 'question', 'right answer', 'wrong answer', 'title', 'two steps']
  const parts = [...(sides ? ['front', 'back'] : []), ...others.filter((part) => bad.some((b) => b.part === part))]
  const named = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} or ${parts.at(-1)}`
  return `Cards ${list} need ${needs(named)}.`
}
