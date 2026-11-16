import { describe, expect, it } from 'vitest'
import { drop, emptyHistory, record, redo, redoLabel, seal, undo, undoLabel, type Entry } from './history'

const e = (label: string, at: number, key?: string, before = 0, after = 1): Entry<number> => ({ label, before, after, key, at })

describe('history', () => {
  it('records and clears the future', () => {
    let h = record(emptyHistory<number>(), e('a', 0))
    h = undo(h)!.history
    expect(h.future).toHaveLength(1)
    h = record(h, e('b', 10))
    expect(h.future).toEqual([])
    expect(h.past.map((x) => x.label)).toEqual(['b'])
  })

  it('merges the same key within mergeMs, keeping first label and before, last after and at', () => {
    let h = record(emptyHistory<number>(), e('type', 0, 'k', 1, 2))
    h = record(h, e('type more', 1000, 'k', 2, 3))
    expect(h.past).toEqual([{ label: 'type', before: 1, after: 3, key: 'k', at: 1000 }])
    h = record(h, e('late', 1000 + 1500, 'k', 3, 4))
    expect(h.past).toHaveLength(1)
    h = record(h, e('later', 1000 + 1500 + 1501, 'k', 4, 5))
    expect(h.past).toHaveLength(2)
  })

  it('does not merge different keys or no key, and honours mergeMs', () => {
    let h = record(emptyHistory<number>(), e('a', 0, 'k'))
    expect(record(h, e('b', 1, 'j')).past).toHaveLength(2)
    expect(record(record(emptyHistory<number>(), e('a', 0)), e('b', 1)).past).toHaveLength(2)
    h = record(h, e('b', 100, 'k'), { mergeMs: 50 })
    expect(h.past).toHaveLength(2)
  })

  it('uses a custom merge', () => {
    const o = { merge: (a: number, b: number, keep: 'first' | 'last') => (keep === 'first' ? a * 10 : b * 10) }
    const h = record(record(emptyHistory<number>(), e('a', 0, 'k', 1, 2)), e('b', 1, 'k', 3, 4), o)
    expect(h.past[0].before).toBe(10)
    expect(h.past[0].after).toBe(40)
  })

  it('seal stops the next merge', () => {
    let h = seal(record(emptyHistory<number>(), e('a', 0, 'k')))
    h = record(h, e('b', 1, 'k'))
    expect(h.past).toHaveLength(2)
    const empty = emptyHistory<number>()
    expect(seal(empty)).toBe(empty)
  })

  it('limit drops the oldest (default 100)', () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < 5; i++) h = record(h, e(`e${i}`, i * 10000), { limit: 3 })
    expect(h.past.map((x) => x.label)).toEqual(['e2', 'e3', 'e4'])
    let d = emptyHistory<number>()
    for (let i = 0; i < 105; i++) d = record(d, e(`e${i}`, i * 10000))
    expect(d.past).toHaveLength(100)
    expect(d.past[0].label).toBe('e5')
  })

  it('undo and redo move entries between past and future', () => {
    let h = record(record(emptyHistory<number>(), e('a', 0)), e('b', 10000))
    expect(undoLabel(h)).toBe('b')
    expect(redoLabel(h)).toBeNull()
    const u = undo(h)!
    expect(u.entry.label).toBe('b')
    h = u.history
    expect(undoLabel(h)).toBe('a')
    expect(redoLabel(h)).toBe('b')
    const r = redo(h)!
    expect(r.entry.label).toBe('b')
    expect(r.history.past.map((x) => x.label)).toEqual(['a', 'b'])
    expect(r.history.future).toEqual([])
    expect(undo(emptyHistory())).toBeNull()
    expect(redo(emptyHistory())).toBeNull()
  })

  it('drop removes from past and future', () => {
    let h = record(record(emptyHistory<number>(), e('a', 0)), e('b', 10000))
    h = undo(h)!.history
    expect(drop(h, (x) => x.label === 'a' || x.label === 'b')).toEqual({ past: [], future: [] })
    expect(drop(h, () => false).past).toHaveLength(1)
  })
})
