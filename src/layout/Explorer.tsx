import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AutoText } from '../components/AutoText'
import type { askConfirm } from '../components/ConfirmDialog'
import { BrowserIcon, ChevronsUpIcon, ShrimpIcon, CloudIcon, FileIcon, FolderIcon, InfoIcon, PlusIcon, RefreshIcon } from '../components/Icons'
import { IconButton } from '../components/IconButton'
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
  addCard, addCourse, dragEffect, addQuiz, allowInside, ancestorNodes, deletePlan, describeNode, type Item, type NewCardKind, reorderTarget, ungroupPlan, fileStatus, dragKind, dragLabel, dropPlan, dropRule,
  itemRefs, keyDecision, kindCount, menuFor, moveDestinations, parseNode, pasteTarget, placeItems, removeItems, renameItem,
  renameProblem, whereIcon, docIds, type Action, type DocRef, type ItemKind, type MenuContext, type Plan,
} from '../logic/explorerActions'
import { closedDriveFiles, driveNodeOf, explorerSource, isPeekDoc, nodeOf, parseDriveNode, peekDocs, peekDriveId, type DriveFileInfo, type DriveListing, type Peek } from '../logic/explorerTree'
import { hiddenNote as hiddenFilesNote } from '../logic/signOut'
import type { Library } from '../model'
import { newId } from '../model'

export type ExplorerDoc = { id: DocId; name: string; library: Library; dirty: boolean; where: string; driveId?: string | null }
/** The user's Google Drive libraries, listed among the open files (the ones not open yet). The host does the listing and the calls. */
export type ExplorerDrive = {
  /** False when Google Drive is not set up on this site: nothing about it shows then. */
  setUp: boolean
  listing: DriveListing
  signIn(): void
  /** Google's file picker. */
  pick(): void
  refresh(): void
  /** What the libraries expanded in the tree hold, by file id: read without opening them. */
  peeks: Record<string, Peek>
  /** Reads a library to show what is inside (again after a failure). */
  peek(id: string): void
  /** Opens a library as a file of the tree; `then`: an item inside it (as the peek shows it) to show once it is open. */
  open(id: string, then?: ItemRef): void
  /** Asks, then moves it to the bin. */
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
  /** Shows it in the current tab (a file's home, a course, a quiz page; a card: its quiz page). */
  open(node: ItemRef | DocRef): void
  /** A quiz: its editor; a card: the card dialog. */
  edit(ref: ItemRef): void
  /** A card it just made (New card): its quiz's editor in a tab beside it, the card focused. */
  editNew(ref: ItemRef): void
  newDoc(): void
  openFile(): void
  saveDoc(id: DocId): void
  downloadDoc(id: DocId): void
  closeDoc(id: DocId): void
  /** A node id to show: its ancestors open, selected, scrolled to, the tree focused. */
  reveal: string | null
  onRevealed(): void
  drive?: ExplorerDrive
  /** The one-line right-click tip shows until this is true; `onTipSeen` is called at the first right-click. */
  tipSeen?: boolean
  onTipSeen?(): void
  /** How many files from Google Drive are kept out of the tree until the user signs in (a quiet note; none: nothing). */
  hiddenFiles?: number
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
  ['New', 'New file and Open file are at the top. Right-click a file for New course, a course for New quiz and a quiz for New card. A new course or quiz starts with its name ready to type.'],
  ['Rename', 'Press F2 to rename a course or quiz. Names stay unique in their place. On a card, F2 edits it.'],
  ['Delete', 'Delete removes cards at once, with Undo on the message. Quizzes and courses ask first. A file is closed, never deleted.'],
  ['Search', 'Search filters every file, open or not, and keeps the parents of what matches. Esc clears it.'],
  ['Google Drive', 'Sign in with Google to list your libraries among the files. Open files carry an "Open" chip, the others are libraries you can open. Refresh looks again, "Choose files in Google Drive" adds files the app can not see yet, and Move to bin sends one to the bin in your Drive.'],
  ['Undo', 'Ctrl+Z undoes the last change in any file, Ctrl+Shift+Z does it again.'],
  ['Unsaved changes', 'Every change marks its file as unsaved, with a dot, until you save it.'],
]

const ROW = 32
const ROW_TOUCH = 44

const toDocs = (docs: ExplorerDoc[]): Docs => Object.fromEntries(docs.map((d) => [d.id, d.library]))

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
  const [filter, setFilter] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [moving, setMoving] = useState<ItemRef[] | null>(null)
  const [touch, setTouch] = useState(false)
  const helpId = useId()

  const docs = useMemo(() => toDocs(p.docs), [p.docs])
  const names = useMemo(() => Object.fromEntries(p.docs.map((d) => [d.id, d.name])), [p.docs])
  const meta = useMemo(() => Object.fromEntries(p.docs.map((d) => [d.id, { where: d.where, dirty: d.dirty }])), [p.docs])
  const drive = p.drive?.setUp ? p.drive : undefined
  const listing = drive?.listing
  const peeks = drive?.peeks
  const source = useMemo(() => explorerSource(p.docs, listing, peeks), [p.docs, listing, peeks])
  // Everything content operations work on: the open files, and the libraries only looked at (read-only).
  const docsAll = useMemo(() => ({ ...peekDocs(peeks), ...docs }), [docs, peeks])
  const expanded = p.expanded
  const driveNodes = useMemo(() => new Set(closedDriveFiles(listing, p.docs).map((f) => f.id)), [listing, p.docs])
  const order = useMemo(() => flatten(source, expanded, filter).map((r) => r.id), [source, expanded, filter])
  const cutNodes = useMemo(() => new Set(p.clipboard?.mode === 'cut' ? p.clipboard.refs.map(nodeOf) : []), [p.clipboard])
  const rowHeight = touch ? ROW_TOUCH : ROW

  const win = () => ownWindow(root.current!)
  const context = (): MenuContext => ({ docs: docsAll, names, clipboard: p.clipboard, mac: isMac(win().navigator.platform) })
  const docsNow = () => ({ ...peekDocs(latest.current.drive?.peeks), ...toDocs(latest.current.docs) })

  useEffect(() => {
    const mq = win().matchMedia('(max-width: 799px)')
    const on = () => setTouch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
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
    const plan = deletePlan(docsNow(), ids, isMac(win().navigator.platform))
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

  const run = (action: Action, ids: string[], at: string | null, kind?: NewCardKind) => {
    const first = ids[0] === undefined ? null : parseNode(ids[0])
    const refs = itemRefs(ids)
    switch (action) {
      case 'newFile': return p.newDoc()
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
        const ref = create(addCard(docsNow(), first.doc, first.course, first.quiz, newId(), kind, first.kind === 'group' ? first.group : undefined), 'New card')
        if (ref) {
          show([ref])
          p.editNew(ref)
        }
        return
      }
      case 'open': return first && openNode(first)
      case 'edit': return first && first.kind !== 'doc' && p.edit(first)
      case 'rename': return first && first.kind !== 'doc' && first.kind !== 'card' && setRenaming(ids[0])
      case 'copy': return p.copy(refs, refs.some((r) => isPeekDoc(r.doc)) ? peekDocs(latest.current.drive?.peeks) : undefined)
      case 'cut': return p.cut(refs)
      case 'paste': {
        const r = pasteTarget(docsNow(), latest.current.clipboard, at)
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
      case 'driveOpen': {
        const g = parseDriveNode(ids[0])
        return g && drive?.open(g.id)
      }
      case 'driveRetry': {
        const g = parseDriveNode(ids[0])
        return g && drive?.peek(g.id)
      }
      case 'driveRemove': {
        const g = parseDriveNode(ids[0])
        const file = g?.kind === 'file' ? listing?.files?.find((f) => f.id === g.id) : undefined
        return file && drive?.remove(file)
      }
      case 'save': return docIds(ids).forEach(p.saveDoc)
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
    if (!ref || ref.kind === 'doc') return
    const now = docsNow()
    if (!exists(now, ref) || name.trim() === itemName(now, ref)) return
    const next = renameItem(now, ref, name)
    if (!next) p.notify('error', renameProblem(now, ref, name) ?? 'That is no longer there.')
    else p.apply(`Rename ${ref.kind}`, () => next)
  }

  // After a file's name: the dot for unsaved changes, a chip for a library not open, and the whole status in words for
  // a screen reader (the place is the icon's tooltip). Other rows: a card's sides or kind.
  const describeOf = (id: string): ReactNode => {
    const st = fileStatus(meta, id, listing && { listing })
    if (!st) return describeNode(docsAll, id)
    return (
      <>
        {st.dirty && <span className="file-dot" title="Unsaved changes" />}
        {st.open && <span className="explorer-chip">Open</span>}
        <span className="explorer-sr">{st.words}</span>
      </>
    )
  }

  const iconOf = (id: string): ReactNode => {
    const g = parseDriveNode(id)
    if (g) return <span className="explorer-icon" title={fileStatus(meta, id, listing && { listing })?.where}><CloudIcon /></span>
    const r = parseNode(id)
    if (r?.kind === 'group') {
      const color = docsAll[r.doc]?.courses.find((c) => c.id === r.course)?.quizzes.find((q) => q.id === r.quiz)?.groups.find((x) => x.id === r.group)?.color
      return <span className="explorer-group-dot" data-color={color} />
    }
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
  if (drive) {
    const l = drive.listing
    if (!l.signedIn) {
      // With no files the empty state already has its Sign in button.
      if (hasItems) driveLine = <button type="button" className="link" onClick={drive.signIn}><CloudIcon /> Sign in to see your Google Drive</button>
    } else if (l.files !== null) {
      driveLine = <button type="button" className="link" onClick={drive.pick}>Choose files in Google Drive</button>
    } else if (l.failed) {
      driveLine = (
        <>
          <span>Couldn't load your Google Drive.</span>
          <button type="button" className="link" onClick={drive.refresh}>Retry</button>
        </>
      )
    } else if (l.loading) {
      driveLine = <span>Loading your Google Drive…</span>
    } else {
      // Signed in earlier but the sign-in has run out: listing asks Google again, so it waits for a click.
      driveLine = <button type="button" className="link" onClick={drive.refresh}>Show my Google Drive libraries</button>
    }
  }
  if (driveLine) driveLine = <div className="explorer-drive">{driveLine}</div>
  // The same words as the sidebar's note: never "your" while nobody is signed in.
  const hiddenNote = drive && p.hiddenFiles ? <p className="explorer-drive">{hiddenFilesNote(p.hiddenFiles, drive.listing.signedIn)}</p> : null

  const destinations = moving ? moveDestinations(docs, names, moving) : []

  return (
    <div className="explorer" ref={root} role="region" aria-label="Explorer">
      <div className="explorer-top">
        <div className="explorer-head">
          <IconButton label="New file" onClick={p.newDoc}><PlusIcon /></IconButton>
          <IconButton label="Open file" onClick={p.openFile}><FolderIcon /></IconButton>
          {drive?.listing.signedIn && <IconButton label="Refresh Google Drive" onClick={drive.refresh}><RefreshIcon /></IconButton>}
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
            rule: (payload, target, pos, effect) => dropRule(docsAll, payload.ids, target, pos, effect),
            onDrop: (payload, target, pos, effect) => planned(dropPlan(docsNow(), payload.ids, target, pos, effect, newId)),
            label: (payload, effect) => dragLabel(payload.kind as ItemKind, payload.ids.length, dragEffect(payload.ids, effect)),
          }}
          rename={{
            id: renaming,
            commit: commitRename,
            cancel: () => setRenaming(null),
            check: (id, name) => {
              const r = parseNode(id)
              return (r && r.kind !== 'doc' ? renameProblem(docs, r, name) : undefined) ?? null
            },
          }}
          empty={
            <div className="explorer-empty">
              <span className="explorer-empty-mark"><ShrimpIcon /></span>
              <h3 className="explorer-empty-title">No files here yet</h3>
              <div className="explorer-empty-actions">
                {drive && !drive.listing.signedIn && (
                  <button type="button" className="is-lead" onClick={drive.signIn}><CloudIcon /> Sign in with Google</button>
                )}
                <button type="button" onClick={p.newDoc}><PlusIcon /> New file</button>
                <button type="button" onClick={p.openFile}><FolderIcon /> Open file</button>
              </div>
            </div>
          }
        />
      </div>
      {hiddenNote}
      {driveLine}
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
