import { afterEach, describe, expect, it } from 'vitest'
import { DRAG_MIME, dropPosition, edgeZone, effectFor, endDrag, readDrag, startDrag } from './dnd'

type Fake = DataTransfer & { data: Record<string, string> }
const fakeDt = (): Fake => {
  const data: Record<string, string> = {}
  return { data, effectAllowed: 'none', setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k] ?? '' } as unknown as Fake
}

afterEach(endDrag)

describe('drag payload', () => {
  it('startDrag sets the data and readDrag prefers the module copy', () => {
    const dt = fakeDt()
    startDrag(dt, { kind: 'card', ids: ['1', '2'] }, 'two cards')
    expect(JSON.parse(dt.data[DRAG_MIME])).toEqual({ kind: 'card', ids: ['1', '2'] })
    expect(dt.data['text/plain']).toBe('two cards')
    expect(dt.effectAllowed).toBe('copyMove')
    expect(readDrag(null)).toEqual({ kind: 'card', ids: ['1', '2'] })
    expect(readDrag(fakeDt())).toEqual({ kind: 'card', ids: ['1', '2'] })
  })

  it('endDrag clears it; readDrag then reads the DataTransfer when readable', () => {
    startDrag(fakeDt(), { kind: 'x', ids: [] }, '')
    endDrag()
    expect(readDrag(null)).toBeNull()
    expect(readDrag(fakeDt())).toBeNull()
    const dt = fakeDt()
    dt.setData(DRAG_MIME, JSON.stringify({ kind: 'tab', ids: ['t'] }))
    expect(readDrag(dt)).toEqual({ kind: 'tab', ids: ['t'] })
    dt.setData(DRAG_MIME, JSON.stringify({ nope: 1 }))
    expect(readDrag(dt)).toBeNull()
  })
})

describe('effectFor', () => {
  const none = { ctrlKey: false, altKey: false, metaKey: false }
  it('copies with Ctrl, or Alt on a Mac', () => {
    expect(effectFor(none, false)).toBe('move')
    expect(effectFor({ ...none, ctrlKey: true }, false)).toBe('copy')
    expect(effectFor({ ...none, altKey: true }, false)).toBe('move')
    expect(effectFor({ ...none, altKey: true }, true)).toBe('copy')
    expect(effectFor({ ...none, ctrlKey: true }, true)).toBe('move')
  })
})

describe('dropPosition', () => {
  it('quarters when inside is allowed, with the boundaries in the middle zone', () => {
    expect(dropPosition(100, 40, 100, true)).toBe('before')
    expect(dropPosition(100, 40, 109, true)).toBe('before')
    expect(dropPosition(100, 40, 110, true)).toBe('inside')
    expect(dropPosition(100, 40, 130, true)).toBe('inside')
    expect(dropPosition(100, 40, 131, true)).toBe('after')
  })
  it('halves otherwise', () => {
    expect(dropPosition(0, 40, 19, false)).toBe('before')
    expect(dropPosition(0, 40, 20, false)).toBe('after')
  })
})

describe('edgeZone', () => {
  const r = { left: 100, top: 100, width: 400, height: 200 }
  it('names the outer quarter of each side, else center', () => {
    expect(edgeZone(r, 150, 200)).toBe('left')
    expect(edgeZone(r, 450, 200)).toBe('right')
    expect(edgeZone(r, 300, 120)).toBe('top')
    expect(edgeZone(r, 300, 280)).toBe('bottom')
    expect(edgeZone(r, 300, 200)).toBe('center')
    expect(edgeZone(r, 200, 200)).toBe('center')
  })
  it('picks the nearest side in a corner', () => {
    expect(edgeZone(r, 105, 150)).toBe('left')
    expect(edgeZone(r, 140, 102)).toBe('top')
    expect(edgeZone(r, 495, 298)).toBe('bottom')
    expect(edgeZone(r, 498, 250)).toBe('right')
  })
})
