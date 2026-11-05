import { GROUP_COLORS } from '../model'
import type { Card, Group, GroupColor } from '../model'

/** The first group color no group uses; when all are used, it wraps around. */
export function nextColor(groups: Group[]): GroupColor {
  return GROUP_COLORS.find((c) => !groups.some((g) => g.color === c)) ?? GROUP_COLORS[groups.length % GROUP_COLORS.length]
}

/** Stable sort: ungrouped cards (or cards whose group is missing) first, then each group in order. */
export function inGroupOrder(cards: Card[], groups: Group[]): Card[] {
  const rank = (card: Card) => groups.findIndex((g) => g.id === card.group) + 1
  return cards
    .map((card, i) => ({ card, i, rank: rank(card) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.card)
}
