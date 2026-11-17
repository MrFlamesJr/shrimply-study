import type { MouseEvent } from 'react'
import { href, type Route } from '../route'

export type Crumb = { label: string; route?: Route }

type Props = { crumbs: Crumb[]; onCrumb(route: Route): void }

/**
 * A pane's breadcrumbs, on frosted glass over what scrolls under them: the file (its home), then the course and quiz,
 * lined up with the page under them. Long ones truncate, never overlap. In a narrow pane (its own width, not the
 * window's: workbench.css) the trail gives way to one "‹ <parent>" link, when the page has a parent to go back to.
 */
export function PaneHead({ crumbs, onCrumb }: Props) {
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined
  // A plain click goes through the pane's own tab; Ctrl, Shift or another button is left to the browser.
  const follow = (route: Route) => (e: MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onCrumb(route)
  }
  return (
    <nav className={parent?.route ? 'pane-head has-parent' : 'pane-head'} aria-label="Breadcrumbs">
      <ol className="pane-crumbs">
        {crumbs.map((c, i) => {
          const route = c.route
          const last = i === crumbs.length - 1
          return (
            <li key={i} className={last ? 'is-current' : undefined} aria-current={last ? 'page' : undefined}>
              {i > 0 && <span className="pane-sep" aria-hidden="true">›</span>}
              {route && !last ? (
                <a href={href(route)} title={c.label} onClick={follow(route)}>
                  {c.label}
                </a>
              ) : (
                <span title={c.label}>{c.label}</span>
              )}
            </li>
          )
        })}
      </ol>
      {parent?.route && (
        <a className="pane-parent" href={href(parent.route)} title={parent.label} onClick={follow(parent.route)}>
          ‹ {parent.label}
        </a>
      )}
    </nav>
  )
}
