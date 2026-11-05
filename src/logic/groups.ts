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
