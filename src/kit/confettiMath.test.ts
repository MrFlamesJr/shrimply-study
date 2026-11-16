import { describe, expect, it } from 'vitest'
import { burst, stepParticles } from './confettiMath'

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const base = { count: 30, x: 100, y: 100, angle: -Math.PI / 2, spread: 1, speed: 400, colors: ['red', 'blue'] }

describe('burst', () => {
  it('makes count pieces from the point with the given colors', () => {
    const ps = burst({ ...base, random: seeded(1) })
    expect(ps).toHaveLength(30)
    expect(ps.every((p) => p.x === 100 && p.y === 100 && ['red', 'blue'].includes(p.color))).toBe(true)
  })

  it('is the same with the same random', () => {
    expect(burst({ ...base, random: seeded(7) })).toEqual(burst({ ...base, random: seeded(7) }))
  })

  it('fans upward around the angle', () => {
    expect(burst({ ...base, random: seeded(2) }).every((p) => p.vy < 0)).toBe(true)
  })
})

describe('stepParticles', () => {
  const opts = { gravity: 900, drag: 1, height: 1000 }

  it('gravity pulls down', () => {
    const [p] = burst({ ...base, count: 1, spread: 0, random: seeded(3) })
    const [after] = stepParticles([{ ...p, vy: 0, vx: 0 }], 0.1, opts)
    expect(after.vy).toBeGreaterThan(0)
    expect(after.y).toBeGreaterThan(p.y)
  })

  it('does not change its input', () => {
    const ps = burst({ ...base, random: seeded(4) })
    const copy = structuredClone(ps)
    stepParticles(ps, 0.1, opts)
    expect(ps).toEqual(copy)
  })

  it('drops everything after enough steps', () => {
    let ps = burst({ ...base, random: seeded(5) })
    for (let i = 0; i < 400 && ps.length > 0; i++) ps = stepParticles(ps, 0.016, opts)
    expect(ps).toHaveLength(0)
  })

  it('drops pieces below the height', () => {
    const [p] = burst({ ...base, count: 1, random: seeded(6), life: 100 })
    expect(stepParticles([{ ...p, y: 1001, vy: 0 }], 0.01, opts)).toHaveLength(0)
  })
})
