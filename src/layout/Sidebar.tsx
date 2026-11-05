import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { goToNew, href } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { ChevronsLeftIcon, PlusIcon, ShrimpIcon } from '../components/Icons'
import { THEMES, type ThemeId } from '../model'

// `current`: the id of the course or quiz whose page is open.
type Props = {
  lib: LibraryApi
  current?: string
  open: boolean
  setOpen: (open: boolean) => void
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const WIDE = '(min-width: 800px)'
const isNarrow = () => !matchMedia(WIDE).matches

// Where an element's content starts: its first child (the centered page column moves less than the page box).
const left = (el: Element) => (el.firstElementChild ?? el).getBoundingClientRect().left

/**
 * Whether the sidebar is open. Crossing the breakpoint (resizing or zooming the window) gives it that size's default:
 * open beside the page on wide screens, closed on small ones, where it covers the page.
 */
export function useSidebarOpen() {
  const [open, setOpen] = useState(() => matchMedia(WIDE).matches)
  useEffect(() => {
    const wide = matchMedia(WIDE)
    const onChange = () => setOpen(wide.matches)
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [])
  return [open, setOpen] as const
}

export function Sidebar({ lib, current, open, setOpen, theme, setTheme }: Props) {
  // On small screens the open sidebar covers the page, so close it after picking something.
  const closeIfNarrow = () => isNarrow() && setOpen(false)

  /**
   * The toggle. The page column snaps to its new width in one layout, then the page and the crumbs glide from where
   * they were by transform alone, so nothing is laid out again each frame while the sidebar slides (CSS). A click
   * mid-glide starts from where they are. On small screens the drawer covers the page, so nothing else moves.
   */
  const toggle = () => {
    const moving = [...document.querySelectorAll<HTMLElement>('.page, .crumbs')]
    const from = moving.map(left)
    moving.forEach((el) => el.getAnimations().forEach((a) => a.cancel()))
    flushSync(() => setOpen(!open))
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tokens = getComputedStyle(document.documentElement)
    const timing = { duration: parseFloat(tokens.getPropertyValue('--dur-slide')), easing: tokens.getPropertyValue('--ease').trim() }
    moving.forEach((el, i) => {
      const dx = from[i] - left(el)
      if (dx) el.animate({ transform: [`translateX(${dx}px)`, 'none'] }, timing)
    })
  }

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
          onClick={toggle}
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
                <a href={href({ name: 'course', course: course.name })} aria-current={course.id === current ? 'page' : undefined}>
                  {course.name || 'Untitled course'}
                </a>
                {course.quizzes.length > 0 && (
                  <ul className="tree-quizzes">
                    {course.quizzes.map((quiz) => (
                      <li key={quiz.id}>
                        <a
                          href={href({ name: 'quiz', course: course.name, quiz: quiz.name })}
                          aria-current={quiz.id === current ? 'page' : undefined}
                        >
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
                const course = lib.addCourse()
                goToNew(course.id, { name: 'course', course: course.name })
                closeIfNarrow()
              }}
            >
              <PlusIcon /> New course
            </button>
            <label className="theme-pick">
              Theme
              <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </nav>
      {open && <button type="button" className="scrim" aria-label="Close sidebar" tabIndex={-1} onClick={() => setOpen(false)} />}
    </>
  )
}
