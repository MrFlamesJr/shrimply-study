import type { ReactNode } from 'react'
import { OpenIcon } from './Icons'

type Props = {
  children: ReactNode
  /** Opens the page; `background` (Ctrl, Cmd or the middle button on a link) keeps the current page in front. */
  onOpen: (background: boolean) => void
  /** The page's address: then the link is an `<a>` that Ctrl and the middle button open in the background; else a button. */
  href?: string
  title?: string
  /** Extra classes, for placement. */
  className?: string
  /** Leaves a Shift or Alt click to the browser (a link's own way of opening). */
  skipModified?: boolean
}

/** A link that opens a page in a tab of its own: the link button's muted text, then the OpenIcon (the shared `.open-link`). */
export function OpenLink({ children, onOpen, href, title, className, skipModified }: Props) {
  if (href === undefined) {
    return (
      <button type="button" className={`link open-link${className ? ` ${className}` : ''}`} title={title} onClick={() => onOpen(false)}>
        {children} <OpenIcon />
      </button>
    )
  }
  return (
    <a
      className={`open-link${className ? ` ${className}` : ''}`}
      href={href}
      title={title}
      onClick={(e) => {
        if (skipModified && (e.shiftKey || e.altKey)) return
        e.preventDefault()
        onOpen(e.ctrlKey || e.metaKey)
      }}
      onAuxClick={(e) => {
        if (e.button !== 1) return
        e.preventDefault()
        onOpen(true)
      }}
    >
      {children} <OpenIcon />
    </a>
  )
}
