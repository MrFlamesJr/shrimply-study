import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronDownIcon } from './Icons'

type Props = {
  tone: 'ok' | 'bad' | 'neutral'
  summary: ReactNode
  actions: ReactNode
  more?: ReactNode
  // Going to the next question: it slides out, then calls onLeft once.
  leaving: boolean
  onLeft: () => void
}

/**
 * Bottom sheet after each answer, at the bottom of `.session-main`. It moves only by transform, over the
 * question column; settled open, it joins the layout, so the column ends above it and each scrolls on its
 * own. The question's content has a fixed height, so it never moves or resizes with the sheet.
 * At rest only the summary shows. When there is `more`, the round button above it opens and closes it and
 * its top line can be dragged to resize it; without `more` there is neither.
 */
export function FeedbackSheet({ tone, summary, actions, more, leaving, onLeft }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const left = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // While it slides in, opens, closes or is dragged, the session's scroll boxes hide their scrollbars
  // until it has settled (`is-moving`). Starts true for the slide-in.
  const [moving, setMoving] = useState(true)
  const [dragging, setDragging] = useState(false)
  const hasMore = Boolean(more)
  const toggle = (to: boolean) => {
    setOpen(to)
    setMoving(true)
    // Closing, the panel scrolls back up while it slides down, so the closed sheet shows its summary.
    if (!to) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      scrollRef.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    }
  }
  // The closed sheet's height: its top line and the summary (not the rect, which moves as the panel scrolls).
  const closedHeight = () => sheetRef.current!.clientTop + summaryRef.current!.offsetHeight
  // A dragged size only lasts while the sheet stays open: it is dropped once the sheet has closed (not at
  // once, so it closes from where it is), and the round button opens it to the default size again.
  const forgetSize = () => sheetRef.current?.style.removeProperty('--sheet-h')

  useLayoutEffect(() => {
    // The closed sheet's height, on the root: how much of the sheet shows while closed, and where the
    // question column ends then.
    const root = document.documentElement.style
    const measure = () => root.setProperty('--sheet-peek', `${closedHeight()}px`)
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
    const closedH = closedHeight()
    // How much of it shows: it is always laid out at its open size and moved down by the rest.
    const start = sheet.parentElement!.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + e.clientY
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

  // Settled: the slide-in, slide-out or open/close transition of the sheet itself (not of a button inside)
  // ended. Slid out, the next question comes (once: a slide-in and a slide-out can both end).
  const settle = (e: { target: EventTarget; currentTarget: EventTarget }) => {
    if (e.target !== e.currentTarget) return
    if (leaving) {
      if (!left.current) onLeft()
      left.current = true
      return
    }
    setMoving(false)
    if (!open) forgetSize()
  }

  return (
    <div
      ref={sheetRef}
      // Settled open, it joins the layout: the question column ends above it and each scrolls on its own.
      className={`sheet is-${tone}${open ? ' is-open' : ''}${open && !moving ? ' is-split' : ''}${leaving ? ' is-leaving' : ''}${moving || dragging || leaving ? ' is-moving' : ''}`}
      // Sliding out, its buttons can't be pressed again.
      inert={leaving}
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
      {/* The whole panel scrolls as one when it doesn't fit (only while open). */}
      <div ref={scrollRef} className="sheet-scroll">
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
    </div>
  )
}
