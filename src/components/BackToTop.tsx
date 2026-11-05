import { useEffect, useState } from 'react'
import { ArrowUpIcon } from './Icons'
import { IconButton } from './IconButton'

// How far down the scroller is before the button shows.
const SHOW_AFTER = 300

const top = (scroller: HTMLElement | Window) => (scroller instanceof Window ? scroller.scrollY : scroller.scrollTop)

/** A glass button, bottom right, that appears once `scroller` is scrolled down a little and scrolls it back up. */
export function BackToTop({ scroller }: { scroller: HTMLElement | Window }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const update = () => setShown(top(scroller) > SHOW_AFTER)
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    return () => scroller.removeEventListener('scroll', update)
  }, [scroller])

  // In JS, not CSS scroll-behavior, so the app's page-change scroll stays instant.
  const toTop = () =>
    scroller.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

  return (
    <IconButton
      label="Back to top"
      className={shown ? 'back-to-top is-shown' : 'back-to-top'}
      tabIndex={shown ? undefined : -1}
      onClick={toTop}
    >
      <ArrowUpIcon />
    </IconButton>
  )
}
