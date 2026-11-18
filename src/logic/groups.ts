import { GROUP_COLORS } from '../model'
import type { Card, Group, GroupColor } from '../model'

/** The first group color no group uses; when all are used, it wraps around. */
export function nextColor(groups: Group[]): GroupColor {
  return GROUP_COLORS.find((c) => !groups.some((g) => g.color === c)) ?? GROUP_COLORS[groups.length % GROUP_COLORS.length]
}

/** The ungrouped cards (or cards whose group is missing), then one section per group in order (empty ones too). */
export function sections(cards: Card[], groups: Group[]): { group?: Group; cards: Card[] }[] {
  const known = (card: Card) => groups.some((g) => g.id === card.group)
  return [
    { cards: cards.filter((c) => !known(c)) },
    ...groups.map((group) => ({ group, cards: cards.filter((c) => c.group === group.id) })),
  ]
}

/** The collapsed group ids with `ids` added (`shut`) or removed; the same set when nothing changes. */
export function withCollapsed(collapsed: ReadonlySet<string>, ids: string[], shut: boolean): ReadonlySet<string> {
  if (ids.every((id) => collapsed.has(id) === shut)) return collapsed
  const next = new Set(collapsed)
  for (const id of ids) {
    if (shut) next.add(id)
    else next.delete(id)
  }
  return next
}

/** Stable sort: ungrouped cards (or cards whose group is missing) first, then each group in order. */
export function inGroupOrder(cards: Card[], groups: Group[]): Card[] {
  return sections(cards, groups).flatMap((s) => s.cards)
}

/**
 * Card `id` moved into another section (asked for: in and out of groups by dragging): `group` (null: no group), just
 * before card `near` there, or just after it with `after`, or at the section's end without `near`. The same cards back
 * when the card or the group is unknown.
 */
export function moveToSection(cards: Card[], groups: Group[], id: string, to: { group: string | null; near?: string; after?: boolean }): Card[] {
  const card = cards.find((c) => c.id === id)
  if (!card || (to.group !== null && !groups.some((g) => g.id === to.group))) return cards
  const { group: _, ...rest } = card
  const moved = (to.group === null ? rest : { ...rest, group: to.group }) as Card
  const all = sections(cards.filter((c) => c.id !== id), groups)
  const section = all.find((s) => (s.group?.id ?? null) === to.group)!
  const at = to.near === undefined ? -1 : section.cards.findIndex((c) => c.id === to.near)
  if (at === -1) section.cards.push(moved)
  else section.cards.splice(at + (to.after ? 1 : 0), 0, moved)
  return all.flatMap((s) => s.cards)
}

/** The cards with card `id` moved to the place of card `to`, which must be in the same section (else nothing moves). */
export function moveWithinSection(cards: Card[], groups: Group[], id: string, to: string): Card[] {
  const all = sections(cards, groups)
  const at = all.findIndex((s) => s.cards.some((c) => c.id === id))
  const from = at === -1 ? -1 : all[at].cards.findIndex((c) => c.id === id)
  const target = at === -1 ? -1 : all[at].cards.findIndex((c) => c.id === to)
  if (from === -1 || target === -1 || from === target) return cards
  all[at].cards.splice(target, 0, ...all[at].cards.splice(from, 1))
  return all.flatMap((s) => s.cards)
}
