import type { Card, Group, Quiz } from '../model'

/**
 * What a change to a quiz's cards and groups is called in the undo history, and its merge key when it is typing in
 * one field (one card, or one group's name or color): those merge into one step while the typing goes on. Null when
 * nothing changed (the same cards and groups, in the same order).
 */
export function cardsEdit(quiz: Quiz, cards: Card[], groups: Group[] = quiz.groups): { label: string; key?: string } | null {
  const was = new Map(quiz.cards.map((c) => [c.id, c]))
  const now = new Set(cards.map((c) => c.id))
  const added = cards.filter((c) => !was.has(c.id)).length
  const removed = quiz.cards.filter((c) => !now.has(c.id)).length
  const n = (count: number, one: string) => (count === 1 ? one : `${one}s`)
  if (added && !removed) return { label: `Add ${n(added, 'card')}` }
  if (removed && !added) return { label: `Delete ${n(removed, 'card')}` }
  if (added || removed) return { label: 'Edit cards' }

  const sameGroups = groups.length === quiz.groups.length && groups.every((g, i) => g === quiz.groups[i])
  const changed = cards.filter((c) => was.get(c.id) !== c)
  const sameOrder = cards.every((c, i) => c.id === quiz.cards[i].id)
  if (sameGroups && sameOrder && changed.length === 0) return null
  if (!sameGroups) {
    if (groups.length > quiz.groups.length) return { label: 'Add group' }
    if (groups.length < quiz.groups.length) return { label: 'Ungroup' }
    const edited = groups.filter((g, i) => g !== quiz.groups[i])
    if (edited.length === 1 && changed.length === 0) {
      const old = quiz.groups.find((g) => g.id === edited[0].id)
      return { label: old && old.name !== edited[0].name ? 'Rename group' : 'Change group color', key: `group:${edited[0].id}` }
    }
    return { label: 'Edit groups' }
  }
  if (!sameOrder || changed.some((c) => c.group !== was.get(c.id)?.group)) return { label: `Move ${n(Math.max(changed.length, 1), 'card')}` }
  if (changed.length === 1) return { label: 'Edit card', key: `card:${changed[0].id}` }
  return { label: 'Edit cards' }
}
