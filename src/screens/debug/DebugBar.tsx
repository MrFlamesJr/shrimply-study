import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { href } from '../../route'
import { CrossIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { themeTokens } from './themeTokens'

const SMALL_SELECTOR = 'button, a[href], input, select, textarea, summary, [role="button"]'
const TARGET = 44
const SLOW = 10
// How far one arrow key press moves the bar, in px.
const STEP = 16
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

const layout = () =>
  [innerWidth >= 800 ? 'wide' : 'narrow', innerWidth < 400 && 'under 400', innerWidth < 320 && 'under 320']
    .filter(Boolean)
    .join(', ')

/** Runs `apply` while `on` is true; the function it returns undoes it when `on` turns false or on unmount. */
function useWhile(on: boolean, apply: () => () => void) {
  useEffect(() => (on ? apply() : undefined), [on])
}

export function DebugBar({ onClose }: { onClose: () => void }) {
  const [, resized] = useState(0)
  const [outlines, setOutlines] = useState(false)
  const [slow, setSlow] = useState(false)
  const [small, setSmall] = useState(false)
  const [smallCount, setSmallCount] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)
  // Its top left corner once moved; until then CSS keeps it in the bottom left corner.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // The whole bar stays on screen. The root's client size leaves out the page scrollbar, which would cover it.
  const clamp = (x: number, y: number) => {
    const bar = barRef.current!
    const { clientWidth, clientHeight } = document.documentElement
    return {
      x: Math.max(0, Math.min(x, clientWidth - bar.offsetWidth)),
      y: Math.max(0, Math.min(y, clientHeight - bar.offsetHeight)),
    }
  }
  // After every render: the window or the bar may have changed size (a resize, a longer count, wrapping).
  useLayoutEffect(() => {
    if (!pos) return
    const next = clamp(pos.x, pos.y)
    if (next.x !== pos.x || next.y !== pos.y) setPos(next)
  })

  // Dragging the size line moves the bar, holding the point that was grabbed. While dragging it moves the element
  // directly, in the same frame as the pointer (a React render per move can land a frame late, so it trailed the
  // pointer); the spot goes into state once, when it is let go.
  const drag = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const bar = barRef.current!
    const rect = bar.getBoundingClientRect()
    const [dx, dy] = [e.clientX - rect.left, e.clientY - rect.top]
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    let at = { x: rect.left, y: rect.top }
    const move = (m: globalThis.PointerEvent) => {
      at = clamp(m.clientX - dx, m.clientY - dy)
      bar.style.left = `${at.x}px`
      bar.style.top = `${at.y}px`
      bar.style.bottom = 'auto'
    }
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      setPos(at)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }
  // The arrow keys move it too, while the size line has focus (prevented, so study doesn't scroll the card).
  const nudge = (e: KeyboardEvent<HTMLElement>) => {
    const arrow = ARROWS[e.key]
    if (!arrow) return
    e.preventDefault()
    const rect = barRef.current!.getBoundingClientRect()
    setPos(clamp(rect.left + arrow[0] * STEP, rect.top + arrow[1] * STEP))
  }

  useEffect(() => {
    const onResize = () => resized((n) => n + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useWhile(outlines, () => {
    document.documentElement.classList.add('debug-outlines')
    return () => document.documentElement.classList.remove('debug-outlines')
  })

  useWhile(slow, () => {
    const style = document.documentElement.style
    const durations = themeTokens().filter(([name, value]) => name.startsWith('--dur') && /^[\d.]+ms$/.test(value))
    for (const [name, value] of durations) style.setProperty(name, `${parseFloat(value) * SLOW}ms`)
    return () => durations.forEach(([name]) => style.removeProperty(name))
  })

  useWhile(small, () => {
    const mark = () => {
      let count = 0
      for (const el of document.querySelectorAll<HTMLElement>(SMALL_SELECTOR)) {
        const rect = el.getBoundingClientRect()
        const isSmall = rect.width > 0 && rect.height > 0 && (rect.width < TARGET || rect.height < TARGET)
        el.toggleAttribute('data-debug-small', isSmall)
        if (isSmall) count++
      }
      setSmallCount(count)
    }
    mark()
    const timer = setInterval(mark, 1000)
    return () => {
      clearInterval(timer)
      document.querySelectorAll('[data-debug-small]').forEach((el) => el.removeAttribute('data-debug-small'))
    }
  })

  return (
    <div
      ref={barRef}
      className="debug-bar"
      role="region"
      aria-label="Debug bar"
      style={pos ? { left: pos.x, top: pos.y, bottom: 'auto' } : undefined}
    >
      <p className="debug-handle" tabIndex={0} title="Drag to move the bar (or use the arrow keys)" onPointerDown={drag} onKeyDown={nudge}>
        {innerWidth} × {innerHeight}, {layout()}, zoom {Math.round(devicePixelRatio * 100)}%
      </p>
      <div className="actions">
        <button type="button" aria-pressed={outlines} onClick={() => setOutlines(!outlines)}>
          Outlines
        </button>
        <button type="button" aria-pressed={slow} title="Run the animations 10 times slower" onClick={() => setSlow(!slow)}>
          Slow motion
        </button>
        <button
          type="button"
          aria-pressed={small}
          title="Outline the controls smaller than a 44px touch target"
          onClick={() => setSmall(!small)}
        >
          Small targets{small ? ` (${smallCount})` : ''}
        </button>
        <a href={href({ name: 'debug' })}>Debug page</a>
        <IconButton label="Hide debug bar" onClick={onClose}>
          <CrossIcon />
        </IconButton>
      </div>
    </div>
  )
}
