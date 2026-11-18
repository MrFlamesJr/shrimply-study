import { useEffect, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Route } from '../route'
import { comboLabel, isMac } from '../kit/shortcuts'
import type { WorkspaceApi } from '../state/useWorkspace'
import type { DocId } from '../logic/contentOps'
import { statusText } from '../logic/autosave'
import { ChevronsLeftIcon, CloudAlertIcon, CloudOffIcon, FolderIcon, ShrimpIcon } from '../components/Icons'
import { OpenLink } from '../components/OpenLink'
import { Shortcut } from '../components/Shortcut'
import type { DriveFiles } from '../state/useDriveFiles'
import { FileTree } from './FileTree'
import { ThemeSelect } from '../components/ThemeSelect'
import { AccountBox } from './AccountBox'
import type { ThemeId } from '../model'
import { loadSidebarClosed, saveSidebarClosed } from '../storage/sidebarPref'

// `current`: the id of the course or quiz the address tab shows.
type Props = {
  ws: WorkspaceApi
  current?: string
  /** Google Drive's libraries, for the Files heading's count. */
  driveFiles: DriveFiles
  open: boolean
  setOpen: (open: boolean) => void
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  /** The Files heading's Open: the Open dialog. */
  onOpenDialog: () => void
  /** New file (App asks where it lives when that is a choice). */
  onNewFile: () => string | null
  /** A library's Share dialog, and a browser library's Upload to Google Drive dialog. */
  onShare: (doc: DocId) => void
  onUpload: (doc: DocId) => void
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
 * Whether the sidebar is open. On wide screens it is beside the page, open unless the user closed it, which this
 * browser remembers so a reload keeps it (asked for); on small screens it covers the page, so it starts closed there.
 * Crossing the breakpoint (resizing or zooming the window) gives it that size's state.
 */
export function useSidebarOpen() {
  const wideOpen = () => matchMedia(WIDE).matches && !loadSidebarClosed()
  const [open, setOpen] = useState(wideOpen)
  useEffect(() => {
    const wide = matchMedia(WIDE)
    const onChange = () => setOpen(wideOpen())
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [])
  const set = (next: boolean) => {
    if (matchMedia(WIDE).matches) saveSidebarClosed(!next)
    setOpen(next)
  }
  return [open, set] as const
}

export function Sidebar({ ws, current, driveFiles, open, setOpen, theme, setTheme, onOpenDialog, onNewFile, onShare, onUpload, onNewCourseIn, onNewQuiz, onExplorer, onHome, onWhatsNew, onOpen }: Props) {
  // On small screens the open sidebar covers the page, so close it after picking something.
  const closeIfNarrow = () => isNarrow() && setOpen(false)

  /**
   * The toggle. The workbench snaps to its new width in one layout, then it (or the app's own page) and the top-left
   * tab strip, which makes room for the corner while the sidebar is closed, glide from where they were by transform
   * alone, so nothing is laid out again each frame while the sidebar slides (CSS). The strip moves inside the
   * workbench, so it glides only by its own part. A click mid-glide starts from where they are. On small screens the
   * drawer covers the page, so nothing else moves.
   */
  // The corner badge (closed sidebar only): signed out, or a save that needs attention (paused).
  const needy = ws.docs.filter((d) => d.dirty)
  const signedOut = ws.drive.setUp && !ws.drive.signedIn()
  const badge = open ? null : signedOut ? 'signedOut' : needy.length > 0 ? 'paused' : null
  // Widens the closed corner (shell.css) while the badge shows.
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-account', badge !== null)
    return () => document.documentElement.removeAttribute('data-account')
  }, [badge])

  const toggle = () => {
    // Closing: the badge grows from the account box's icon to its place in the corner.
    const origin = open && (signedOut || needy.length > 0) ? document.querySelector('.account-box svg, .account-box')?.getBoundingClientRect() : undefined
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
    const to = origin && document.querySelector('.corner-badge')
    if (to) {
      const now = to.getBoundingClientRect()
      const x = origin!.left + origin!.width / 2 - (now.left + now.width / 2)
      const y = origin!.top + origin!.height / 2 - (now.top + now.height / 2)
      to.animate({ transform: [`translate(${x}px, ${y}px)`, 'none'] }, timing)
    }
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
        {badge && (
          <button
            type="button"
            className={badge === 'paused' ? 'corner-badge is-paused' : 'corner-badge'}
            aria-label={badge === 'paused' ? statusText(ws.doc(needy[0].id).status) : 'Not signed in. Sign in with Google'}
            title={badge === 'paused' ? `${statusText(ws.doc(needy[0].id).status)}. Save now` : 'Not signed in. Sign in with Google to keep your libraries in your Google Drive'}
            onClick={() => {
              if (badge === 'paused') needy.forEach((d) => void ws.doc(d.id).saveNow())
              else void ws.drive.signIn()
            }}
          >
            {badge === 'paused' ? <CloudAlertIcon /> : <CloudOffIcon />}
          </button>
        )}
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
          {ws.drive.setUp && <AccountBox drive={ws.drive} />}
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
            driveFiles={driveFiles}
            onOpenDialog={onOpenDialog}
            onNewFile={onNewFile}
            onShare={onShare}
            onUpload={onUpload}
            onOpen={onOpen}
            closeIfNarrow={closeIfNarrow}
            onNewCourse={onNewCourseIn}
            onNewQuiz={onNewQuiz}
          />
          {ws.drive.setUp && <AccountBox drive={ws.drive} bottom />}
          {/* The sidebar's footer, a slim darker strip at its very bottom (asked for): a small What's new link (every
              release's notes in a tab, as the empty page's What's new box has), then the theme, compact. */}
          <footer className="sidebar-bar">
            <OpenLink
              className="sidebar-news"
              title="Every release's notes"
              onOpen={() => {
                onWhatsNew()
                closeIfNarrow()
              }}
            >
              What's new
            </OpenLink>
            {/* One control: a click on its name opens the list too (a label alone would only focus it). */}
            <label
              className="theme-pick"
              onClick={(e) => {
                const select = e.currentTarget.querySelector('select')
                // A click on the select itself, or on an option in its list (a customizable select's options are
                // inside it), is the select's own: picking a theme closes the list, never opens it again (asked for).
                if (!select || select.contains(e.target as Node)) return
                try {
                  select.showPicker()
                } catch {
                  select.focus()
                }
              }}
            >
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
