import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { href, parseHash, type Route } from '../route'
import { comboLabel, isMac } from '../kit/shortcuts'
import { flatten, keyNav, typeahead } from '../kit/tree'
import type { LibraryApi, WorkspaceApi } from '../state/useWorkspace'
import type { DocId } from '../logic/contentOps'
import { nodeOf, refOf } from '../logic/explorerTree'
import { countLine, fileInfo, fileTreeSource, unfoldFor } from '../logic/fileTree'
import { plural } from '../logic/plural'
import { whereLine } from '../logic/whereLine'
import { ownWindow } from '../components/ownWindow'
import { IconButton } from '../components/IconButton'
import {
  BrowserIcon, ChevronDownIcon, ChevronsUpIcon, CloudIcon, CourseIcon, CrossIcon, FileIcon, PlusIcon, PullIcon, QuizIcon, SaveIcon,
} from '../components/Icons'

type Props = {
  ws: WorkspaceApi
  /** The id of the course or quiz the address tab shows. */
  current?: string
  /** Opens the Google Drive dialog. */
  onDrive: () => void
  /** A page of a file, shown in the active group (`newTab`: in a new tab there). */
  onOpen: (doc: DocId, route: Route, newTab: boolean) => void
  closeIfNarrow: () => void
  /** A new course in this file, then its page (the page's name field selected). */
  onNewCourse: (doc: DocId) => void
  /** A new quiz in this course, then its editor. */
  onNewQuiz: (doc: DocId, course: string) => void
  /** Rendered at the very end of the section. */
  children?: ReactNode
}

const HOVER_MS = 400
const CARD_GAP = 8

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

const infoOf = (doc: LibraryApi): string[] =>
  fileInfo({
    where: whereOf(doc)[1],
    fileName: doc.file?.name ?? null,
    driveName: doc.drive.file?.name ?? null,
    shared: !!doc.drive.file?.shared,
    newer: !!doc.drive.newer,
    dirty: doc.hasChanges,
    hasHome: !!doc.file || !!doc.drive.file,
    counts: countLine(doc.library),
  })

// A row's icon, which turns into its fold chevron while the row is pointed at (asked for); with something to fold,
// the cell takes the fold click.
const glyph = (icon: ReactNode, expandable: boolean) => (
  <span className="file-glyph" data-chevron={expandable ? '' : undefined} aria-hidden>
    {icon}
    {expandable && (
      <span className="file-chevron">
        <ChevronDownIcon />
      </span>
    )}
  </span>
)

/**
 * The sidebar's one tree: every open file, its courses, their quizzes. The active file and the current course unfold
 * by themselves (nothing folds by itself). A file's row has Save, Download and Close while it is pointed at or holds
 * the focus; pointing at it for a moment shows what it is in a card beside the sidebar.
 */
export function FileTree({ ws, current, onDrive, onOpen, closeIfNarrow, onNewCourse, onNewQuiz, children }: Props) {
  const unsaved = ws.docs.some((d) => d.dirty)
  const uid = useId()
  const root = useRef<HTMLElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const pending = useRef<string | null>(null)
  const typed = useRef({ text: '', at: 0 })
  const [focusId, setFocusId] = useState<string | null>(null)
  const [hover, setHover] = useState<{ title: string; lines: string[]; top: number } | null>(null)

  const activeLib = ws.active ? ws.doc(ws.active).library : null
  const currentCourse = (current && activeLib?.courses.find((c) => c.id === current || c.quizzes.some((q) => q.id === current))?.id) || null
  const [expanded, setExpanded] = useState(() => unfoldFor(new Set(), ws.active, currentCourse))
  useEffect(() => setExpanded((e) => unfoldFor(e, ws.active, currentCourse)), [ws.active, currentCourse])

  const open = ws.docs.map((d) => ({ id: d.id, name: d.name, library: ws.doc(d.id).library }))
  // Cheap (files, courses and quizzes only), so built again each render.
  const source = fileTreeSource(open)
  const rows = flatten(source, expanded)

  // The id of the row for the page shown: the course or quiz, else the active file's home.
  const pageId = (() => {
    if (!ws.active || !activeLib) return null
    const home = nodeOf({ kind: 'doc', doc: ws.active })
    if (!current) return home
    const course = activeLib.courses.find((c) => c.id === current)
    if (course) return nodeOf({ kind: 'course', doc: ws.active, course: course.id })
    const holder = activeLib.courses.find((c) => c.quizzes.some((q) => q.id === current))
    return holder ? nodeOf({ kind: 'quiz', doc: ws.active, course: holder.id, quiz: current }) : home
  })()
  const visible = (id: string | null) => id !== null && rows.some((r) => r.id === id)
  const tabId = visible(focusId) ? focusId : visible(pageId) ? pageId : (rows[0]?.id ?? null)

  useEffect(() => {
    if (pending.current === null) return
    root.current?.querySelector<HTMLElement>(`[data-id="${pending.current}"]`)?.focus()
    pending.current = null
  })

  const toggle = (id: string) =>
    setExpanded((e) => {
      const next = new Set(e)
      if (!next.delete(id)) next.add(id)
      return next
    })
  // A file's row opens its home ("Your courses"), through App's open handler like the course and quiz rows (asked
  // for): a tab already showing it, in any group or window, else the focused group. It unfolds the file too.
  const pick = (doc: DocId) => {
    onOpen(doc, { name: 'home' }, false)
    setExpanded((e) => unfoldFor(e, doc, null))
    closeIfNarrow()
  }

  // ---- the hover card
  const hideCard = () => {
    if (root.current) ownWindow(root.current).clearTimeout(timer.current)
    setHover(null)
  }
  useLayoutEffect(() => {
    const el = card.current
    if (!el) return
    if (!hover) {
      if (el.matches(':popover-open')) el.hidePopover()
      return
    }
    if (!el.matches(':popover-open')) el.showPopover()
    const win = ownWindow(el)
    const side = el.closest('.sidebar')?.getBoundingClientRect().right ?? 0
    el.style.left = `${side + CARD_GAP}px`
    el.style.top = `${Math.max(CARD_GAP, Math.min(hover.top, win.innerHeight - el.offsetHeight - CARD_GAP))}px`
  }, [hover])
  useEffect(() => hideCard, [])

  const openNode = (node: string) => {
    const r = refOf(node)
    if (r.kind === 'doc') return pick(r.doc)
    const course = ws.doc(r.doc).library.courses.find((c) => c.id === r.course)
    if (r.kind === 'course') onOpen(r.doc, { name: 'course', course: course?.name ?? '' }, false)
    else if (r.kind === 'quiz') {
      onOpen(r.doc, { name: 'quiz', course: course?.name ?? '', quiz: course?.quizzes.find((q) => q.id === r.quiz)?.name ?? '' }, false)
    }
    closeIfNarrow()
  }

  const onTreeKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    if (target.getAttribute('role') !== 'treeitem' || e.ctrlKey || e.metaKey || e.altKey) return
    const id = target.dataset.id!
    if (e.key === ' ') {
      e.preventDefault()
      openNode(id)
      return
    }
    const nav = keyNav(rows, id, e.key)
    if (nav) {
      e.preventDefault()
      if (nav.focus) {
        pending.current = nav.focus
        setFocusId(nav.focus)
      }
      if (nav.expand) setExpanded((x) => new Set(x).add(nav.expand!))
      if (nav.collapse) toggle(nav.collapse)
      if (nav.activate) openNode(nav.activate)
      return
    }
    if (e.key.length === 1) {
      const t = typed.current
      const now = Date.now()
      t.text = now - t.at > 700 ? e.key : t.text + e.key
      t.at = now
      const hit = typeahead(rows, id, t.text, source.label)
      if (hit) {
        e.preventDefault()
        pending.current = hit
        setFocusId(hit)
      }
    }
  }

  const linkOpen = (link: HTMLAnchorElement, newTab: boolean) => {
    const item = link.closest<HTMLElement>('[data-id]')!
    onOpen(refOf(item.dataset.id!).doc, parseHash(link.getAttribute('href') ?? ''), newTab)
  }

  const onTreeClick = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement
    const chev = target.closest<HTMLElement>('[data-chevron]')
    if (chev) {
      e.preventDefault()
      e.stopPropagation()
      toggle(chev.closest<HTMLElement>('[data-id]')!.dataset.id!)
      return
    }
    const link = target.closest('a')
    if (link) {
      if (e.shiftKey || e.altKey) return
      e.preventDefault()
      linkOpen(link, e.ctrlKey || e.metaKey)
      closeIfNarrow()
      return
    }
    const filePick = target.closest<HTMLElement>('.file-pick')
    if (filePick) pick(refOf(filePick.dataset.id!).doc)
  }

  const showCard = (doc: DocId, row: HTMLElement) => {
    const win = ownWindow(row)
    win.clearTimeout(timer.current)
    timer.current = win.setTimeout(() => {
      const api = ws.doc(doc)
      setHover({ title: api.name, lines: infoOf(api), top: row.getBoundingClientRect().top })
    }, HOVER_MS)
  }

  return (
    <section className="files" aria-label="Open files" ref={root}>
      <div className="files-head">
        <h2 className="files-title">Files</h2>
        <span className="files-count">{ws.docs.length}</span>
        <span className="files-gap" />
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
        {/* Greyed out while nothing shown is unfolded, like Save all with nothing to save. */}
        <IconButton
          label="Fold all"
          title={rows.some((r) => r.expanded) ? 'Fold every file' : 'Nothing to fold'}
          disabled={!rows.some((r) => r.expanded)}
          onClick={() => setExpanded(new Set())}
        >
          <ChevronsUpIcon />
        </IconButton>
      </div>
      {ws.docs.length > 0 && (
        <ul
          className="files-tree"
          role="tree"
          aria-label="Open files"
          // A course or quiz shows in the active group; Ctrl or the middle button opens it in a new tab there.
          onClick={onTreeClick}
          onAuxClick={(e) => {
            const link = (e.target as HTMLElement).closest('a')
            if (!link || e.button !== 1) return
            e.preventDefault()
            linkOpen(link, true)
          }}
          onKeyDown={onTreeKeyDown}
          onFocus={(e) => {
            const t = e.target as HTMLElement
            if (t.getAttribute('role') === 'treeitem') setFocusId(t.dataset.id!)
          }}
          onScroll={hideCard}
          onPointerDown={hideCard}
        >
          {source.roots.map((rootId) => {
            const docId = refOf(rootId).doc
            const doc = ws.doc(docId)
            const [Icon, where] = whereOf(doc)
            const drive = doc.drive.file
            const active = docId === ws.active
            const isOpen = expanded.has(rootId)
            const courses = doc.library.courses
            const nothing = !doc.hasChanges && (!!doc.file || doc.drive.savesInto)
            const infoId = `${uid}-info-${docId}`
            const rowTab = tabId === rootId ? 0 : -1
            return (
              <li key={docId} role="none" className={active ? 'file-block is-active' : 'file-block'}>
                <div
                  className={active ? 'file-row is-active' : 'file-row'}
                  role="none"
                  onPointerEnter={(e) => e.pointerType === 'mouse' && showCard(docId, e.currentTarget)}
                  onPointerLeave={hideCard}
                >
                  <div
                    className="file-pick"
                    role="treeitem"
                    data-id={rootId}
                    aria-level={1}
                    aria-expanded={courses.length > 0 ? isOpen : undefined}
                    aria-current={pageId === rootId ? 'page' : undefined}
                    aria-describedby={infoId}
                    tabIndex={rowTab}
                  >
                    {glyph(<Icon />, courses.length > 0)}
                    <span className="file-name">
                      <span className="file-name-text">{doc.name}</span>
                      {doc.hasChanges && <span className="file-dot" role="img" aria-label="Unsaved changes" title="Unsaved changes" />}
                    </span>
                    <span className="file-where">{where}</span>
                  </div>
                  {/* A small toolbar that slides in over the end of the name line while the row is pointed at (or holds the
                      keyboard focus): Save (greyed out with nothing to save), New course, Download a copy and Close,
                      each one click away (asked for: no menu, nothing twice). */}
                  <span className="file-actions">
                    <IconButton
                      label={`Save ${doc.name}`}
                      title={nothing ? 'No changes to save' : saveHint(doc)}
                      disabled={nothing}
                      tabIndex={rowTab}
                      onClick={() => void doc.save()}
                    >
                      <SaveIcon />
                    </IconButton>
                    <IconButton
                      label={`New course in ${doc.name}`}
                      title="Add a course to this file"
                      tabIndex={rowTab}
                      onClick={() => {
                        onNewCourse(docId)
                        closeIfNarrow()
                      }}
                    >
                      <PlusIcon />
                    </IconButton>
                    <IconButton label={`Download ${doc.name}`} title="Download a copy as a .shrimp file" tabIndex={rowTab} onClick={() => void doc.download()}>
                      <PullIcon />
                    </IconButton>
                    <IconButton
                      label={`Close ${doc.name}`}
                      title={doc.hasChanges ? 'Close this file. It asks to save your changes first.' : 'Close this file'}
                      tabIndex={rowTab}
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
                  <span hidden id={infoId}>
                    {infoOf(doc).join('. ')}
                  </span>
                </div>
                {isOpen && courses.length > 0 && (
                  <ul role="group" className="file-courses">
                    {courses.map((course) => {
                      const courseNode = nodeOf({ kind: 'course', doc: docId, course: course.id })
                      const courseOpen = expanded.has(courseNode)
                      return (
                        <li key={course.id} role="none" className="file-course-item">
                          {/* The row and its New quiz, shown while the row is pointed at or holds the focus. */}
                          <div className="file-course-line" role="none">
                          <a
                            className="file-course"
                            role="treeitem"
                            data-id={courseNode}
                            href={href({ name: 'course', course: course.name })}
                            aria-level={2}
                            aria-expanded={course.quizzes.length > 0 ? courseOpen : undefined}
                            aria-current={pageId === courseNode ? 'page' : undefined}
                            tabIndex={tabId === courseNode ? 0 : -1}
                            title={`${course.name || 'Untitled course'}: ${plural(course.quizzes.length, 'quiz', 'quizzes')}`}
                          >
                            {glyph(<CourseIcon />, course.quizzes.length > 0)}
                            <span className="file-label">{course.name || 'Untitled course'}</span>
                          </a>
                          <span className="file-add">
                            <IconButton
                              label={`New quiz in ${course.name || 'Untitled course'}`}
                              title="Add a quiz to this course"
                              tabIndex={tabId === courseNode ? 0 : -1}
                              onClick={() => {
                                onNewQuiz(docId, course.id)
                                closeIfNarrow()
                              }}
                            >
                              <PlusIcon />
                            </IconButton>
                          </span>
                          </div>
                          {courseOpen && course.quizzes.length > 0 && (
                            <ul role="group" className="file-quizzes">
                              {course.quizzes.map((quiz) => {
                                const quizNode = nodeOf({ kind: 'quiz', doc: docId, course: course.id, quiz: quiz.id })
                                return (
                                  <li key={quiz.id} role="none">
                                    <a
                                      className="file-quiz"
                                      role="treeitem"
                                      data-id={quizNode}
                                      href={href({ name: 'quiz', course: course.name, quiz: quiz.name })}
                                      aria-level={3}
                                      aria-current={pageId === quizNode ? 'page' : undefined}
                                      tabIndex={tabId === quizNode ? 0 : -1}
                                      title={`${quiz.name || 'Untitled quiz'}: ${plural(quiz.cards.length, 'card')}`}
                                    >
                                      {glyph(<QuizIcon />, false)}
                                      <span className="file-label">{quiz.name || 'Untitled quiz'}</span>
                                    </a>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {ws.docs.length === 0 && (
        <div className="tree-empty">
          <p>No files open</p>
          <p className="tree-empty-hint">
            Start one with <strong>New file</strong> or <strong>Open file</strong> above.
          </p>
        </div>
      )}
      {children}
      <div className="file-info" popover="manual" ref={card}>
        {hover && (
          <>
            <p className="file-info-title">{hover.title}</p>
            {hover.lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
