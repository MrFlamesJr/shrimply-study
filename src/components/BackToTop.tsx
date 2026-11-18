import { useEffect, useRef, useState } from 'react'
import { ArrowUpIcon } from './Icons'
import { IconButton } from './IconButton'
import { ownWindow } from './ownWindow'

// How far down the scroller is before the button shows.
const SHOW_AFTER = 300

const top = (scroller: HTMLElement | Window) => ('scrollTo' in scroller && 'document' in scroller ? scroller.scrollY : (scroller as HTMLElement).scrollTop)

/** A glass button, bottom right, that appears once `scroller` is scrolled down a little and scrolls it back up. */
export function BackToTop({ scroller }: { scroller: HTMLElement | Window }) {
  const [shown, setShown] = useState(false)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const update = () => setShown(top(scroller) > SHOW_AFTER)
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [scroller])

  // In JS, not CSS scroll-behavior, so the app's page-change scroll stays instant.
  const toTop = () =>
    scroller.scrollTo({ top: 0, behavior: ownWindow(button.current!).matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

  return (
    <IconButton
      ref={button}
      label="Back to top"
      className={shown ? 'back-to-top is-shown' : 'back-to-top'}
      tabIndex={shown ? undefined : -1}
      onClick={toTop}
    >
      <ArrowUpIcon />
    </IconButton>
  )
}
