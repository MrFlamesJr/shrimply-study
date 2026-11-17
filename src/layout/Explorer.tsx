import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AutoText } from '../components/AutoText'
import type { askConfirm } from '../components/ConfirmDialog'
import { BrowserIcon, ChevronsUpIcon, ShrimpIcon, CloudIcon, CourseIcon, FileIcon, QuizIcon, FolderIcon, InfoIcon, PlusIcon, RefreshIcon } from '../components/Icons'
import { IconButton } from '../components/IconButton'
import { CardDialog } from '../components/CardDialog'
import { Modal, closeModal } from '../components/Modal'
import { ownWindow } from '../components/ownWindow'
import type { Notify } from '../components/Toasts'
import { openMenu, type MenuItem } from '../kit/ContextMenu'
import { ordered, prune, type Selection } from '../kit/selection'
import { isMac } from '../kit/shortcuts'
import { flatten, pathTo } from '../kit/tree'
import { TreeView } from '../kit/TreeView'
import { itemName, exists, type DocId, type Docs, type ItemRef, type Target } from '../logic/contentOps'
import {
  addCourse, dragEffect, addQuiz, allowInside, ancestorNodes, blankCard, insertCard, deletePlan, describeNode, type Item, type NewCardKind, reorderTarget, ungroupPlan, fileStatus, dragKind, dragLabel, dropPlan, dropRule,
  itemRefs, keyDecision, kindCount, menuFor, moveDestinations, parseNode, pasteTarget, placeItems, readOnlyOf, removeItems, renameItem,
  renameProblem, whereIcon, docIds, type Action, type DocRef, type ItemKind, type MenuContext, type Plan,
} from '../logic/explorerActions'
import { fileNameProblem } from '../logic/names'
import { closedDriveFiles, driveNodeOf, explorerSource, isPeekDoc, mergeClosed, nodeOf, parseDriveNode, peekDocs, peekDriveId, type DriveFileInfo, type DriveListing, type ExplorerClosed, type Peek } from '../logic/explorerTree'
import type { Card, Library } from '../model'
import { newId } from '../model'
import { lastSides } from '../logic/sides'
import type { LibraryApi } from '../state/useWorkspace'

export type ExplorerDoc = {
  id: DocId
  name: string
  library: Library
  /** Needs attention (a save that is paused). */
  dirty: boolean
  /** Where it lives, in words. */
  where: string
  /** The same with its save status after it: what a row shows while pointed at. */
  line: string
  /** A Google Drive file or a browser library. */
  place: 'drive' | 'device' | 'browser'
  /** View only (shared with the user): copy out, never in. */
  readOnly: boolean
  driveId?: string | null
}
export type { ExplorerClosed }
/**
 * The libraries that are not open, listed among the open files: the user's Google Drive libraries and the closed ones.
 * The host does the listing, the reading and the calls.
 */
export type ExplorerDrive = {
  /** False when Google Drive is not set up on this site: nothing about Google shows then (closed libraries still do). */
  setUp: boolean
  listing: DriveListing
  closed: ExplorerClosed[]
  /** Forgets a closed library (a browser library's record, a link's entry); the Explorer asked first. */
  forget(closedId: string): void
  /** Downloads a closed library as a file. */
  download(id: string): void
  signIn(): void
  /** Google's file picker. */
  pick(): void
  refresh(): void
  /** What the libraries expanded in the tree hold, by file id: read without opening them. */
  peeks: Record<string, Peek>
  /** Reads a library to show what is inside (again after a failure). */
  peek(id: string): void
  /** Opens a closed library as a file of the tree; `then`: an item inside it (as the peek shows it) to show once it is open. */
  open(id: string, then?: ItemRef): void
  /** Asks, then moves one of the user's own libraries to the bin. */
  remove(file: DriveFileInfo): void
}
export type ExplorerProps = {
  docs: ExplorerDoc[]
  expanded: ReadonlySet<string>
  onExpanded(next: Set<string>): void
  selection: Selection
  onSelection(next: Selection): void
  clipboard: { mode: 'copy' | 'cut'; refs: ItemRef[] } | null
  /** One undoable step. Never called with an update that throws. */
  apply(label: string, update: (docs: Docs) => Docs): void
  /** Called right after a delete: gives back the way to undo that step, offered on the toast (only while it is still the latest). */
  undoLater?(): () => void
  /** `from`: libraries that are only peeked at, which the items may come from. */
  copy(refs: ItemRef[], from?: Docs): void
  cut(refs: ItemRef[]): void
  paste(target: Target): void
  notify: Notify
  ask: typeof askConfirm
  /** Shows it (a file's home, a course, a quiz page; a card: its quiz page) in a tab of its file, reused. */
  open(node: ItemRef | DocRef): void
  /** Open in new tab: the same page in a tab of its own. */
  openNew(node: ItemRef | DocRef): void
  /** A quiz: its editor; a card: the card dialog. */
  edit(ref: ItemRef): void
  /** One file's API, for the card dialog (New card opens it right here). */
  libOf(doc: DocId): LibraryApi
  /** Gives the new library's id, so its name can be asked for on its row. */
  newDoc(): DocId
  /** Renames an open file (refusals are said with a toast). */
  renameDoc(id: DocId, name: string): void
  /** Opens a .shrimp copy from this device. */
  openFile(): void
  /** Upload to Google Drive: a browser library's dialog. */
  uploadDoc(id: DocId): void
  shareDoc(id: DocId): void
  /** A view-only library as a copy of the user's own. */
  makeCopyDoc(id: DocId): void
  downloadDoc(id: DocId): void
  closeDoc(id: DocId): void
  /** A node id to show: its ancestors open, selected, scrolled to, the tree focused. */
  reveal: string | null
  onRevealed(): void
  drive?: ExplorerDrive
  /** The one-line right-click tip shows until this is true; `onTipSeen` is called at the first right-click. */
  tipSeen?: boolean
  onTipSeen?(): void
  /** The search text (kept by the host, with the tab) and its change. */
  filter?: string
  onFilter?(next: string): void
  /** The tree's scroll place: restored on mount, reported once scrolling stops. */
  scroll?: number
  onScroll?(top: number): void
}

// Everything the Explorer can do, for its (i): short and grouped.
const HELP: [string, string][] = [
  ['Right-click', 'Right-click anything to see what you can do with it. On a touch screen, press and hold.'],
  ['Open and expand', 'Press Enter or double click to open a file, course, quiz or card in a tab beside the Explorer. The arrow keys move: Right opens a node, Left closes it. Expanding a file that is not open only shows what is inside it.'],
  ['Select several', 'Hold Ctrl to add or remove one, Shift to pick a range, Ctrl+A for all. Copy, cut, move and drag need items of one kind. Delete takes any mix.'],
  ['Copy, cut and paste', 'Ctrl+C, Ctrl+X and Ctrl+V work on courses, quizzes and cards, also between files. A pasted copy gets a free name, like "Biology (2)". Inside a file that is not open you can only copy.'],
  ['Drag', 'Drag to move. Hold Ctrl (Option on a Mac) to copy. The label says which, and a drop that is refused says why. Esc cancels. Drop between two items of the same kind to put it there.'],
  ['Groups', 'A quiz shows its ungrouped cards, then its groups, each with its color. Drop a card onto a group to add it. Groups copy, cut, paste, drag and move with their cards. Ungroup keeps the cards; Delete removes the group and its cards.'],
  ['Reorder', 'Drag an item before or after another, or press Alt+Shift+Up or Down (also Move up and Move down in the menu). Cards stay in their group.'],
  ['Move to', 'Right-click, then Move to…, to pick the destination from a list.'],
  ['New', 'New file and Open a copy from this device are at the top. Right-click a file for New course, a course for New quiz and a quiz for New card. A new course or quiz starts with its name ready to type.'],
  ['Rename', 'Press F2 to rename a file, course or quiz. Courses and quizzes stay unique in their place. On a card, F2 edits it.'],
  ['Delete', 'Delete removes cards at once, with Undo on the message. Quizzes and courses ask first. A file is closed, never deleted: a closed file stays in the list until you delete it from this browser, move it to the bin or remove it from the list.'],
  ['Search', 'Search filters every file, open or not, and keeps the parents of what matches. Esc clears it.'],
  ['Closed files', 'Open files carry an "Open" chip, the others are closed: press Enter or Open to open one again. Sign in with Google to list your Google Drive libraries too. Refresh looks again, "Choose files in Google Drive" adds files the app can not see yet.'],
  ['View only', 'A library shared with you is view only: copy out of it, never into it. Make a copy gives you one of your own.'],
  ['Undo', 'Ctrl+Z undoes the last change in any file, Ctrl+Shift+Z does it again.'],
  ['Needs attention', 'A dot after a file means its changes are not saved to Google Drive yet: sign in again, or wait until you are online.'],
]

const ROW = 32
const ROW_TOUCH = 44

const toDocs = (docs: ExplorerDoc[]): Docs => Object.fromEntries(docs.map((d) => [d.id, d.library]))
const lockedIn = (docs: ExplorerDoc[]): ReadonlySet<DocId> => new Set(docs.filter((d) => d.readOnly).map((d) => d.id))

function nodeExists(docs: Docs, node: string, drive: Set<string>): boolean {
  const g = parseDriveNode(node)
  if (g) return drive.has(g.id)
  const r = parseNode(node)
  if (!r) return false
  return r.kind === 'doc' ? r.doc in docs : exists(docs, r)
}

/** The Explorer: every open file as a tree of courses, quizzes and cards, driven only by its props. */
export function Explorer(p: ExplorerProps): ReactNode {
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef(p)
  latest.current = p
  const pending = useRef<{ id: string; focus: boolean } | null>(null)
  const filter = p.filter ?? ''
  const setFilter = (next: string) => p.onFilter?.(next)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [moving, setMoving] = useState<ItemRef[] | null>(null)
  const [touch, setTouch] = useState(false)
  const [adding, setAdding] = useState<{ doc: DocId; course: string; quiz: string; group?: string; kind: NewCardKind; key: number; card: Card } | null>(null)
  const helpId = useId()

  const docs = useMemo(() => toDocs(p.docs), [p.docs])
  const names = useMemo(() => Object.fromEntries(p.docs.map((d) => [d.id, d.name])), [p.docs])
  const meta = useMemo(() => Object.fromEntries(p.docs.map((d) => [d.id, { where: d.where, line: d.line, dirty: d.dirty, readOnly: d.readOnly }])), [p.docs])
  const files = useMemo(() => Object.fromEntries(p.docs.map((d) => [d.id, { place: d.place, readOnly: d.readOnly }])), [p.docs])
  // `drive` carries every closed library, `google` only what needs Google: nothing of it shows when it is not set up.
  const drive = p.drive
  const google = drive?.setUp ? drive : undefined
  const peeks = drive?.peeks
  // The closed libraries as the tree knows them, one list: the user's Drive list, then the closed ones it does not
  // hold (a Drive id is never listed twice). Its place says which is which, for the menus.
  const listed = google?.listing.signedIn ? google.listing.files : null
  const closedList = drive?.closed
  const { listing, closedKinds } = useMemo(() => mergeClosed(listed, closedList), [listed, closedList])
  const source = useMemo(() => explorerSource(p.docs, listing, peeks), [p.docs, listing, peeks])
  // Everything content operations work on: the open files, and the libraries only looked at (read-only).
  const docsAll = useMemo(() => ({ ...peekDocs(peeks), ...docs }), [docs, peeks])
  const readOnly = useMemo(() => readOnlyOf(files), [files])
  const expanded = p.expanded
  const driveNodes = useMemo(() => new Set(closedDriveFiles(listing, p.docs).map((f) => f.id)), [listing, p.docs])
  const order = useMemo(() => flatten(source, expanded, filter).map((r) => r.id), [source, expanded, filter])
  const cutNodes = useMemo(() => new Set(p.clipboard?.mode === 'cut' ? p.clipboard.refs.map(nodeOf) : []), [p.clipboard])
  const rowHeight = touch ? ROW_TOUCH : ROW

  const win = () => ownWindow(root.current!)
  const context = (): MenuContext => ({ docs: docsAll, names, clipboard: p.clipboard, mac: isMac(win().navigator.platform), files, closed: closedKinds, driveSetUp: !!google })
  const docsNow = () => ({ ...peekDocs(latest.current.drive?.peeks), ...toDocs(latest.current.docs) })

  useEffect(() => {
    const mq = win().matchMedia('(max-width: 799px)')
    const on = () => setTouch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // The tree's scroll place: put back on mount, and reported once the scrolling has stopped.
  useEffect(() => {
    const box = root.current!.querySelector<HTMLElement>('.kit-tree')!
    if (p.scroll) box.scrollTop = p.scroll
    const w = win()
    let timer = 0
    const on = () => {
      w.clearTimeout(timer)
      timer = w.setTimeout(() => latest.current.onScroll?.(Math.round(box.scrollTop)), 300)
    }
    box.addEventListener('scroll', on)
    return () => {
      w.clearTimeout(timer)
      box.removeEventListener('scroll', on)
    }
  }, [])

  // Forgets selected nodes that are gone (deleted, moved away, a file closed).
  useEffect(() => {
    const next = prune(p.selection, (id) => nodeExists(docsAll, id, driveNodes))
    if (next !== p.selection) p.onSelection(next)
  })

  // Scrolls to a node, and focuses it once the selection names it (the tree always draws its focused row).
  useEffect(() => {
    const want = pending.current
    if (!want) return
    const i = order.indexOf(want.id)
    if (i < 0) return
    const box = root.current!.querySelector<HTMLElement>('.kit-tree')!
    if (i * rowHeight < box.scrollTop) box.scrollTop = i * rowHeight
    else if ((i + 1) * rowHeight > box.scrollTop + box.clientHeight) box.scrollTop = (i + 1) * rowHeight - box.clientHeight
    if (!want.focus) {
      pending.current = null
      return
    }
    if (p.selection.focus !== want.id) return
    const el = box.querySelector<HTMLElement>(`[data-id="${win().CSS.escape(want.id)}"]`)
    if (el) {
      el.focus({ preventScroll: true })
      pending.current = null
    }
  })

  useEffect(() => {
    if (p.reveal === null) return
    const id = p.reveal
    const trail = pathTo(source, id)
    p.onRevealed()
    if (!trail) return
    setFilter('')
    p.onExpanded(new Set([...p.expanded, ...trail]))
    p.onSelection({ ids: [id], anchor: id, focus: id })
    pending.current = { id, focus: true }
  }, [p.reveal])

  const show = (refs: ItemRef[], opts: { focus?: boolean; select?: boolean } = {}, after: Docs = docsNow()) => {
    const nodes = refs.map(nodeOf)
    p.onExpanded(new Set([...p.expanded, ...refs.flatMap((r) => ancestorNodes(r, after))]))
    if (opts.select !== false) p.onSelection({ ids: nodes, anchor: nodes[0], focus: nodes[nodes.length - 1] })
    pending.current = { id: nodes[nodes.length - 1], focus: opts.focus ?? false }
  }

  const planned = (plan: Plan) => {
    if (!plan.ok) {
      p.notify('error', plan.reason)
      return false
    }
    p.apply(plan.label, () => plan.docs)
    show(plan.created, {}, plan.docs)
    return true
  }

  const create = (made: { docs: Docs; ref: ItemRef } | null, label: string) => {
    if (!made) {
      p.notify('error', 'That is no longer there.')
      return null
    }
    p.apply(label, () => made.docs)
    return made.ref
  }

  const remove = async (ids: string[]) => {
    const plan = deletePlan(docsNow(), ids, isMac(win().navigator.platform), lockedIn(latest.current.docs))
    if ('reason' in plan) {
      p.notify('info', plan.reason)
      return
    }
    if (plan.question !== null && !(await p.ask(plan.question, 'Delete', { danger: true }))) return
    const done = removeItems(docsNow(), plan.refs)
    if (!done.ok) {
      p.notify('error', done.reason)
      return
    }
    p.apply(plan.label, () => done.docs)
    const undo = latest.current.undoLater?.()
    p.notify('info', plan.notice, undefined, undo && { label: 'Undo', run: undo })
  }

  // Enter, double click and Open: show the page. Inside a library that is not open, that opens the library first.
  const openNode = (r: ItemRef | DocRef) => {
    // A group has no page of its own: its quiz's.
    const page: ItemRef | DocRef = r.kind === 'group' ? { kind: 'quiz', doc: r.doc, course: r.course, quiz: r.quiz } : r
    if (r.kind !== 'doc' && isPeekDoc(r.doc)) drive?.open(peekDriveId(r.doc), r)
    else p.open(page)
  }

  // Removing a closed library: a browser library is deleted from this browser, one of the user's own goes to the bin,
  // a link's entry leaves the list. The first and the last ask here; the bin asks itself.
  const removeClosed = async (id: string) => {
    const kind = closedKinds[id]
    if (kind === 'mine') {
      const file = listing.files.find((f) => f.id === id)
      if (file) drive?.remove(file)
      return
    }
    const entry = drive?.closed.find((c) => c.id === id)
    if (!entry) return
    const sure =
      kind === 'browser'
        ? await p.ask(`Delete "${entry.name}" from this browser?\n\nIt is not saved anywhere else, so it can not be brought back.`, 'Delete', { danger: true })
        : await p.ask(`Remove "${entry.name}" from the list?\n\nThe link still works: open it again from the link.`, 'Remove')
    if (sure) drive?.forget(entry.closedId)
  }

  const run = (action: Action, ids: string[], at: string | null, kind?: NewCardKind) => {
    const first = ids[0] === undefined ? null : parseNode(ids[0])
    const refs = itemRefs(ids)
    switch (action) {
      case 'newFile': return setRenaming(nodeOf({ kind: 'doc', doc: p.newDoc() }))
      case 'openFile': return p.openFile()
      case 'newCourse': {
        if (first?.kind !== 'doc') return
        const ref = create(addCourse(docsNow(), first.doc, newId()), 'New course')
        if (ref) {
          show([ref], { select: true })
          setRenaming(nodeOf(ref))
        }
        return
      }
      case 'newQuiz': {
        if (first?.kind !== 'course') return
        const ref = create(addQuiz(docsNow(), first.doc, first.course, newId()), 'New quiz')
        if (ref) {
          show([ref])
          setRenaming(nodeOf(ref))
        }
        return
      }
      case 'newCard': {
        if (first?.kind !== 'quiz' && first?.kind !== 'group') return
        const quiz = docsNow()[first.doc]?.courses.find((c) => c.id === first.course)?.quizzes.find((q) => q.id === first.quiz)
        if (!quiz) return p.notify('error', 'That is no longer there.')
        // Nothing is made until Save: the dialog opens on an empty card of the kind, here in the Explorer.
        const group = first.kind === 'group' ? first.group : undefined
        return setAdding({ doc: first.doc, course: first.course, quiz: first.quiz, group, kind: kind ?? 'term', key: 0, card: blankCard(kind ?? 'term', newId(), lastSides(quiz.cards), group) })
      }
      case 'open': return first && openNode(first)
      case 'openNew': return first && first.kind !== 'card' && !(first.kind !== 'doc' && isPeekDoc(first.doc)) && p.openNew(first)
      case 'edit': return first && first.kind !== 'doc' && p.edit(first)
      case 'rename': return first && first.kind !== 'card' && setRenaming(ids[0])
      case 'copy': return p.copy(refs, refs.some((r) => isPeekDoc(r.doc)) ? peekDocs(latest.current.drive?.peeks) : undefined)
      case 'cut': return p.cut(refs)
      case 'paste': {
        const r = pasteTarget(docsNow(), latest.current.clipboard, at, lockedIn(latest.current.docs))
        return 'reason' in r ? p.notify('info', r.reason) : p.paste(r.target)
      }
      case 'moveTo': return setMoving(refs)
      case 'moveUp':
      case 'moveDown': {
        if (refs.length !== 1) return
        const t = reorderTarget(docsNow(), refs[0], action === 'moveUp' ? 'up' : 'down')
        if ('reason' in t) return p.notify('info', t.reason)
        return void planned(placeItems(docsNow(), refs, t.target, 'move', newId, action === 'moveUp' ? 'Move up' : 'Move down'))
      }
      case 'ungroup': {
        const plan = refs[0]?.kind === 'group' ? ungroupPlan(docsNow(), refs[0]) : null
        if (!plan) return
        return void p.ask(plan.question, 'Ungroup').then((yes) => {
          if (!yes) return
          const again = refs[0].kind === 'group' ? ungroupPlan(docsNow(), refs[0]) : null
          if (again) p.apply(again.label, () => again.docs)
        })
      }
      case 'delete': return void remove(ids)
      case 'closedOpen': {
        const g = parseDriveNode(ids[0])
        return g && drive?.open(g.id)
      }
      case 'driveRetry': {
        const g = parseDriveNode(ids[0])
        return g && drive?.peek(g.id)
      }
      case 'closedDownload': {
        const g = parseDriveNode(ids[0])
        return g && drive?.download(g.id)
      }
      case 'closedRemove': return void ids.reduce((done, id) => done.then(() => removeClosed(parseDriveNode(id)!.id)), Promise.resolve())
      case 'upload': return first?.kind === 'doc' ? p.uploadDoc(first.doc) : undefined
      case 'share': return first?.kind === 'doc' ? p.shareDoc(first.doc) : undefined
      case 'makeCopy': return first?.kind === 'doc' ? p.makeCopyDoc(first.doc) : undefined
      case 'download': return docIds(ids).forEach(p.downloadDoc)
      case 'close': return docIds(ids).forEach(p.closeDoc)
    }
  }

  const idsFor = (node: string | null) => (node === null ? [] : p.selection.ids.includes(node) ? ordered(p.selection, order) : [node])

  const onContextMenu = (target: string | null, at: { x: number; y: number }) => {
    if (!p.tipSeen) p.onTipSeen?.()
    const ids = idsFor(target)
    const toItem = (e: Item): MenuItem => ({
      label: e.label,
      shortcut: e.shortcut,
      disabled: e.disabled,
      reason: e.reason,
      danger: e.danger,
      ...(e.submenu ? { submenu: e.submenu.map(toItem) } : { onSelect: () => run(e.action, ids, target, e.arg) }),
    })
    const items: MenuItem[] = menuFor(context(), ids, target).map((e) => (e === 'separator' ? e : toItem(e)))
    if (items.length > 0) openMenu(items, { ...at, doc: root.current!.ownerDocument })
  }

  const commitRename = (id: string, name: string) => {
    setRenaming(null)
    const ref = parseNode(id)
    if (!ref) return
    if (ref.kind === 'doc') return p.renameDoc(ref.doc, name)
    const now = docsNow()
    if (!exists(now, ref) || name.trim() === itemName(now, ref)) return
    const next = renameItem(now, ref, name)
    if (!next) p.notify('error', renameProblem(now, ref, name) ?? 'That is no longer there.')
    else p.apply(`Rename ${ref.kind}`, () => next)
  }

  // After a file's name: the dot for a file that needs attention, a chip for an open one, and the whole status in words
  // for a screen reader (the place is the icon's tooltip). Other rows: a card's sides or kind.
  const describeOf = (id: string): ReactNode => {
    const st = fileStatus(meta, id, { listing, closed: closedKinds })
    if (!st) return describeNode(docsAll, id)
    return (
      <>
        {st.dirty && <span className="file-dot" title="Needs attention" />}
        {st.open && <span className="explorer-chip">Open</span>}
        <span className="explorer-where" aria-hidden="true">{st.line}</span>
        <span className="explorer-sr">{st.words}</span>
      </>
    )
  }

  const iconOf = (id: string): ReactNode => {
    const g = parseDriveNode(id)
    if (g) {
      return (
        <span className="explorer-icon" title={fileStatus(meta, id, { listing, closed: closedKinds })?.where}>
          {closedKinds[g.id] === 'browser' ? <BrowserIcon /> : <CloudIcon />}
        </span>
      )
    }
    const r = parseNode(id)
    if (r?.kind === 'group') {
      const color = docsAll[r.doc]?.courses.find((c) => c.id === r.course)?.quizzes.find((q) => q.id === r.quiz)?.groups.find((x) => x.id === r.group)?.color
      return <span className="explorer-group-dot" data-color={color} />
    }
    if (r?.kind === 'course') return <span className="explorer-icon"><CourseIcon /></span>
    if (r?.kind === 'quiz') return <span className="explorer-icon"><QuizIcon /></span>
    if (r?.kind !== 'doc') return null
    const doc = p.docs.find((d) => d.id === r.doc)
    if (!doc) return null
    const kind = whereIcon(doc.where)
    return (
      <span className="explorer-icon" title={doc.where}>
        {kind === 'cloud' ? <CloudIcon /> : kind === 'browser' ? <BrowserIcon /> : <FileIcon />}
      </span>
    )
  }

  // Expanding a library that is not open reads it and shows what is inside; it does not open it.
  const setExpanded = (next: Set<string>) => {
    for (const id of next) {
      const g = parseDriveNode(id)
      if (g?.kind === 'file' && !expanded.has(id)) drive?.peek(g.id)
    }
    p.onExpanded(next)
  }
  // Open from an earlier visit (the open nodes are kept): read those libraries too.
  useEffect(() => {
    for (const f of closedDriveFiles(listing, p.docs)) {
      if (expanded.has(driveNodeOf({ kind: 'file', id: f.id })) && !peeks?.[f.id]) drive?.peek(f.id)
    }
  })

  // One quiet line at the bottom for Google Drive, whatever the state; the long explanations are in the (i).
  const hasItems = source.roots.length > 0
  let driveLine: ReactNode = null
  if (google) {
    const l = google.listing
    if (!l.signedIn) {
      // With no files the empty state already has its Sign in button.
      if (hasItems) driveLine = <button type="button" className="link" onClick={google.signIn}><CloudIcon /> Sign in to see your Google Drive</button>
    } else if (l.files !== null) {
      driveLine = <button type="button" className="link" onClick={google.pick}>Choose files in Google Drive</button>
    } else if (l.failed) {
      driveLine = (
        <>
          <span>Couldn't load your Google Drive.</span>
          <button type="button" className="link" onClick={google.refresh}>Retry</button>
        </>
      )
    } else if (l.loading) {
      driveLine = <span>Loading your Google Drive…</span>
    } else {
      // Signed in earlier but the sign-in has run out: listing asks Google again, so it waits for a click.
      driveLine = <button type="button" className="link" onClick={google.refresh}>Show my Google Drive libraries</button>
    }
  }
  if (driveLine) driveLine = <div className="explorer-drive">{driveLine}</div>

  // Save in the New card dialog: the card goes in as one undoable step, is selected, and the tree takes the focus back;
  // Save and add another opens a fresh dialog for the same kind in the same place.
  const saveNew = (card: Card, again: boolean) => {
    if (!adding) return
    const made = insertCard(docsNow(), adding.doc, adding.course, adding.quiz, card)
    if (!made) return p.notify('error', 'That is no longer there.')
    p.apply('New card', () => made.docs)
    show([made.ref], { focus: !again }, made.docs)
    if (!again) return
    const quiz = made.docs[adding.doc].courses.find((c) => c.id === adding.course)!.quizzes.find((q) => q.id === adding.quiz)!
    setAdding({ ...adding, key: adding.key + 1, card: blankCard(adding.kind, newId(), lastSides(quiz.cards), adding.group) })
  }

  const destinations = moving ? moveDestinations(docs, names, moving, readOnly) : []

  return (
    <div className="explorer" ref={root} role="region" aria-label="Explorer">
      <div className="explorer-top">
        <div className="explorer-head">
          <IconButton label="New file" onClick={() => setRenaming(nodeOf({ kind: 'doc', doc: p.newDoc() }))}><PlusIcon /></IconButton>
          <IconButton label="Open a copy from this device" onClick={p.openFile}><FolderIcon /></IconButton>
          {google?.listing.signedIn && <IconButton label="Refresh Google Drive" onClick={google.refresh}><RefreshIcon /></IconButton>}
          <IconButton label="Collapse all" onClick={() => p.onExpanded(new Set())}><ChevronsUpIcon /></IconButton>
          <IconButton className="explorer-info-btn" label="What the Explorer can do" popoverTarget={helpId}><InfoIcon /></IconButton>
          <div id={helpId} popover="auto" className="explorer-info">
            <dl>
              {HELP.map(([title, text]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div className="explorer-search">
          <AutoText
            label="Search"
            value={filter}
            onChange={setFilter}
            onEnter={() => root.current!.querySelector<HTMLElement>('.kit-row[tabindex="0"]')?.focus()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setFilter('')
            }}
          />
        </div>
      </div>
      {hasItems && !p.tipSeen && (
        <p className="explorer-tip">Right-click anything to see what you can do with it. On a touch screen, press and hold.</p>
      )}
      <div className="explorer-tree">
        <TreeView
          label="Open files"
          source={source}
          rowHeight={rowHeight}
          expanded={expanded}
          onExpanded={setExpanded}
          selection={p.selection}
          onSelection={p.onSelection}
          filter={filter}
          icon={iconOf}
          description={(id) => describeOf(id)}
          dimmed={(id) => cutNodes.has(id)}
          onActivate={(id) => {
            const g = parseDriveNode(id)
            if (g) {
              if (g.kind === 'failed') drive?.peek(g.id)
              else if (g.kind !== 'loading') drive?.open(g.id)
              return
            }
            const r = parseNode(id)
            if (r) openNode(r)
          }}
          onContextMenu={onContextMenu}
          onKeyDown={(e, focus) => {
            const ids = ordered(p.selection, order)
            const decision = keyDecision(context(), e, ids, focus)
            if (!decision) return false
            e.preventDefault()
            if ('refuse' in decision) p.notify('info', decision.refuse)
            else run(decision.action, ids, focus)
            return true
          }}
          drag={{
            kind: dragKind,
            allowInside,
            // Only our own items land on a row: a tab dragged over the tree gets no highlight and no refusal.
            accepts: (payload) => ['course', 'quiz', 'card', 'group'].includes(payload.kind),
            rule: (payload, target, pos, effect) => dropRule(docsAll, payload.ids, target, pos, effect, readOnly),
            onDrop: (payload, target, pos, effect) => planned(dropPlan(docsNow(), payload.ids, target, pos, effect, newId, lockedIn(latest.current.docs))),
            label: (payload, effect) => dragLabel(payload.kind as ItemKind, payload.ids.length, dragEffect(payload.ids, effect, readOnly)),
          }}
          rename={{
            id: renaming,
            commit: commitRename,
            cancel: () => setRenaming(null),
            check: (id, name) => {
              const r = parseNode(id)
              return (r?.kind === 'doc' ? (name.trim() ? fileNameProblem(name.trim()) : 'A library needs a name.') : r ? renameProblem(docs, r, name) : undefined) ?? null
            },
          }}
          empty={
            <div className="explorer-empty">
              <span className="explorer-empty-mark"><ShrimpIcon /></span>
              <h3 className="explorer-empty-title">No files here yet</h3>
              <div className="explorer-empty-actions">
                {google && !google.listing.signedIn && (
                  <button type="button" className="is-lead" onClick={google.signIn}><CloudIcon /> Sign in with Google</button>
                )}
                <button type="button" onClick={() => setRenaming(nodeOf({ kind: 'doc', doc: p.newDoc() }))}><PlusIcon /> New file</button>
                <button type="button" onClick={p.openFile}><FolderIcon /> Open a copy from this device</button>
              </div>
            </div>
          }
        />
      </div>
      {driveLine}
      {adding && (
        <CardDialog
          key={adding.key}
          card={adding.card}
          index={docsNow()[adding.doc]?.courses.find((c) => c.id === adding.course)?.quizzes.find((q) => q.id === adding.quiz)?.cards.length ?? 0}
          lib={p.libOf(adding.doc)}
          isNew
          onSave={(card) => saveNew(card, false)}
          onSaveAndAdd={(card) => saveNew(card, true)}
          onClose={() => {
            const k = adding.key
            setAdding((cur) => (cur && cur.key === k ? null : cur))
          }}
        />
      )}
      {moving && (
        <Modal title={`Move ${kindCount(moving[0].kind, moving.length)} to`} narrow onClose={() => setMoving(null)}>
          {destinations.length === 0 ? (
            <p>There is nowhere else to move it.</p>
          ) : (
            <ul className="explorer-dest">
              {destinations.map((d) => (
                <li key={d.label}>
                  <button
                    type="button"
                    className="quiet"
                    onClick={(e) => {
                      if (planned(placeItems(docsNow(), moving, d.target, 'move', newId))) closeModal(e.currentTarget)
                    }}
                  >
                    {d.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}
