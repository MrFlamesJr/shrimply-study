import { describe, expect, it } from 'vitest'
import { canScroll } from './canScroll'

const box = (scrollTop: number, clientHeight = 100, scrollHeight = 300) => ({ scrollTop, clientHeight, scrollHeight })

describe('canScroll', () => {
  it('is false both ways when nothing overflows', () => {
    expect(canScroll(box(0, 100, 100), true)).toBe(false)
    expect(canScroll(box(0, 100, 100), false)).toBe(false)
  })

  it('at the top, can only go down', () => {
    expect(canScroll(box(0), true)).toBe(true)
    expect(canScroll(box(0), false)).toBe(false)
  })

  it('in the middle, can go both ways', () => {
    expect(canScroll(box(100), true)).toBe(true)
    expect(canScroll(box(100), false)).toBe(true)
  })

  it('at the bottom, can only go up, allowing 1px of rounding', () => {
    expect(canScroll(box(200), true)).toBe(false)
    expect(canScroll(box(199.5), true)).toBe(false)
    expect(canScroll(box(200), false)).toBe(true)
  })
})
