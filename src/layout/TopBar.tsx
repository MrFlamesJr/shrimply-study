import { go, href, type Route } from '../route'
import type { LibraryApi } from '../state/useLibrary'

type Crumb = { label: string; to?: Route }

function crumbsFor(lib: LibraryApi, route: Route): Crumb[] {
  if (route.name === 'debug') return [{ label: 'Debug' }]
  if (route.name === 'course') {
    const course = lib.findCourse(route.id)
    return course ? [{ label: course.name }] : []
  }
  if (route.name === 'quiz' || route.name === 'edit') {
    const found = lib.findQuiz(route.id)
    if (!found) return []
    const course: Crumb = { label: found.course.name, to: { name: 'course', id: found.course.id } }
    return route.name === 'quiz'
      ? [course, { label: found.quiz.name }]
      : [course, { label: found.quiz.name, to: { name: 'quiz', id: found.quiz.id } }, { label: 'Edit' }]
  }
  return []
}

export function TopBar({ lib, route }: { lib: LibraryApi; route: Route }) {
  // Home leads the trail: the brand link is hidden while the sidebar is closed.
  const page = crumbsFor(lib, route)
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
