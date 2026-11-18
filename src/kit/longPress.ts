const DELAY = 500
const SLOP = 8
const AFTER_CLICK = 80

type PointerLike = { pointerType: string; clientX: number; clientY: number; currentTarget: EventTarget }

/**
 * A touch or pen long press (500 ms, cancelled by moving over 8px or by the pointer ending): the stand-in for a right
 * click. The action runs when the finger lifts: a popover shown while a pointer is still down is light-dismissed by
 * that same pointer's release.
 */
export function createLongPress(onPress: (x: number, y: number) => void) {
  let start: { x: number; y: number; timer: number; win: Window } | null = null
  let lastWin: Window | null = null
  let ready: { x: number; y: number } | null = null
  const stop = () => {
    if (start) start.win.clearTimeout(start.timer)
    start = null
    ready = null
  }
  const self = {
    /** True from the moment a press fired until the next pointer goes down: the click and drag that follow are not wanted. */
    fired: false,
    down(e: PointerLike) {
      stop()
      self.fired = false
      if (e.pointerType === 'mouse') return
      const win = ((e.currentTarget as Node).ownerDocument as Document).defaultView!
      lastWin = win
      const x = e.clientX
      const y = e.clientY
      start = {
        x, y, win,
        timer: win.setTimeout(() => {
          start = null
          self.fired = true
          ready = { x, y }
        }, DELAY),
      }
    },
    move(e: PointerLike) {
      const from = start ?? ready
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > SLOP) stop()
    },
    end() {
      const at = ready
      const win = start?.win ?? lastWin
      stop()
      // After the click that follows the lift, which would light-dismiss it.
      if (at) win!.setTimeout(() => onPress(at.x, at.y), AFTER_CLICK)
    },
    cancel: stop,
  }
  return self
}
