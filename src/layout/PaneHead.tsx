import { href, type Route } from '../route'

export type Crumb = { label: string; route?: Route }

type Props = { crumbs: Crumb[]; onCrumb(route: Route): void }

/** A pane's breadcrumbs, on frosted glass over what scrolls under them. Long ones truncate, never overlap. */
export function PaneHead({ crumbs, onCrumb }: Props) {
  return (
    <nav className="pane-head" aria-label="Breadcrumbs">
      <ol className="pane-crumbs">
        {crumbs.map((c, i) => {
          const route = c.route
          const last = i === crumbs.length - 1
          return (
            <li key={i} className={last ? 'is-current' : undefined} aria-current={last ? 'page' : undefined}>
              {i > 0 && <span className="pane-sep" aria-hidden="true">›</span>}
              {route && !last ? (
                <a
                  href={href(route)}
                  title={c.label}
                  onClick={(e) => {
                    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
                    e.preventDefault()
                    onCrumb(route)
                  }}
                >
                  {c.label}
                </a>
              ) : (
                <span title={c.label}>{c.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
