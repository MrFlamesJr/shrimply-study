import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { href, parseHash, type Route } from '../route'
import { comboLabel, isMac } from '../kit/shortcuts'
import type { LibraryApi, WorkspaceApi } from '../state/useWorkspace'
import {
  BrowserIcon, ChevronsLeftIcon, CloudIcon, CrossIcon, FileIcon, FolderIcon, OpenIcon, PlusIcon, PullIcon, SaveIcon, ShrimpIcon, TumbleweedIcon,
} from '../components/Icons'
import { Shortcut } from '../components/Shortcut'
import { IconButton } from '../components/IconButton'
import { whereLine } from '../logic/whereLine'
import { ThemeSelect } from '../components/ThemeSelect'
import { HiddenFilesNote } from './HiddenFilesNote'
import type { ThemeId } from '../model'

// `lib`: the active file (null when none is open), whose courses the tree shows. `current`: the id of the course or
// quiz its tab shows.
type Props = {
  ws: WorkspaceApi
  lib: LibraryApi | null
  current?: string
  open: boolean
  setOpen: (open: boolean) => void
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  /** Opens the Google Drive dialog. */
  onDrive: () => void
  /** "+ New course": in the active file, or in a new one when none is open. */
  onNewCourse: () => void
  /** Shows the Explorer (Ctrl+Shift+E). */
  onExplorer: () => void
  /** The brand: the Welcome tab (opened, or shown where it is). */
  onHome: () => void
  /** What's new: its tab (opened, or shown where it is). */
  onWhatsNew: () => void
  /** A course or quiz of the tree, shown in the active group (`newTab`: in a new tab there). */
  onOpen: (route: Route, newTab: boolean) => void
  /** A file's row (`FileRow`): the file's home, focused where a tab shows it, else in the active group (App). */
  onFile: (id: string) => void
}

const WIDE = '(min-width: 800px)'
const parseHashOf = (link: HTMLAnchorElement) => parseHash(link.getAttribute('href') ?? '')
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
 * Where a file lives: its Google Drive file (whose only as far as anyone can tell: "Your" needs a sign-in and Google's
 * word; signed out, nobody knows), the .shrimp file it is tied to, or none yet (kept only in this browser).
 */
function whereOf(doc: LibraryApi): [typeof FileIcon, string] {
  const drive = doc.drive.file
  const where = whereLine({ hasFile: doc.file !== null, drive, yours: doc.drive.yours, signedIn: doc.drive.signedIn() })
  return [drive ? CloudIcon : doc.file ? FileIcon : BrowserIcon, where]
}

// What Save does for this file, for its tooltip.
function saveHint(doc: LibraryApi): string {
  const drive = doc.drive.file
  if (drive) return doc.drive.savesInto ? `Save into ${drive.name} on Google Drive` : `Save a copy of ${drive.name} to your Google Drive`
  return doc.file ? `Save into ${doc.file.name}` : 'Save as a .shrimp file'
}

/**
 * One open file: its name (a dot while it has unsaved changes) and where it lives; selecting it makes it the active
 * file, whose courses the tree below shows. Save, Download and Close show while the row is pointed at or holds the
 * focus (their room always kept). A shared file not known to be yours has the quiet Pull changes link under it.
 */
function FileRow({ doc, active, onPick }: { doc: LibraryApi; active: boolean; onPick: () => void }) {
  const [Icon, where] = whereOf(doc)
  const drive = doc.drive.file
  // Tied to a .shrimp file or the user's own Drive file, with nothing new: nothing to save. A file with no home yet
  // can always be saved as one.
  const nothing = !doc.hasChanges && (!!doc.file || doc.drive.savesInto)
  return (
    <li className={active ? 'file-row is-active' : 'file-row'}>
      <button type="button" className="file-pick" aria-current={active ? 'true' : undefined} title={doc.name} onClick={onPick}>
        <Icon />
        <span className="file-name">
          <span className="file-name-text">{doc.name}</span>
          {doc.hasChanges && <span className="file-dot" role="img" aria-label="Unsaved changes" title="Unsaved changes" />}
        </span>
        <span className="file-where">{where}</span>
      </button>
      <span className="file-actions">
        <IconButton label={`Save ${doc.name}`} title={nothing ? 'No changes to save' : saveHint(doc)} disabled={nothing} onClick={() => void doc.save()}>
          <SaveIcon />
        </IconButton>
        <IconButton label={`Download ${doc.name}`} title="Download a copy as a .shrimp file" onClick={() => void doc.download()}>
          <PullIcon />
        </IconButton>
        <IconButton
          label={`Close ${doc.name}`}
          title={doc.hasChanges ? 'Close this file. It asks to save your changes first.' : 'Close this file'}
          onClick={() => void doc.close()}
        >
          <CrossIcon />
        </IconButton>
      </span>
      {/* Someone else's changes come only when pulled, never on their own (asked for); it warns before replacing. */}
      {drive?.shared && !doc.drive.yours && (
        <button
          type="button"
          className="link file-pull"
          title="Bring the newest version from Google Drive here. Asks first, as it replaces its courses here."
          // The page stays when the pulled library still has it (App moves on quietly when not).
          onClick={() => void doc.drive.pull()}
        >
          <PullIcon /> {doc.drive.newer ? 'Pull new changes' : 'Pull changes'}
        </button>
      )}
    </li>
  )
}

/**
 * The open files, between the brand and the courses: a heading with New file, Open file, Google Drive and Save all,
 * then one row per file, the active one selected.
 */
function OpenFiles({ ws, onDrive, onFile, closeIfNarrow, children }: { ws: WorkspaceApi; onDrive: () => void; onFile: (id: string) => void; closeIfNarrow: () => void; children?: ReactNode }) {
  const unsaved = ws.docs.some((d) => d.dirty)
  return (
    <section className="files" aria-label="Open files">
      <div className="files-head">
        <p className="sidebar-label">Files</p>
        <IconButton
          label="New file"
          title="Start an empty library beside the open ones, saved later as a new .shrimp file"
          onClick={() => {
            ws.newDoc()
            closeIfNarrow()
          }}
        >
          <PlusIcon />
        </IconButton>
        <IconButton
          label={ws.loadLabel}
          title={ws.loadHint}
          onClick={async () => {
            if (await ws.openFile()) closeIfNarrow()
          }}
        >
          <FileIcon />
        </IconButton>
        <IconButton label="Google Drive" title="Save to your Google Drive, share a link, or open your Drive libraries" onClick={onDrive}>
          <CloudIcon />
        </IconButton>
        {/* Greyed out with nothing to save, like a file's own Save. */}
        <IconButton
          label="Save all"
          title={unsaved ? `Save every file with changes (${comboLabel('Mod+Alt+S', isMac(navigator.platform))})` : 'No changes to save'}
          disabled={!unsaved}
          onClick={() => void ws.saveAll()}
        >
          <SaveIcon />
        </IconButton>
      </div>
      {ws.docs.length > 0 && (
        <ul className="files-list">
          {ws.docs.map((d) => (
            <FileRow key={d.id} doc={ws.doc(d.id)} active={d.id === ws.active} onPick={() => onFile(d.id)} />
          ))}
        </ul>
      )}
      {children}
    </section>
  )
}

export function Sidebar({ ws, lib, current, open, setOpen, theme, setTheme, onDrive, onNewCourse, onExplorer, onHome, onWhatsNew, onOpen, onFile }: Props) {
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
          <OpenFiles ws={ws} onDrive={onDrive} onFile={onFile} closeIfNarrow={closeIfNarrow}>
            <HiddenFilesNote ws={ws} />
          </OpenFiles>
          <p className="sidebar-label">Courses</p>
          {!lib || lib.library.courses.length === 0 ? (
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
            <ul
              className="tree"
              // A course or quiz shows in the active group, never in a tab of another file; Ctrl or the middle
              // button opens it in a new tab there.
              onClick={(e) => {
                const link = (e.target as HTMLElement).closest('a')
                if (!link || e.shiftKey || e.altKey) return
                e.preventDefault()
                onOpen(parseHashOf(link), e.ctrlKey || e.metaKey)
                closeIfNarrow()
              }}
              onAuxClick={(e) => {
                const link = (e.target as HTMLElement).closest('a')
                if (!link || e.button !== 1) return
                e.preventDefault()
                onOpen(parseHashOf(link), true)
              }}
            >
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
                onNewCourse()
                closeIfNarrow()
              }}
            >
              <PlusIcon /> New course
            </button>
            {/* A small link right above the Theme row (asked for), as home's What's new box has: every release's notes in a tab. */}
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
          </div>
        </div>
      </nav>
      {open && <button type="button" className="scrim" aria-label="Close sidebar" tabIndex={-1} onClick={() => setOpen(false)} />}
    </>
  )
}
