import { describe, expect, it } from 'vitest'
import { GROUP_COLORS } from '../model'
import type { Card, Group } from '../model'
import { inGroupOrder, nextColor, sections, withCollapsed } from './groups'

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

describe('sections', () => {
  it('lists ungrouped cards first, then each group, empty ones included', () => {
    const list = [card('a', 'g2'), card('b'), card('c', 'gone'), card('d', 'g2')]
    expect(sections(list, groups)).toEqual([
      { cards: [list[1], list[2]] },
      { group: groups[0], cards: [] },
      { group: groups[1], cards: [list[0], list[3]] },
    ])
  })

  it('has one empty ungrouped section for no cards', () => {
    expect(sections([], [])).toEqual([{ cards: [] }])
  })
})

describe('withCollapsed', () => {
  it('adds and removes ids', () => {
    const shut = withCollapsed(new Set(['a']), ['b'], true)
    expect([...shut]).toEqual(['a', 'b'])
    expect([...withCollapsed(shut, ['a'], false)]).toEqual(['b'])
  })

  it('returns the same set when nothing changes', () => {
    const set: ReadonlySet<string> = new Set(['a'])
    expect(withCollapsed(set, ['a'], true)).toBe(set)
    expect(withCollapsed(set, ['b'], false)).toBe(set)
    expect(withCollapsed(set, [], true)).toBe(set)
  })
})
