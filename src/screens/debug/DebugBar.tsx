import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { href } from '../../route'
import { CrossIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { ThemeSelect } from '../../components/ThemeSelect'
import type { ThemeId } from '../../model'
import { themeTokens } from './themeTokens'

const SMALL_SELECTOR = 'button, a[href], input, select, textarea, summary, [role="button"]'
const TARGET = 44
const SLOW = 10

const layout = () =>
  [innerWidth >= 800 ? 'wide' : 'narrow', innerWidth < 400 && 'under 400', innerWidth < 320 && 'under 320']
    .filter(Boolean)
    .join(', ')

/** The open modal dialog on top (the last in the page: a dialog opened from another sits after it), or the body. */
const modalHost = () => [...document.querySelectorAll('dialog:modal')].at(-1) ?? document.body

/** Runs `apply` while `on` is true; the function it returns undoes it when `on` turns false or on unmount. */
function useWhile(on: boolean, apply: () => () => void) {
  useEffect(() => (on ? apply() : undefined), [on])
}

type Props = { onClose: () => void; theme: ThemeId; setTheme: (theme: ThemeId) => void }

export function DebugBar({ onClose, theme, setTheme }: Props) {
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

  // Dragging the size line, or any spot of the bar that isn't a control, moves it, holding the point that was
  // grabbed. While dragging it moves the element directly, in the same frame as the pointer (a React render per move
  // can land a frame late, so it trailed the pointer); the spot goes into state once, when it is let go.
  const drag = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button, select, a')) return
    e.preventDefault()
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const [dx, dy] = [e.clientX - rect.left, e.clientY - rect.top]
    bar.setPointerCapture(e.pointerId)
    let at = { x: rect.left, y: rect.top }
    const move = (m: globalThis.PointerEvent) => {
      at = clamp(m.clientX - dx, m.clientY - dy)
      bar.style.left = `${at.x}px`
      bar.style.top = `${at.y}px`
      bar.style.bottom = 'auto'
    }
    const end = () => {
      bar.removeEventListener('pointermove', move)
      bar.removeEventListener('pointerup', end)
      bar.removeEventListener('pointercancel', end)
      setPos(at)
    }
    bar.addEventListener('pointermove', move)
    bar.addEventListener('pointerup', end)
    bar.addEventListener('pointercancel', end)
  }
  // Always on top, modal dialogs too. The bar is a popover, so it sits in the top layer; whatever opens there
  // after it (a dialog, a menu, the toasts) would cover it, so it moves back to the top each time something opens.
  // Outside an open modal dialog everything is inert (no clicks, no focus), so while one is open the bar lives
  // inside it. Moving there makes a new element (the portal's), shown again here; its state stays.
  const [host, setHost] = useState(modalHost)
  const raise = () => {
    const bar = barRef.current
    if (!bar) return
    if (bar.matches(':popover-open')) bar.hidePopover()
    bar.showPopover()
  }
  useLayoutEffect(raise, [host])
  useEffect(() => {
    // A dialog opening or closing changes its `open` attribute; one taken away while open leaves the page.
    const observer = new MutationObserver(() => setHost(modalHost()))
    observer.observe(document.body, { subtree: true, childList: true, attributeFilter: ['open'] })
    const onToggle = (e: Event) => {
      if (e.target !== barRef.current && (e as ToggleEvent).newState === 'open') raise()
    }
    document.addEventListener('toggle', onToggle, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('toggle', onToggle, true)
    }
  }, [])

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

  return createPortal(
    <div
      ref={barRef}
      popover="manual"
      className="debug-bar"
      role="region"
      aria-label="Debug bar"
      style={pos ? { left: pos.x, top: pos.y, bottom: 'auto' } : undefined}
      onPointerDown={drag}
    >
      <div className="debug-head">
        <p className="debug-handle" title="Drag to move the bar">
          {innerWidth} × {innerHeight}, {layout()}, zoom {Math.round(devicePixelRatio * 100)}%
        </p>
        <IconButton label="Hide debug bar" onClick={onClose}>
          <CrossIcon />
        </IconButton>
      </div>
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
        <ThemeSelect theme={theme} setTheme={setTheme} title="Theme" />
        <a href={href({ name: 'debug' })}>Debug page</a>
      </div>
    </div>,
    host,
  )
}
