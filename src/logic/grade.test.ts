import { describe, expect, it } from 'vitest'
import { orderCounts, pickCounts, rightOrder, sameOrder, samePicks } from './grade'

describe('samePicks', () => {
  it('needs every right answer and nothing else, in any order', () => {
    expect(samePicks(['b', 'a'], ['a', 'b'])).toBe(true)
    expect(samePicks(['a'], ['a', 'b'])).toBe(false)
    expect(samePicks(['a', 'b', 'c'], ['a', 'b'])).toBe(false)
    expect(samePicks([], ['a'])).toBe(false)
  })
})

describe('pickCounts', () => {
  it('counts wrong picks, missed right answers and right answers picked', () => {
    expect(pickCounts(['a', 'b'], ['a', 'b'])).toEqual({ wrong: 0, missed: 0, correct: 2 })
    expect(pickCounts(['a', 'x'], ['a', 'b', 'c'])).toEqual({ wrong: 1, missed: 2, correct: 1 })
    expect(pickCounts(['x', 'y'], ['a'])).toEqual({ wrong: 2, missed: 1, correct: 0 })
    expect(pickCounts(['a', 'b', 'c', 'x'], ['a', 'b', 'c'])).toEqual({ wrong: 1, missed: 0, correct: 3 })
  })
})

describe('orderCounts', () => {
  it('counts steps out of their place and steps in it', () => {
    expect(orderCounts(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual({ wrong: 0, correct: 3 })
    expect(orderCounts(['b', 'a', 'c'], ['a', 'b', 'c'])).toEqual({ wrong: 2, correct: 1 })
    expect(orderCounts(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual({ wrong: 3, correct: 0 })
    // Steps with the same text are in place wherever that text goes.
    expect(orderCounts(['x', 'a', 'x'], ['x', 'a', 'x'])).toEqual({ wrong: 0, correct: 3 })
  })
})

describe('sameOrder', () => {
  it('needs every step in its place', () => {
    expect(sameOrder(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true)
    expect(sameOrder(['b', 'a', 'c'], ['a', 'b', 'c'])).toBe(false)
    expect(sameOrder(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
  })
})

describe('rightOrder', () => {
  it('gives where each step was placed, in the right order', () => {
    expect(rightOrder(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([0, 1, 2])
    expect(rightOrder(['b', 'a', 'c'], ['a', 'b', 'c'])).toEqual([1, 0, 2])
    expect(rightOrder(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual([1, 2, 0])
  })
  it('keeps a repeated step that is already in its place', () => {
    expect(rightOrder(['x', 'a', 'x'], ['a', 'x', 'x'])).toEqual([1, 0, 2])
    expect(rightOrder(['a', 'x', 'x'], ['x', 'x', 'a'])).toEqual([2, 1, 0])
  })
  it('still places every step after the card was edited', () => {
    expect(rightOrder(['a', 'z'], ['a', 'b'])).toEqual([0, 1])
    expect(rightOrder(['z', 'a'], ['a', 'b'])).toEqual([1, 0])
  })
})
