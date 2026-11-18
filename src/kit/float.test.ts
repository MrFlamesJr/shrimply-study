import { describe, expect, it } from 'vitest'
import { placeBelow } from './float'

const view = { width: 400, height: 300 }

describe('placeBelow', () => {
  it('hangs under the anchor, at its left', () => {
    expect(placeBelow({ left: 20, top: 40, bottom: 60 }, { width: 100, height: 30 }, view)).toEqual({ left: 20, top: 64 })
  })

  it('moves left to stay inside the window', () => {
    expect(placeBelow({ left: 350, top: 40, bottom: 60 }, { width: 100, height: 30 }, view)).toEqual({ left: 292, top: 64 })
  })

  it('never starts left of the margin, even when wider than the window', () => {
    expect(placeBelow({ left: 20, top: 40, bottom: 60 }, { width: 500, height: 30 }, view).left).toBe(8)
  })

  it('goes above the anchor when there is no room below', () => {
    expect(placeBelow({ left: 20, top: 260, bottom: 280 }, { width: 100, height: 30 }, view)).toEqual({ left: 20, top: 226 })
  })

  it('stays below when there is no room above either', () => {
    expect(placeBelow({ left: 20, top: 10, bottom: 280 }, { width: 100, height: 30 }, view).top).toBe(284)
  })
})
