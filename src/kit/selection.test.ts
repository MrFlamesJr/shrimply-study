import { describe, expect, it } from 'vitest'
import { emptySelection, ordered, prune, select, selectAll, step } from './selection'

const order = ['a', 'b', 'c', 'd', 'e']

describe('selection', () => {
  it('plain click selects just the id', () => {
    const s = select(select(emptySelection, 'b', {}, order), 'd', {}, order)
    expect(s).toEqual({ ids: ['d'], anchor: 'd', focus: 'd' })
  })

  it('ctrl toggles and moves anchor and focus', () => {
    let s = select(emptySelection, 'a', { ctrl: true }, order)
    s = select(s, 'c', { ctrl: true }, order)
    expect(s.ids).toEqual(['a', 'c'])
    s = select(s, 'a', { ctrl: true }, order)
    expect(s).toEqual({ ids: ['c'], anchor: 'a', focus: 'a' })
  })

  it('shift selects anchor..id either way; the anchor falls back to the id', () => {
    expect(select(emptySelection, 'c', { shift: true }, order)).toEqual({ ids: ['c'], anchor: 'c', focus: 'c' })
    let s = select(emptySelection, 'b', {}, order)
    s = select(s, 'd', { shift: true }, order)
    expect(s).toEqual({ ids: ['b', 'c', 'd'], anchor: 'b', focus: 'd' })
    s = select(s, 'a', { shift: true }, order)
    expect(s.ids).toEqual(['a', 'b'])
    expect(s.anchor).toBe('b')
  })

  it('ctrl+shift adds the range to what is selected', () => {
    let s = select(emptySelection, 'a', {}, order)
    s = select(s, 'e', { ctrl: true }, order)
    s = select({ ...s, anchor: 'b' }, 'c', { ctrl: true, shift: true }, order)
    expect(ordered(s, order)).toEqual(['a', 'b', 'c', 'e'])
  })

  it('an anchor outside the order selects just the id on shift', () => {
    expect(select({ ids: ['a'], anchor: 'zz', focus: 'a' }, 'c', { shift: true }, order).ids).toEqual(['c'])
  })

  it('step moves focus, clamped', () => {
    let s = step(emptySelection, 1, order, {})
    expect(s).toEqual({ ids: ['a'], anchor: 'a', focus: 'a' })
    s = step(s, -1, order, {})
    expect(s.focus).toBe('a')
    s = step(s, 99, order, {})
    expect(s.focus).toBe('e')
    expect(step(emptySelection, -1, order, {}).focus).toBe('e')
    expect(step(emptySelection, 1, [], {})).toBe(emptySelection)
  })

  it('step with shift extends from the anchor; with ctrl moves focus only', () => {
    let s = select(emptySelection, 'b', {}, order)
    s = step(s, 1, order, { shift: true })
    s = step(s, 1, order, { shift: true })
    expect(s).toEqual({ ids: ['b', 'c', 'd'], anchor: 'b', focus: 'd' })
    s = step(s, -3, order, { shift: true })
    expect(s.ids).toEqual(['a', 'b'])
    const c = step(select(emptySelection, 'b', {}, order), 1, order, { ctrl: true })
    expect(c).toEqual({ ids: ['b'], anchor: 'b', focus: 'c' })
    const both = step(c, 1, order, { ctrl: true, shift: true })
    expect(ordered(both, order)).toEqual(['b', 'c', 'd'])
  })

  it('selectAll, prune and ordered', () => {
    expect(selectAll(order)).toEqual({ ids: order, anchor: 'a', focus: 'e' })
    expect(selectAll([])).toEqual(emptySelection)
    const s = selectAll(order)
    expect(prune(s, () => true)).toBe(s)
    expect(prune(s, (id) => id !== 'a' && id !== 'e')).toEqual({ ids: ['b', 'c', 'd'], anchor: null, focus: null })
    expect(ordered({ ids: ['d', 'a', 'x'], anchor: null, focus: null }, order)).toEqual(['a', 'd'])
  })
})
