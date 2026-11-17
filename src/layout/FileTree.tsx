import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { href, parseHash, type Route } from '../route'
import { flatten, keyNav, typeahead } from '../kit/tree'
import type { LibraryApi, WorkspaceApi } from '../state/useWorkspace'
import type { DriveFiles } from '../state/useDriveFiles'
import type { DocId } from '../logic/contentOps'
import { closedEntries, libraryTotal, nodeOf, refOf } from '../logic/explorerTree'
import { countLine, fileInfo, fileTreeSource, libraryCounts, unfoldFor } from '../logic/fileTree'
import { needsAttention, statusText, type SaveProblem } from '../logic/autosave'
import { fileNameProblem } from '../logic/names'
import { plural } from '../logic/plural'
import { whereLine, whereWithStatus } from '../logic/whereLine'
import { bareName } from '../state/workspace'
import { AutoText } from '../components/AutoText'
import { ownWindow } from '../components/ownWindow'
import { IconButton } from '../components/IconButton'
import {
  BrowserIcon, CheckIcon, ChevronDownIcon, ChevronsUpIcon, CloudIcon, CopyIcon, CourseIcon, CrossIcon, DriveIcon, FileIcon, FolderIcon, OpenIcon, PlusIcon, PullIcon,
  QuizIcon, SaveIcon, ShareIcon,
} from '../components/Icons'

type Props = {
  ws: WorkspaceApi
  /** The id of the course or quiz the address tab shows. */
  current?: string
  /** Google Drive's libraries, for the count of libraries. */
  driveFiles: DriveFiles
  /** Opens the Open dialog (the Files heading's Open). */
  onOpenDialog: () => void
  /** New file: App asks where it lives when that is a choice. Gives the new library's id when it is there to be named. */
  onNewFile: () => DocId | null
  /** A library's Share dialog. */
  onShare: (doc: DocId) => void
  /** A browser library's Upload to Google Drive dialog. */
  onUpload: (doc: DocId) => void
  /** A page of a file, shown in the active group (`newTab`: in a new tab there). */
  onOpen: (doc: DocId, route: Route, newTab: boolean) => void
  closeIfNarrow: () => void
  /** A new course in this file, then its page (the page's name field selected). */
  onNewCourse: (doc: DocId) => void
  /** A new quiz in this course, then its editor. */
  onNewQuiz: (doc: DocId, course: string) => void
}

// The card opens as soon as the pointer is on a file (asked for: snappy, never a wait).
const HOVER_MS = 0
const CARD_GAP = 8

/**
 * Where a library lives, with its save status after it: its Google Drive file (whose only as far as anyone can tell:
 * "Your" needs a sign-in and Google's word), or only this browser. A view-only library says so instead.
 */
function whereOf(doc: LibraryApi): [typeof CloudIcon, string] {
  // A file that was moved or deleted is only in this browser now (and says so in red, see `isMissing`).
  const icon = doc.where === 'drive' ? CloudIcon : doc.where === 'device' && doc.status !== 'missing' ? FileIcon : BrowserIcon
  if (doc.readOnly) return [icon, 'View only']
  const where = whereLine({ drive: doc.drive.file, yours: doc.drive.yours, signedIn: doc.drive.signedIn(), file: doc.fileName })
  return [icon, whereWithStatus(where, doc.status, doc.where)]
}

// The save slot: a browser library uploads, a view-only one makes its own copy. A library that saves itself has none
// while it saves as it should (asked for: a button greyed out nearly always was noise); only a paused save shows one,
// in the same place, that fixes it in one click (Ctrl+S saves at any time). A file that was moved or deleted has
// Locate file under its row instead.
const FIX_TITLE: Record<SaveProblem, string> = {
  signIn: 'Sign in again and save',
  offline: 'Save now',
  conflict: 'Changed: choose which to keep',
  error: 'Save now',
  permission: 'Allow access and save',
  missing: 'Locate file',
}
function saveSlot(doc: LibraryApi): { label: string; title: string } | null {
  if (doc.readOnly) return { label: `Make a copy of ${doc.name}`, title: 'Make a copy you can change' }
  if (doc.where === 'browser') return { label: `Upload ${doc.name}`, title: 'Upload to Google Drive' }
  if (!needsAttention(doc.status) || doc.status === 'missing') return null
  const title = doc.status === 'conflict' ? `Changed on ${doc.where === 'device' ? 'this device' : 'Google Drive'}: choose which to keep` : FIX_TITLE[doc.status]
  return { label: `Save ${doc.name}`, title }
}

const infoOf = (doc: LibraryApi): string[] =>
  fileInfo({
    where: whereOf(doc)[1],
    driveName: doc.drive.file?.name ?? doc.fileName,
    shared: !!doc.drive.file?.shared,
    problem: doc.hasChanges ? statusText(doc.status, doc.where) : null,
    saved: doc.where !== 'browser' && doc.status === 'saved',
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

const nameProblem = (name: string) => (name.trim() ? fileNameProblem(name.trim()) : 'A library needs a name.')

/**
 * A library's name as a one-line field (rename, or naming a new one): Enter or leaving keeps the text, Esc keeps the
 * old name. Text that can not be a name shows why under the field and is not kept.
 */
function RenameField({ start, onCommit, onCancel }: { start: string; onCommit: (name: string, focusRow: boolean) => void; onCancel: (focusRow: boolean) => void }) {
  const [text, setText] = useState(start)
  const done = useRef(false)
  const finish = (name: string | null, focusRow: boolean) => {
    if (done.current) return
    done.current = true
    if (name === null) onCancel(focusRow)
    else onCommit(name, focusRow)
  }
  return (
    <span className="file-rename" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <AutoText
        className="file-rename-field"
        aria-label="Library name"
        value={text}
        onChange={setText}
        selectOnMount
        required
        check={nameProblem}
        onEnter={(box) => {
          if (!nameProblem(box.value)) finish(box.value, true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            finish(null, true)
          }
        }}
        onBlur={(e) => finish(nameProblem(e.currentTarget.value) ? null : e.currentTarget.value, false)}
      />
    </span>
  )
}

/**
 * The sidebar's one tree: every open file, its courses, their quizzes. The active file and the current course unfold
 * by themselves (nothing folds by itself). A file's row has its save slot, Share, New course, Download and Close while it is pointed at or holds
 * the focus; pointing at it for a moment shows what it is in a card beside the sidebar.
 */
export function FileTree({ ws, current, driveFiles, onOpenDialog, onNewFile, onShare, onUpload, onOpen, closeIfNarrow, onNewCourse, onNewQuiz }: Props) {
  const uid = useId()
  const root = useRef<HTMLElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const pending = useRef<string | null>(null)
  const typed = useRef({ text: '', at: 0 })
  const [focusId, setFocusId] = useState<string | null>(null)
  // The file whose card shows, and the middle of its row (the card's arrow points there).
  // The library whose name is a field now (a double click, F2, or a library just made).
  const [renaming, setRenaming] = useState<DocId | null>(null)
  const [hover, setHover] = useState<{ doc: DocId; mid: number } | null>(null)

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

  // Rename: a view-only library says why instead (`renameDoc` refuses it with the reason).
  const startRename = (doc: DocId) => {
    const lib = ws.doc(doc)
    if (lib.readOnly) void ws.renameDoc(doc, bareName(lib.name))
    else {
      hideCard()
      setRenaming(doc)
    }
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
    // Its head level with the row, kept inside the window; the arrow then points at the row's middle.
    const head = el.querySelector<HTMLElement>('.file-info-head')
    const headMid = head ? head.offsetTop + head.offsetHeight / 2 : CARD_GAP * 3
    const top = Math.max(CARD_GAP, Math.min(hover.mid - headMid, win.innerHeight - el.offsetHeight - CARD_GAP))
    el.style.left = `${side + CARD_GAP}px`
    el.style.top = `${top}px`
    el.style.setProperty('--arrow-y', `${Math.max(CARD_GAP * 2, Math.min(hover.mid - top, el.offsetHeight - CARD_GAP * 2))}px`)
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
    if (e.key === 'F2' && refOf(id).kind === 'doc') {
      e.preventDefault()
      startRename(refOf(id).doc)
      return
    }
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
      const box = (row.querySelector('.file-pick') ?? row).getBoundingClientRect()
      setHover({ doc, mid: box.top + box.height / 2 })
    }, HOVER_MS)
  }

  // Open of all the libraries there are: the open ones, the user's Drive libraries and the closed ones.
  const total = libraryTotal(
    ws.docs.map((d) => ({ id: d.id, name: d.name, library: ws.doc(d.id).library, driveId: ws.doc(d.id).drive.file?.id ?? null })),
    ws.drive.setUp && ws.drive.signedIn() ? driveFiles.files : null,
    closedEntries(ws.closed),
  )
  const countTitle = `${ws.docs.length} open of ${plural(total, 'library', 'libraries')}`

  return (
    <section className="files" aria-label="Open files" ref={root}>
      <div className="files-head">
        <h2 className="files-title">Files</h2>
        <span className="files-count" title={countTitle} aria-label={countTitle}>
          {ws.docs.length}/{total}
        </span>
        <span className="files-gap" />
        <IconButton
          label="New file"
          title="Start an empty library beside the open ones"
          onClick={() => {
            const made = onNewFile()
            if (made) setRenaming(made)
            else closeIfNarrow()
          }}
        >
          <PlusIcon />
        </IconButton>
        <IconButton label="Open" title="Open a library from Google Drive, a link or this device" onClick={onOpenDialog}>
          <FolderIcon />
        </IconButton>
        {/* Greyed out while nothing shown is unfolded. */}
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
            const active = docId === ws.active
            const isOpen = expanded.has(rootId)
            const courses = doc.library.courses
            const slot = saveSlot(doc)
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
                      {renaming === docId ? (
                        <RenameField
                          start={bareName(doc.name)}
                          onCommit={(name, focusRow) => {
                            setRenaming(null)
                            if (focusRow) pending.current = rootId
                            void ws.renameDoc(docId, name)
                          }}
                          onCancel={(focusRow) => {
                            setRenaming(null)
                            if (focusRow) pending.current = rootId
                          }}
                        />
                      ) : (
                        <span className="file-name-text" title={`${doc.name}. Double-click to rename`} onDoubleClick={() => startRename(docId)}>
                          {doc.name}
                        </span>
                      )}
                      {doc.hasChanges && <span className="file-dot" role="img" aria-label={statusText(doc.status, doc.where)} title={statusText(doc.status, doc.where)} />}
                    </span>
                    <span className={doc.status === 'missing' ? 'file-where is-missing' : 'file-where'}>{where}</span>
                  </div>
                  {/* A small toolbar that slides in over the end of the name line while the row is pointed at (or holds the
                      keyboard focus), the same for every library: the save slot, Share, New course, Download a copy
                      and Close, each one click away (asked for: no menu, nothing twice). */}
                  <span className={renaming === docId ? 'file-actions is-hidden' : 'file-actions'}>
                    {slot && (
                      <IconButton
                        label={slot.label}
                        title={slot.title}
                        tabIndex={rowTab}
                        onClick={() => {
                          if (doc.readOnly) void doc.makeCopy()
                          else if (doc.where === 'browser') onUpload(docId)
                          else void doc.saveNow()
                        }}
                      >
                        {doc.readOnly ? <CopyIcon /> : doc.where === 'browser' ? <DriveIcon /> : <SaveIcon />}
                      </IconButton>
                    )}
                    <IconButton label={`Share ${doc.name}`} title="Share a link to this library" tabIndex={rowTab} onClick={() => onShare(docId)}>
                      <ShareIcon />
                    </IconButton>
                    <IconButton
                      label={`New course in ${doc.name}`}
                      title={doc.readOnly ? 'View only: make a copy to add courses' : 'Add a course to this file'}
                      disabled={doc.readOnly}
                      tabIndex={rowTab}
                      onClick={() => {
                        onNewCourse(docId)
                        closeIfNarrow()
                      }}
                    >
                      <PlusIcon />
                    </IconButton>
                    <IconButton label={`Download a copy of ${doc.name}`} title="Download a copy as a .shrimp file" tabIndex={rowTab} onClick={() => void doc.download()}>
                      <PullIcon />
                    </IconButton>
                    <IconButton label={`Close ${doc.name}`} title="Close this file" tabIndex={rowTab} onClick={() => void doc.close()}>
                      <CrossIcon />
                    </IconButton>
                  </span>
                  <span hidden id={infoId}>
                    {infoOf(doc).join('. ')}
                  </span>
                </div>
                {doc.status === 'missing' && (
                  <div className="file-missing">
                    <button type="button" className="link" tabIndex={rowTab} title="Pick the file again and save into it" onClick={() => void doc.locate()}>
                      Locate file
                    </button>
                  </div>
                )}
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
                              title={doc.readOnly ? 'View only: make a copy to add quizzes' : 'Add a quiz to this course'}
                              disabled={doc.readOnly}
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
            Start one with <strong>New file</strong> or <strong>Open</strong> above.
          </p>
        </div>
      )}
      <div className="file-info" popover="manual" ref={card}>
        {hover && ws.docs.some((d) => d.id === hover.doc) && <FileCard doc={ws.doc(hover.doc)} />}
      </div>
    </section>
  )
}

/**
 * A file's hover card: its icon and name over where it lives, its figures (courses, quizzes, cards) side by side, then
 * a few notes, each with its own mark: its Drive file, saved or what needs attention, shared.
 */
function FileCard({ doc }: { doc: LibraryApi }) {
  const [Icon, where] = whereOf(doc)
  const counts = libraryCounts(doc.library)
  const drive = doc.drive.file
  const home = drive?.name ?? doc.fileName
  const figures = [
    [counts.courses, counts.courses === 1 ? 'course' : 'courses'],
    [counts.quizzes, counts.quizzes === 1 ? 'quiz' : 'quizzes'],
    [counts.cards, counts.cards === 1 ? 'card' : 'cards'],
  ] as const
  const notes = [
    home && (
      <li key="home">
        {doc.where === 'device' ? <FileIcon /> : <CloudIcon />}
        <span className="file-info-home">{home}</span>
      </li>
    ),
    doc.hasChanges ? (
      <li key="saved" className="is-unsaved">
        <span className="file-info-dot" />
        {statusText(doc.status, doc.where)}
      </li>
    ) : (
      doc.where !== 'browser' &&
      doc.status === 'saved' && (
        <li key="saved">
          <CheckIcon />
          All changes saved
        </li>
      )
    ),
    drive?.shared && (
      <li key="shared">
        <OpenIcon />
        Shared with a link
      </li>
    ),
  ].filter(Boolean)
  return (
    <>
      <div className="file-info-head">
        <span className="file-info-icon">
          <Icon />
        </span>
        <div className="file-info-names">
          <p className="file-info-title">{doc.name}</p>
          <p className="file-info-where">{where}</p>
        </div>
      </div>
      <dl className="file-info-figures">
        {figures.map(([n, label]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{n}</dd>
          </div>
        ))}
      </dl>
      {notes.length > 0 && <ul className="file-info-notes">{notes}</ul>}
    </>
  )
}
