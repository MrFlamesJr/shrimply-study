import { isTermCard, type Card, type Group } from '../model'
import { parseCloze } from './cloze'
import { isCut, quoteName } from './toastText'

/**
 * The text a card is named by, in the Explorer and in toasts: a term card's term (its definition when the term is
 * empty), a blank statement's text, a statement, a question or a title, with whitespace runs made one space; '' when none.
 */
export function cardName(card: Card): string {
  const first = (text: string) => text.replace(/\s+/g, ' ').trim()
  if (isTermCard(card)) return first(card.term) || first(card.definition)
  if (card.type === 'cloze') return first(parseCloze(card.statement).text)
  if (card.type === 'true-false') return first(card.statement)
  if (card.type === 'choice') return first(card.question)
  return first(card.title)
}

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

const MAX_LISTED = 10

// How a missing part reads after "needs a"; the others read as they are.
const PHRASES: Record<string, string> = {
  term: 'front',
  definition: 'back',
  right: 'correct answer',
  wrong: 'wrong answer',
  steps: 'two steps',
}

/**
 * What to say about the half-filled cards, or null when there are none. The text names one card by its name (a
 * card with no text yet by its number, as it has nothing else to go by): `"Mitochondria" needs a back.`,
 * `Card #2 needs a front.`; several are counted: `3 cards need a front or back.` The detail has the rest: the full
 * name when it was cut, and for several, where to look and one line per card (at most MAX_LISTED).
 */
export function unfinishedMessage(cards: Card[]): { text: string; detail: string[] } | null {
  const bad = cards.flatMap((card, i) => {
    const part = missingPart(card)
    return part ? [{ num: i + 1, name: cardName(card), part: PHRASES[part] ?? part }] : []
  })
  if (bad.length === 0) return null
  // "two steps" takes no "a"; it is the last part named, so it only starts the sentence when it is the only one.
  const needs = (named: string) => (named === 'two steps' ? named : `a ${named}`)
  if (bad.length === 1) {
    const [only] = bad
    if (!only.name) return { text: `Card #${only.num} needs ${needs(only.part)}.`, detail: [] }
    return { text: `${quoteName(only.name)} needs ${needs(only.part)}.`, detail: isCut(only.name) ? [`The full name is "${only.name}".`] : [] }
  }
  // A half-filled term card makes both its sides the ones to fill; a blank and a statement are named only when missing.
  const sides = bad.some((b) => b.part === 'front' || b.part === 'back')
  const others = ['blank', 'statement', 'question', 'correct answer', 'wrong answer', 'title', 'two steps']
  const parts = [...(sides ? ['front', 'back'] : []), ...others.filter((part) => bad.some((b) => b.part === part))]
  const named = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} or ${parts.at(-1)}`
  const lines = bad.slice(0, MAX_LISTED).map((b) => `${b.name ? `${quoteName(b.name)} (#${b.num})` : `Card #${b.num}`} needs ${needs(b.part)}.`)
  const more = bad.length > MAX_LISTED ? [`And ${bad.length - MAX_LISTED} more.`] : []
  return { text: `${bad.length} cards need ${needs(named)}.`, detail: ['Each is marked in red; the first has the focus.', ...lines, ...more] }
}
