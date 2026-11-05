import { goToNew, href, type Route } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { ChevronsLeftIcon, PlusIcon, ShrimpIcon } from '../components/Icons'

type Props = { lib: LibraryApi; route: Route; open: boolean; setOpen: (open: boolean) => void }

const isNarrow = () => !matchMedia('(min-width: 800px)').matches

export function Sidebar({ lib, route, open, setOpen }: Props) {
  const quizId = route.name === 'quiz' || route.name === 'edit' ? route.id : undefined
  const courseId = route.name === 'course' ? route.id : undefined
  // On small screens the open sidebar covers the page, so close it after picking something.
  const closeIfNarrow = () => isNarrow() && setOpen(false)

  return (
    <>
      {/* Brand and toggle sit outside the sidebar, so both stay visible when it is closed to nothing. */}
      <div className={open ? 'corner' : 'corner is-closed'}>
        <a className="brand" href="#/" aria-label="Shrimply Study" onClick={closeIfNarrow}>
          <ShrimpIcon />
          <span className="brand-name">Shrimply Study</span>
        </a>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronsLeftIcon />
        </button>
      </div>
      <nav className={open ? 'sidebar' : 'sidebar is-closed'} aria-label="Courses" inert={!open}>
        {/* Stays rendered (inert) while closed, so the width can animate. */}
        <div className="sidebar-body">
          <p className="sidebar-label">Courses</p>
          <ul className="tree" onClick={(e) => (e.target as HTMLElement).closest('a') && closeIfNarrow()}>
            {lib.library.courses.map((course) => (
              <li key={course.id} className="tree-course">
                <a href={href({ name: 'course', id: course.id })} aria-current={course.id === courseId ? 'page' : undefined}>
                  {course.name || 'Untitled course'}
                </a>
                {course.quizzes.length > 0 && (
                  <ul className="tree-quizzes">
                    {course.quizzes.map((quiz) => (
                      <li key={quiz.id}>
                        <a href={href({ name: 'quiz', id: quiz.id })} aria-current={quiz.id === quizId ? 'page' : undefined}>
                          {quiz.name || 'Untitled quiz'}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="sidebar-foot">
            <button
              type="button"
              className="add"
              onClick={() => {
                goToNew({ name: 'course', id: lib.addCourse() })
                closeIfNarrow()
              }}
            >
              <PlusIcon /> New course
            </button>
          </div>
        </div>
      </nav>
      {open && <button type="button" className="scrim" aria-label="Close sidebar" tabIndex={-1} onClick={() => setOpen(false)} />}
    </>
  )
}
