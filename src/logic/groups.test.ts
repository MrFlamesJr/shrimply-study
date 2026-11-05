import { describe, expect, it } from 'vitest'
import { GROUP_COLORS } from '../model'
import type { Card, Group } from '../model'
import { inGroupOrder, nextColor } from './groups'

const card = (id: string, group?: string): Card => ({ id, term: id, definition: id, group })
const groups: Group[] = [
  { id: 'g1', name: 'One', color: 'lagoon' },
  { id: 'g2', name: 'Two', color: 'coral' },
]

describe('nextColor', () => {
  it('takes the first color no group uses', () => {
    expect(nextColor([])).toBe('lagoon')
    expect(nextColor(groups)).toBe('sky')
    expect(nextColor([{ id: 'g', name: 'G', color: 'sky' }])).toBe('lagoon')
  })

  it('wraps around when all colors are used', () => {
    const all: Group[] = GROUP_COLORS.map((color, i) => ({ id: `g${i}`, name: color, color }))
    expect(nextColor(all)).toBe('lagoon')
    expect(nextColor([...all, { id: 'x', name: 'X', color: 'lagoon' }])).toBe('coral')
  })
})

describe('inGroupOrder', () => {
  it('puts ungrouped cards first, then each group in order, keeping the order inside each', () => {
    const cards = [card('a', 'g2'), card('b'), card('c', 'g1'), card('d', 'g2'), card('e', 'g1')]
    expect(inGroupOrder(cards, groups).map((c) => c.id)).toEqual(['b', 'c', 'e', 'a', 'd'])
  })

  it('treats a card with an unknown group as ungrouped', () => {
    const cards = [card('a', 'g1'), card('b', 'gone')]
    expect(inGroupOrder(cards, groups).map((c) => c.id)).toEqual(['b', 'a'])
  })
})
