import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDownIcon } from './Icons'

type Props = { tone: 'ok' | 'bad' | 'neutral'; summary: ReactNode; actions: ReactNode; more?: ReactNode }

/**
 * Bottom sheet after each answer, below the question column in `.session-main`, which it pushes up.
 * At rest only the summary shows. When there is `more`, the round button above it opens and closes it and
 * its top line can be dragged to resize it; without `more` there is neither.
 */
export function FeedbackSheet({ tone, summary, actions, more }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // While it slides in, opens, closes or is dragged, the scroll boxes it resizes hide their scrollbars
  // until it has settled (`is-moving`). Starts true for the slide-in.
  const [moving, setMoving] = useState(true)
  const [dragging, setDragging] = useState(false)
  const hasMore = Boolean(more)
  const toggle = (to: boolean) => {
    setOpen(to)
    setMoving(true)
  }
  // A dragged size only lasts while the sheet stays open: it is dropped once the sheet has closed (not at
  // once, so it closes from where it is), and the round button opens it to the default size again.
  const forgetSize = () => sheetRef.current?.style.removeProperty('--sheet-h')

  useLayoutEffect(() => {
    // The closed sheet's height, on the root: the question column gives back that much of its bottom room
    // (so the sheet appearing doesn't move the question).
    const root = document.documentElement.style
    const measure = () => {
      const peek = summaryRef.current!.getBoundingClientRect().bottom - sheetRef.current!.getBoundingClientRect().top
      root.setProperty('--sheet-peek', `${peek}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(summaryRef.current!)
    return () => {
      observer.disconnect()
      root.removeProperty('--sheet-peek')
    }
  }, [])

  // Dragging the top line sets the open size, --sheet-h on the sheet. Dragging a closed sheet opens it.
  // Let go with hardly any of `more` showing, it closes again.
  const resize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const handle = e.currentTarget
    const sheet = sheetRef.current!
    const closedH = summaryRef.current!.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top
    const start = sheet.offsetHeight + e.clientY
    let height: number | null = null
    let isOpen = open
    const move = (ev: PointerEvent) => {
      height = start - ev.clientY
      sheet.style.setProperty('--sheet-h', `${height}px`)
      if (!isOpen) {
        isOpen = true
        toggle(true)
      }
    }
    setDragging(true)
    handle.setPointerCapture(e.pointerId)
    handle.addEventListener('pointermove', move)
    handle.addEventListener(
      'lostpointercapture',
      () => {
        handle.removeEventListener('pointermove', move)
        setDragging(false)
        const few = parseFloat(getComputedStyle(sheet).getPropertyValue('--space-8'))
        if (isOpen && height !== null && height < closedH + few) toggle(false)
      },
      { once: true },
    )
  }

  // Settled: the slide-in or the open/close transition of the sheet itself (not of a button inside) ended.
  const settle = (e: { target: EventTarget; currentTarget: EventTarget }) => {
    if (e.target !== e.currentTarget) return
    setMoving(false)
    if (!open) forgetSize()
  }

  return (
    <div
      ref={sheetRef}
      className={`sheet is-${tone}${open ? ' is-open' : ''}${moving || dragging ? ' is-moving' : ''}`}
      aria-live="polite"
      onAnimationEnd={settle}
      onTransitionEnd={settle}
    >
      {hasMore && <div className="sheet-resize" onPointerDown={resize} />}
      {hasMore && (
        <button
          type="button"
          className="round-btn sheet-toggle"
          aria-label={open ? 'Less info' : 'More info'}
          title={open ? 'Less info' : 'More info'}
          aria-expanded={open}
          onClick={() => {
            // Opened again before it finished closing: still the default size.
            if (!open) forgetSize()
            toggle(!open)
          }}
        >
          <ChevronDownIcon />
        </button>
      )}
      <div ref={summaryRef} className="sheet-summary">
        <div className="sheet-result">{summary}</div>
        <div className="actions">{actions}</div>
      </div>
      {hasMore && (
        <div className="sheet-more" inert={!open}>
          {more}
        </div>
      )}
    </div>
  )
}
