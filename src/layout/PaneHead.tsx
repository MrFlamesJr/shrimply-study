import type { MouseEvent } from 'react'
import { href, type Route } from '../route'
import { BrowserIcon, CloudIcon, FileIcon, ShrimpIcon } from '../components/Icons'

/**
 * One crumb. `icon`: the root's mark, so the trail reads as one from its start: where its file lives (as on the
 * file's sidebar row), or the app itself (`app`) for the app's own pages.
 */
export type Crumb = { label: string; route?: Route; icon?: 'device' | 'drive' | 'browser' | 'app' }

const ICONS = { device: FileIcon, drive: CloudIcon, browser: BrowserIcon, app: ShrimpIcon }

function Label({ c }: { c: Crumb }) {
  const Icon = c.icon && ICONS[c.icon]
  return (
    <>
      {Icon && (
        <span className={c.icon === 'app' ? 'pane-icon is-app' : 'pane-icon'}>
          <Icon />
        </span>
      )}
      <span className="pane-crumb-text">{c.label}</span>
    </>
  )
}

type Props = { crumbs: Crumb[]; onCrumb(route: Route): void }

/**
 * A pane's breadcrumbs, a plain row at the top of the pane: the file (with where it lives), then the page (on the
 * file's home its own name, "Your courses"), course and quiz, from the pane's left in line with the tab strip. Long ones truncate,
 * never overlap. In a narrow pane (its own width, not the window's: workbench.css) the trail gives way to one
 * "‹ <parent>" link, when the page has a parent to go back to (on a file's home it stays the trail).
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
                  <Label c={c} />
                </a>
              ) : (
                <span title={c.label}>
                  <Label c={c} />
                </span>
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
