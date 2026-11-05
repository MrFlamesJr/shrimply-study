import { go, href, type Route } from '../route'
import type { Course, Quiz } from '../model'
import type { LibraryApi } from '../state/useLibrary'

type Crumb = { label: string; to?: Route }

function crumbsFor(page: Route['name'], course?: Course, quiz?: Quiz): Crumb[] {
  if (page === 'debug') return [{ label: 'Debug' }]
  if (!course) return []
  if (page === 'course') return [{ label: course.name }]
  if (!quiz) return []
  const up: Crumb = { label: course.name, to: { name: 'course', course: course.name } }
  return page === 'quiz'
    ? [up, { label: quiz.name }]
    : [up, { label: quiz.name, to: { name: 'quiz', course: course.name, quiz: quiz.name } }, { label: 'Edit' }]
}

type Props = { lib: LibraryApi; page: Route['name']; course?: Course; quiz?: Quiz }

export function TopBar({ lib, page: name, course, quiz }: Props) {
  // Home leads the trail: the brand link is hidden while the sidebar is closed.
  const page = crumbsFor(name, course, quiz)
  const crumbs: Crumb[] = page.length > 0 ? [{ label: 'Home', to: { name: 'home' } }, ...page] : []
  const parent = crumbs[crumbs.length - 2]
  return (
    <header className="topbar">
      {parent?.to && (
        <>
          <ol className="crumbs">
            {crumbs.map((c, i) => (
              <li key={i}>{c.to && i < crumbs.length - 1 ? <a href={href(c.to)}>{c.label}</a> : c.label}</li>
            ))}
          </ol>
          <a className="parent" href={href(parent.to)}>
            ‹ {parent.label}
          </a>
        </>
      )}
      <div className="topbar-actions">
        <button
          type="button"
          className="load link"
          title={lib.loadHint}
          onClick={async () => {
            if (await lib.open()) go({ name: 'home' })
          }}
        >
          {lib.loadLabel}
        </button>
        <button type="button" className="link" title={lib.saveHint} onClick={() => void lib.download()}>
          {lib.saveLabel}
        </button>
      </div>
    </header>
  )
}
