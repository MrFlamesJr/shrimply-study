import { describe, expect, it } from 'vitest'
import { spinCurve } from './spinCurve'

const points = (curve: string) => curve.slice('linear('.length, -1).split(', ').map(Number)

describe('spinCurve', () => {
  it('runs from 0 to exactly the whole distance', () => {
    const p = points(spinCurve(1000))
    expect(p[0]).toBe(0)
    expect(p.at(-1)).toBe(1)
    expect(p).toHaveLength(81)
  })

  it('winds back by the wind-up in px first and holds there a beat (anticipation)', () => {
    const p = points(spinCurve(1000, 24, 24))
    expect(Math.min(...p.slice(0, 13))).toBeCloseTo(-24 / 1000, 4)
    expect(p[10]).toBeCloseTo(-24 / 1000, 4)
    expect(p[12]).toBeCloseTo(-24 / 1000, 4)
  })

  it('snaps forward right after the hold', () => {
    const p = points(spinCurve(1000))
    expect(p[16]).toBeGreaterThan(0.25)
  })

  it('goes past the end by the overshoot in px, then bounces back below it before settling', () => {
    const p = points(spinCurve(2000, 24))
    expect(Math.max(...p)).toBeCloseTo(1 + 24 / 2000, 4)
    const after = p.slice(p.indexOf(Math.max(...p)))
    expect(Math.min(...after)).toBeLessThan(1)
    expect(Math.min(...after)).toBeGreaterThan(1 - 24 / 2000)
  })

  it('keeps the bounce the same size in px on a longer spin', () => {
    const short = Math.max(...points(spinCurve(1000))) - 1
    const long = Math.max(...points(spinCurve(4000))) - 1
    expect(short * 1000).toBeCloseTo(long * 4000, 1)
  })
})
