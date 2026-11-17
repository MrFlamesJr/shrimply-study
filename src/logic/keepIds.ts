// A library taken from Google Drive comes with new ids (a file holds none). Its ids are carried over from the library
// it replaces, so the pages open on it and a running study round keep their place (asked for).
import type { Card, Course, Group, Library, Quiz } from '../model'
import { sameCard } from './cardStatus'
import { slug } from './names'

const kind = (card: Card): string => card.type ?? 'term'
// A card's content, whatever its id and group.
const content = (card: Card): Card => ({ ...card, id: '', group: undefined })

/**
 * For each card of `next`, the old card whose id it takes (an index into `old`), or undefined: first the same content
 * (the first such card not taken yet), so a card added or removed above it doesn't move ids; then, for the rest, the
 * card in the same place when it is of the same kind and not taken (edited in place).
 */
function cardMatches(old: Card[], next: Card[]): (number | undefined)[] {
  const taken = new Set<number>()
  const olds = old.map(content)
  const matches = next.map((card) => {
    const mine = content(card)
    const at = olds.findIndex((o, j) => !taken.has(j) && sameCard(o, mine))
    if (at < 0) return undefined
    taken.add(at)
    return at
  })
  return matches.map((m, i) => {
    if (m !== undefined || !old[i] || taken.has(i) || kind(old[i]) !== kind(next[i])) return m
    taken.add(i)
    return i
  })
}

function quizIds(old: Quiz, next: Quiz): Quiz {
  // Groups by name (the first not taken yet), cards by content, then by place and kind.
  const free = [...old.groups]
  const groupIds = new Map<string, string>()
  const groups = next.groups.map((g): Group => {
    const at = free.findIndex((o) => o.name === g.name)
    if (at < 0) return g
    const id = free.splice(at, 1)[0].id
    groupIds.set(g.id, id)
    return { ...g, id }
  })
  const matches = cardMatches(old.cards, next.cards)
  const cards = next.cards.map((card, i): Card => {
    const at = matches[i]
    const id = at === undefined ? card.id : old.cards[at].id
    const group = card.group === undefined ? undefined : (groupIds.get(card.group) ?? card.group)
    return { ...card, id, ...(group !== undefined && { group }) }
  })
  return { ...next, id: old.id, groups, cards }
}

function courseIds(old: Course, next: Course): Course {
  const quizzes = next.quizzes.map((q) => {
    const was = old.quizzes.find((o) => slug(o.name) === slug(q.name))
    return was ? quizIds(was, q) : q
  })
  return { ...next, id: old.id, quizzes }
}

/**
 * `next` with the ids of `old` wherever they match: courses and quizzes by name (slug), groups by name, cards by
 * content, then by place and kind.
 */
export function keepIds(old: Library, next: Library): Library {
  const courses = next.courses.map((c) => {
    const was = old.courses.find((o) => slug(o.name) === slug(c.name))
    return was ? courseIds(was, c) : c
  })
  return { ...next, courses }
}
