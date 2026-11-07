import { describe, expect, it } from 'vitest'
import { RELEASES } from './releaseNotes'

describe('RELEASES', () => {
  it('names each release once', () => {
    expect(new Set(RELEASES.map((r) => r.name)).size).toBe(RELEASES.length)
  })

  it('dates each release as a real YYYY-MM-DD day, newest first', () => {
    for (const { date } of RELEASES) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(date).toISOString().slice(0, 10)).toBe(date)
    }
    const dates = RELEASES.map((r) => r.date)
    expect(dates).toEqual([...dates].sort().reverse())
  })
})
