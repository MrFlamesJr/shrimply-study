import { describe, expect, it } from 'vitest'
import { coversControl, toastLift } from './toastLift'

// An 800px tall window; the stack is 70px tall, 16px above the bottom, 16px from any control.
const lift = (height: number, controls: { top: number; bottom: number }[]) => toastLift(800, height, 16, 16, controls)

describe('toastLift', () => {
  it('stays in its corner when nothing is under it', () => {
    expect(lift(70, [])).toBe(0)
    expect(lift(70, [{ top: 100, bottom: 600 }])).toBe(0)
  })

  it('rises just above the buttons it would cover (the feedback sheet\'s)', () => {
    // Didn't know at 652-708, Knew it at 720-776: the stack's bottom goes 16px above Didn't know.
    expect(lift(70, [{ top: 652, bottom: 708 }, { top: 720, bottom: 776 }])).toBe(800 - 16 - 652 + 16)
  })

  it('climbs past controls stacked above them until it is clear', () => {
    const choices = [
      { top: 418, bottom: 490 },
      { top: 502, bottom: 574 },
      { top: 586, bottom: 658 },
      { top: 670, bottom: 742 },
    ]
    const l = lift(70, choices)
    expect(800 - 16 - l).toBe(418 - 16)
  })

  it('takes the first gap tall enough for the stack', () => {
    // A 120px gap between two controls holds a 70px stack with 16px on each side.
    expect(800 - 16 - lift(70, [{ top: 200, bottom: 300 }, { top: 420, bottom: 780 }])).toBe(420 - 16)
  })

  it('with no clear spot inside the window, covers the fewest controls, as low as it can', () => {
    const full = [{ top: 0, bottom: 380 }, { top: 400, bottom: 790 }]
    expect(lift(300, full)).toBe(0)
  })
})

describe('coversControl', () => {
  it('is true only when the stack overlaps a control', () => {
    expect(coversControl(639, 784, [{ top: 652, bottom: 708 }])).toBe(true)
    expect(coversControl(491, 636, [{ top: 652, bottom: 708 }])).toBe(false)
    expect(coversControl(491, 636, [])).toBe(false)
  })
})
