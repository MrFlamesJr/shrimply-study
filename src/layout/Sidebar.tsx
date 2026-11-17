import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Route } from '../route'
import { comboLabel, isMac } from '../kit/shortcuts'
import type { WorkspaceApi } from '../state/useWorkspace'
import type { DocId } from '../logic/contentOps'
import { ChevronsLeftIcon, FolderIcon, OpenIcon, ShrimpIcon } from '../components/Icons'
import { Shortcut } from '../components/Shortcut'
import { FileTree } from './FileTree'
import { ThemeSelect } from '../components/ThemeSelect'
import { HiddenFilesNote } from './HiddenFilesNote'
import type { ThemeId } from '../model'

// `current`: the id of the course or quiz the address tab shows.
type Props = {
  ws: WorkspaceApi
  current?: string
  open: boolean
  setOpen: (open: boolean) => void
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  /** Opens the Google Drive dialog. */
  onDrive: () => void
  /** A file's own New course and a course's New quiz, in the tree. */
  onNewCourseIn: (doc: DocId) => void
  onNewQuiz: (doc: DocId, course: string) => void
  /** Shows the Explorer (Ctrl+Shift+E). */
  onExplorer: () => void
  /** The brand: the Welcome tab (opened, or shown where it is). */
  onHome: () => void
  /** What's new: its tab (opened, or shown where it is). */
  onWhatsNew: () => void
  /** A course or quiz of the tree, shown in the active group (`newTab`: in a new tab there). */
  onOpen: (doc: DocId, route: Route, newTab: boolean) => void
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

export function Sidebar({ ws, current, open, setOpen, theme, setTheme, onDrive, onNewCourseIn, onNewQuiz, onExplorer, onHome, onWhatsNew, onOpen }: Props) {
  // On small screens the open sidebar covers the page, so close it after picking something.
  const closeIfNarrow = () => isNarrow() && setOpen(false)

  /**
   * The toggle. The workbench snaps to its new width in one layout, then it (or the app's own page) and the top-left
   * tab strip, which makes room for the corner while the sidebar is closed, glide from where they were by transform
   * alone, so nothing is laid out again each frame while the sidebar slides (CSS). The strip moves inside the
   * workbench, so it glides only by its own part. A click mid-glide starts from where they are. On small screens the
   * drawer covers the page, so nothing else moves.
   */
  const toggle = () => {
    const outer = [...document.querySelectorAll<HTMLElement>('.wb-cell:not([hidden]), .own-page')]
    const strip = document.querySelector<HTMLElement>('.wb-cell:not([hidden]) .wb-group.is-corner > .kit-tabstrip')
    const moving = strip ? [...outer, strip] : outer
    const from = moving.map(left)
    moving.forEach((el) => el.getAnimations().forEach((a) => a.cancel()))
    flushSync(() => setOpen(!open))
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tokens = getComputedStyle(document.documentElement)
    const timing = { duration: parseFloat(tokens.getPropertyValue('--dur-slide')), easing: tokens.getPropertyValue('--ease').trim() }
    const dxs = moving.map((el, i) => from[i] - left(el))
    // The strip's own part: what is left once the workbench around it has glided.
    const cell = outer.findIndex((el) => el.classList.contains('wb-cell'))
    moving.forEach((el, i) => {
      const dx = el === strip && cell >= 0 ? dxs[i] - dxs[cell] : dxs[i]
      if (dx) el.animate({ transform: [`translateX(${dx}px)`, 'none'] }, timing)
    })
  }

  return (
    <>
      {/* Brand and toggle sit outside the sidebar, so both stay visible when it is closed to nothing. */}
      <div className={open ? 'corner' : 'corner is-closed'}>
        <a
          className="brand"
          href="#/"
          aria-label="Shrimply Study"
          title="Welcome page"
          onClick={(e) => {
            e.preventDefault()
            onHome()
            closeIfNarrow()
          }}
        >
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
          {/* Every open file as a tree, in a pane of its own (split beside the page when there is room). */}
          <button
            type="button"
            className="sidebar-explorer"
            title="Show every open file as a tree, beside the page"
            onClick={() => {
              onExplorer()
              closeIfNarrow()
            }}
          >
            <FolderIcon /> Explorer <Shortcut keys={comboLabel('Mod+Shift+E', isMac(navigator.platform))} />
          </button>
          <FileTree
            ws={ws}
            current={current}
            onDrive={onDrive}
            onOpen={onOpen}
            closeIfNarrow={closeIfNarrow}
            onNewCourse={onNewCourseIn}
            onNewQuiz={onNewQuiz}
          >
            <HiddenFilesNote ws={ws} />
          </FileTree>
          {/* The sidebar's footer, a slim darker strip at its very bottom (asked for): a small What's new link (every
              release's notes in a tab, as the empty page's What's new box has), then the theme, compact. */}
          <footer className="sidebar-bar">
            <button
              type="button"
              className="link open-link sidebar-news"
              title="Every release's notes, in a tab of their own"
              onClick={() => {
                onWhatsNew()
                closeIfNarrow()
              }}
            >
              What's new <OpenIcon />
            </button>
            <label className="theme-pick">
              Theme
              <ThemeSelect theme={theme} setTheme={setTheme} />
            </label>
          </footer>
        </div>
      </nav>
      {open && <button type="button" className="scrim" aria-label="Close sidebar" tabIndex={-1} onClick={() => setOpen(false)} />}
    </>
  )
}
