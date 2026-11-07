import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { go, goToNew, href } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { BrowserIcon, ChevronsLeftIcon, CloudIcon, FileIcon, PlusIcon, PullIcon, ShrimpIcon, TumbleweedIcon } from '../components/Icons'
import { ThemeSelect } from '../components/ThemeSelect'
import type { ThemeId } from '../model'

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

/**
 * Which file the library is: its Google Drive file (the user's own or someone else's), the .shrimp file it was
 * opened from or last downloaded to, or none yet (kept only in this browser). New library, once there is something
 * to leave, starts an empty one tied to no file (it asks first when there are courses or changes).
 */
function OpenFile({ lib }: { lib: LibraryApi }) {
  const drive = lib.drive.file
  // Whose it is, only as far as anyone can tell: "Your" needs a sign-in and Google's word; signed out, nobody knows.
  const whose = lib.drive.yours
    ? 'Your Google Drive'
    : lib.drive.signedIn()
      ? "Someone else's Google Drive"
      : drive?.shared
        ? 'Shared on Google Drive'
        : 'On Google Drive'
  const [Icon, name, where] = drive
    ? [CloudIcon, drive.name, `${whose}${drive.trashed ? ', in the bin' : ''}`]
    : lib.fileName
      ? [FileIcon, lib.fileName, 'On this device']
      : [BrowserIcon, 'No file yet', 'Only in this browser']
  return (
    <div className="sidebar-file">
      <Icon />
      <p>
        <span className="sidebar-file-name" title={name}>
          {name}
        </span>
        <span className="sidebar-file-where">{where}</span>
      </p>
      {/* Someone else's changes come only when pulled, never on their own (asked for); it warns before replacing. */}
      {drive?.shared && !lib.drive.yours && (
        <button
          type="button"
          className="link"
          title="Bring the newest version from Google Drive here. Asks first, as it replaces your courses here."
          // The page stays when the pulled library still has it (App moves on quietly when not).
          onClick={() => void lib.drive.pull()}
        >
          <PullIcon /> {lib.drive.newer ? 'Pull new changes' : 'Pull changes'}
        </button>
      )}
    </div>
  )
}

/** Out of the open file, to start from nothing: under the file's box, not in it, as it leaves the file (asked for). */
function NewLibrary({ lib, onNew }: { lib: LibraryApi; onNew: () => void }) {
  if (!lib.drive.file && !lib.fileName && lib.library.courses.length === 0) return null
  return (
    <button
      type="button"
      className="link sidebar-new"
      title="Start over with an empty library, saved later as a new .shrimp file. Anything here that is not saved in a file is deleted, so it asks first."
      onClick={async () => {
        if (await lib.newLibrary()) onNew()
      }}
    >
      <PlusIcon /> New library
    </button>
  )
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
          <OpenFile lib={lib} />
          <NewLibrary
            lib={lib}
            onNew={() => {
              go({ name: 'home' })
              closeIfNarrow()
            }}
          />
          <p className="sidebar-label">Courses</p>
          {lib.library.courses.length === 0 ? (
            <div className="tree tree-empty">
              <div className="tree-empty-mark">
                <TumbleweedIcon />
                <p>Nothing to see here</p>
              </div>
              <p className="tree-empty-hint">
                Press <strong>+ New course</strong> below to get started.
              </p>
            </div>
          ) : (
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
          )}
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
              <ThemeSelect theme={theme} setTheme={setTheme} />
            </label>
          </div>
        </div>
      </nav>
      {open && <button type="button" className="scrim" aria-label="Close sidebar" tabIndex={-1} onClick={() => setOpen(false)} />}
    </>
  )
}
