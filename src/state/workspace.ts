// The workspace as one immutable object, and its pure transitions (useWorkspace runs them): the open documents, the
// layout (one tab per document for now), the undo history, the clipboard and the Explorer's state. Nothing here
// touches the DOM, storage or the clock: times and new ids come in as arguments.
import { FORMATS, type Library } from '../model'
import type { Route } from '../route'
import type { DriveSource } from '../storage/googleDrive'
import type { FileRef } from '../storage/fileStorage'
import type { DocRecord, WorkspaceRecord } from '../storage/workspaceRecord'
import { emptySelection, type Selection } from '../kit/selection'
import { emptyHistory, record, redo, seal, undo, type Entry, type History } from '../kit/history'
import * as L from '../kit/layout'
import { exists, extract, insert, move, type DocId, type Docs, type Fragment, type ItemRef, type Target } from '../logic/contentOps'
import { freeName } from '../logic/names'
import { plural } from '../logic/plural'

export type { DocId }
export type TabData = { kind: 'doc'; doc: DocId; route: Route } | { kind: 'explorer' } | { kind: 'welcome' }

export type Doc = {
  id: DocId
  library: Library
  /** The library object last opened or saved here. Unsaved changes: `library !== saved` (null: never saved here). */
  saved: Library | null
  /** Its own name ("New library 2"), shown while it has no file and no Drive file (see `docName`). */
  name: string
  file: FileRef | null
  drive: DriveSource | null
  /** Counts the times the whole library was replaced (pulled, reloaded, taken from another tab, loaded as text). */
  replaced: number
  /** Its Drive file has changes that are not here (found by the quiet look on start). */
  newer: boolean
}

/** The libraries of some documents, as a history entry keeps them. */
export type Snap = Record<DocId, Library>
export type Clipboard = { mode: 'copy' | 'cut'; refs: ItemRef[]; fragment: Fragment }
export type Explorer = { expanded: string[]; selection: Selection }
export type Workspace = {
  docs: Record<DocId, Doc>
  /** The open documents in the order the sidebar lists them. */
  order: DocId[]
  layout: L.Layout<TabData>
  history: History<Snap>
  clipboard: Clipboard | null
  explorer: Explorer
}

export const emptyExplorer = (): Explorer => ({ expanded: [], selection: emptySelection })

export const emptyWorkspace = (groupId: string): Workspace => ({
  docs: {},
  order: [],
  layout: L.emptyLayout(groupId),
  history: emptyHistory(),
  clipboard: null,
  explorer: emptyExplorer(),
})

export const hasChanges = (d: Doc): boolean => d.library !== d.saved
/** What the document is called: its Drive file's name, its local file's name, or its own. */
export const docName = (d: Doc): string => d.drive?.name ?? d.file?.name ?? d.name
export const where = (d: Doc): 'drive' | 'device' | 'browser' => (d.drive ? 'drive' : d.file ? 'device' : 'browser')

export const makeDoc = (id: DocId, library: Library, name: string, more: Partial<Doc> = {}): Doc => ({
  id,
  library,
  saved: library,
  name,
  file: null,
  drive: null,
  replaced: 0,
  newer: false,
  ...more,
})

/** `base`, or "base 2" and so on: a name no open document has. */
export const freeDocName = (w: Workspace, base: string): string => freeName(base, Object.values(w.docs).map(docName))

/** Every open document's library, in order (what contentOps works on). */
export function libraries(w: Workspace): Docs {
  const docs: Docs = {}
  for (const id of w.order) docs[id] = w.docs[id].library
  return docs
}

// ---- Layout: one tab per document for now; the active tab is the active document ----

export const tabIdOf = (doc: DocId): L.TabId => `doc:${doc}`

/** The active group's active tab. */
export function activeTab(w: Workspace): L.Tab<TabData> | null {
  const id = w.layout.groups[w.layout.activeGroup]?.active
  return (id && w.layout.tabs[id]) || null
}

export function activeDoc(w: Workspace): DocId | null {
  const tab = activeTab(w)
  return tab?.data.kind === 'doc' && w.docs[tab.data.doc] ? tab.data.doc : null
}

const tabsOf = (l: L.Layout<TabData>, doc: DocId): L.TabId[] =>
  Object.values(l.tabs).flatMap((t) => (t.data.kind === 'doc' && t.data.doc === doc ? [t.id] : []))

/** Adds a document with a tab showing `route`, both active. */
export function addDoc(w: Workspace, doc: Doc, route: Route): Workspace {
  return {
    ...w,
    docs: { ...w.docs, [doc.id]: doc },
    order: [...w.order, doc.id],
    layout: L.openTab(w.layout, { id: tabIdOf(doc.id), data: { kind: 'doc', doc: doc.id, route } }),
  }
}

/** Makes the document active (its tab), opening a tab on its home when it has none. */
export function activateDoc(w: Workspace, id: DocId): Workspace {
  if (!w.docs[id]) return w
  const tab = tabsOf(w.layout, id)[0]
  const layout = tab ? L.activate(w.layout, tab) : L.openTab(w.layout, { id: tabIdOf(id), data: { kind: 'doc', doc: id, route: { name: 'home' } } })
  return layout === w.layout ? w : { ...w, layout }
}

const sameRoute = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b)

/** The page the active tab shows (the address bar's), unless it already shows it. */
export function setRoute(w: Workspace, route: Route): Workspace {
  const tab = activeTab(w)
  if (!tab || tab.data.kind !== 'doc' || sameRoute(tab.data.route, route)) return w
  return { ...w, layout: L.updateTab(w.layout, tab.id, { ...tab.data, route }) }
}

// ---- Content changes and the history ----

// Merged entries: `before` keeps the first snapshot of each document, `after` the last.
const mergeSnaps = (a: Snap, b: Snap, keep: 'first' | 'last'): Snap => (keep === 'first' ? { ...b, ...a } : { ...a, ...b })
const pick = (docs: Docs, ids: DocId[]): Snap => Object.fromEntries(ids.map((id) => [id, docs[id]]))

/**
 * The one content write path: `update` gets every open library and returns them changed (new objects only for what
 * it changed). Records one history entry holding only the documents it changed, merged into the last one when both
 * have the same `key` within 1.5 s (typing in one field). Nothing changed: the same workspace back.
 */
export function applyEdit(w: Workspace, label: string, update: (docs: Docs) => Docs, at: number, key?: string): Workspace {
  const before = libraries(w)
  const after = update(before)
  const changed = w.order.filter((id) => after[id] !== undefined && after[id] !== before[id])
  if (changed.length === 0) return w
  const docs = { ...w.docs }
  for (const id of changed) docs[id] = { ...docs[id], library: after[id] }
  const entry: Entry<Snap> = { label, before: pick(before, changed), after: pick(after, changed), key, at }
  return { ...w, docs, history: record(w.history, entry, { merge: mergeSnaps }) }
}

// Puts the snapshot's libraries back, in the documents still open.
function putBack(w: Workspace, snap: Snap): Workspace {
  const docs = { ...w.docs }
  for (const [id, library] of Object.entries(snap)) if (docs[id]) docs[id] = { ...docs[id], library }
  return { ...w, docs }
}

/** Undoes the last entry: null when there is nothing to undo. Typing after it starts a new entry. */
export function undoEdit(w: Workspace): { workspace: Workspace; entry: Entry<Snap> } | null {
  const step = undo(w.history)
  if (!step) return null
  return { workspace: { ...putBack(w, step.entry.before), history: seal(step.history) }, entry: step.entry }
}

export function redoEdit(w: Workspace): { workspace: Workspace; entry: Entry<Snap> } | null {
  const step = redo(w.history)
  if (!step) return null
  return { workspace: { ...putBack(w, step.entry.after), history: seal(step.history) }, entry: step.entry }
}

/** The history without a document: taken out of every entry, and entries left with nothing dropped. */
export function forget(h: History<Snap>, id: DocId): History<Snap> {
  const strip = (list: Entry<Snap>[]) =>
    list.flatMap((e) => {
      if (!(id in e.before) && !(id in e.after)) return [e]
      const before = { ...e.before }
      const after = { ...e.after }
      delete before[id]
      delete after[id]
      return Object.keys(after).length === 0 ? [] : [{ ...e, before, after }]
    })
  return { past: strip(h.past), future: strip(h.future) }
}

/** Patches a document; the function may return null to change nothing. */
export function patchDoc(w: Workspace, id: DocId, patch: Partial<Doc> | ((d: Doc) => Partial<Doc> | null)): Workspace {
  const d = w.docs[id]
  const p = d && (typeof patch === 'function' ? patch(d) : patch)
  return p ? { ...w, docs: { ...w.docs, [id]: { ...d, ...p } } } : w
}

/**
 * The whole library replaced from outside (a Drive pull, the file reloaded from disk, another tab's write taken up):
 * saved as it comes, counted in `replaced`, and its history entries dropped.
 */
export function replaceDoc(w: Workspace, id: DocId, library: Library, patch: Partial<Doc> = {}): Workspace {
  const d = w.docs[id]
  if (!d) return w
  return {
    ...w,
    docs: { ...w.docs, [id]: { ...d, library, saved: library, ...patch, replaced: d.replaced + 1 } },
    history: forget(w.history, id),
  }
}

/** Another tab wrote the document: this tab takes it up (its unsaved mark too), keeping its file handle when it is the same file. */
export function takeRecord(w: Workspace, rec: DocRecord): Workspace {
  const d = w.docs[rec.id]
  if (!d) return w
  const handle = rec.file && d.file?.name === rec.file.name ? d.file.handle : null
  return replaceDoc(w, rec.id, rec.library, {
    saved: rec.dirty ? null : rec.library,
    drive: rec.drive,
    file: rec.file && { ...rec.file, handle },
  })
}

/** Saved: `saving` is the library as it was when the save started, so an edit made meanwhile keeps the mark. */
export function markSaved(w: Workspace, id: DocId, saving: Library, patch: Partial<Doc> = {}): Workspace {
  return patchDoc(w, id, { ...patch, saved: saving })
}

/**
 * Closes a document: it, its tabs and its history entries go, and a cut on the clipboard from it becomes a copy
 * (its items can't be moved out of a closed file, but they can still be pasted).
 */
export function closeDoc(w: Workspace, id: DocId): Workspace {
  if (!w.docs[id]) return w
  const docs = { ...w.docs }
  delete docs[id]
  const cb = w.clipboard
  return {
    ...w,
    docs,
    order: w.order.filter((x) => x !== id),
    layout: L.closeTabs(w.layout, tabsOf(w.layout, id)),
    history: forget(w.history, id),
    clipboard: cb && cb.mode === 'cut' && cb.refs.some((r) => r.doc === id) ? { ...cb, mode: 'copy' } : cb,
  }
}

/**
 * A draft course (created, never renamed nor given a quiz) dropped as if it was never made: when its "Add course" is
 * the last entry and nothing changed since, the library it was added to comes back as it was (so the unsaved mark
 * too) and the entry goes; otherwise the course is just taken out.
 */
export function dropDraft(w: Workspace, id: DocId, courseId: string): Workspace {
  const d = w.docs[id]
  if (!d || !d.library.courses.some((c) => c.id === courseId)) return w
  const last = w.history.past[w.history.past.length - 1]
  const before = last?.before[id]
  if (last && Object.keys(last.after).length === 1 && last.after[id] === d.library && before && !before.courses.some((c) => c.id === courseId)) {
    return { ...patchDoc(w, id, { library: before }), history: { ...w.history, past: w.history.past.slice(0, -1) } }
  }
  return patchDoc(w, id, { library: { ...d.library, courses: d.library.courses.filter((c) => c.id !== courseId) } })
}

// ---- Clipboard ----

const count = (f: Fragment) => (f.kind === 'course' ? f.courses.length : f.kind === 'quiz' ? f.quizzes.length : f.cards.length)
const what = (f: Fragment) => {
  const n = count(f)
  return n === 1 ? f.kind : f.kind === 'quiz' ? plural(n, 'quiz', 'quizzes') : plural(n, f.kind)
}

/** Copies (or cuts) the items: their contents as they are now. Throws the reason when they can't be. */
export function toClipboard(w: Workspace, refs: ItemRef[], mode: 'copy' | 'cut'): Workspace {
  return { ...w, clipboard: { mode, refs, fragment: extract(libraries(w), refs) } }
}

/**
 * Pastes into `target`, as one history entry: a cut moves its items when they are all still there (then the clipboard
 * holds a copy of them), else the copy taken at cut or copy time goes in with new ids. Throws the reason when the
 * target doesn't take them (nothing changed).
 */
export function paste(w: Workspace, target: Target, newId: () => string, at: number): Workspace {
  const cb = w.clipboard
  if (!cb) throw new Error('Nothing is copied.')
  if (cb.mode === 'cut' && cb.refs.every((r) => exists(libraries(w), r))) {
    let moved: ItemRef[] = []
    const next = applyEdit(w, `Move ${what(cb.fragment)}`, (docs) => {
      const done = move(docs, cb.refs, target)
      moved = done.moved
      return done.docs
    }, at)
    return { ...next, clipboard: { ...cb, mode: 'copy', refs: moved } }
  }
  const next = applyEdit(w, `Paste ${what(cb.fragment)}`, (docs) => insert(docs, cb.fragment, target, newId).docs, at)
  return { ...next, clipboard: cb.mode === 'cut' ? { ...cb, mode: 'copy' } : cb }
}

// ---- Opening a file that is already open ----

/** Whether the file on disk is another version than the one the document was opened from or saved to. */
export const changedOnDisk = (d: Doc, file: FileRef): boolean =>
  !!d.file && (d.file.modified !== file.modified || d.file.size !== file.size)

/**
 * The file `id` is tied to was opened again: its document becomes active, and when the file changed on disk it is
 * reloaded, unless there are unsaved changes here (then `ask`: the caller asks first, then `replaceDoc`).
 */
export function reopenFile(w: Workspace, id: DocId, library: Library, file: FileRef): { workspace: Workspace; ask: boolean } {
  const d = w.docs[id]
  if (!d) return { workspace: w, ask: false }
  const active = activateDoc(w, id)
  if (!changedOnDisk(d, file)) return { workspace: d.file?.handle || !file.handle ? active : patchDoc(active, id, { file }), ask: false }
  if (hasChanges(d)) return { workspace: active, ask: true }
  return { workspace: replaceDoc(active, id, library, { file }), ask: false }
}

export const docWithDrive = (w: Workspace, driveId: string): Doc | undefined =>
  w.order.map((id) => w.docs[id]).find((d) => d.drive?.id === driveId)

// ---- What the browser keeps, and reading it back ----

/** The document's record in the browser backup (its file handle is kept apart). */
export const docRecord = (d: Doc): DocRecord => ({
  id: d.id,
  library: d.library,
  dirty: hasChanges(d),
  drive: d.drive,
  file: d.file && { name: d.file.name, size: d.file.size, modified: d.file.modified },
})

/** The workspace's own record: the open documents in order, the layout, the Explorer and each document's own name. */
export const workspaceRecord = (w: Workspace): WorkspaceRecord => ({
  version: 1,
  docs: w.order,
  layout: w.layout,
  explorer: w.explorer,
  ui: { names: Object.fromEntries(w.order.map((id) => [id, w.docs[id].name])) },
})

const isString = (x: unknown): x is string => typeof x === 'string'
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(isString)

const PLAIN = ['home', 'debug', 'changelog', 'workbench']
/** A route as a tab keeps it, or null (a Drive link is never kept: it would open again). */
export function readRoute(r: unknown): Route | null {
  const x = r as Record<string, unknown> | null
  if (!x || typeof x !== 'object' || !isString(x.name)) return null
  if (PLAIN.includes(x.name)) return { name: x.name } as Route
  if (!isString(x.course)) return null
  if (x.name === 'course') return { name: 'course', course: x.course }
  if (!isString(x.quiz)) return null
  if (x.name === 'quiz' || x.name === 'edit') return { name: x.name, course: x.course, quiz: x.quiz }
  if (x.name === 'study' && (FORMATS as readonly unknown[]).includes(x.format)) {
    return { name: 'study', course: x.course, quiz: x.quiz, format: x.format as (typeof FORMATS)[number] }
  }
  return null
}

const isNode = (n: unknown): n is L.Node => {
  const x = n as L.Node | null
  if (!x || typeof x !== 'object') return false
  if (x.kind === 'group') return isString(x.id)
  return (
    x.kind === 'split' &&
    (x.dir === 'row' || x.dir === 'column') &&
    Array.isArray(x.children) &&
    Array.isArray(x.sizes) &&
    x.children.length === x.sizes.length &&
    x.sizes.every((s) => typeof s === 'number' && Number.isFinite(s)) &&
    x.children.every(isNode)
  )
}

/** One group with a tab per document, the first active. */
export function defaultLayout(docIds: DocId[], groupId: string): L.Layout<TabData> {
  return docIds.reduce<L.Layout<TabData>>(
    (l, id, i) => L.openTab(l, { id: tabIdOf(id), data: { kind: 'doc', doc: id, route: { name: 'home' } } }, { activate: i === 0, index: i }),
    L.emptyLayout(groupId),
  )
}

/**
 * The stored layout, checked: tabs of documents no longer open (and pages that can't be read) go, popped-out groups
 * come back docked, and every open document has a tab. Anything malformed gives the default layout.
 */
export function readLayout(raw: unknown, docIds: DocId[], groupId: string): L.Layout<TabData> {
  const l = raw as L.Layout<TabData> | null
  const groupsOk =
    !!l?.groups &&
    typeof l.groups === 'object' &&
    Object.entries(l.groups).every(
      ([id, g]) => g && g.id === id && strings(g.tabs) && strings(g.mru) && (g.active === null || isString(g.active)),
    )
  const windowsOk = !!l?.windows && typeof l.windows === 'object' && !!l.windows[L.MAIN] && Object.values(l.windows).every((w) => isNode(w?.root))
  if (!l || typeof l !== 'object' || !groupsOk || !windowsOk || !isString(l.activeGroup) || !l.tabs || typeof l.tabs !== 'object') {
    return defaultLayout(docIds, groupId)
  }
  const tabs: L.Layout<TabData>['tabs'] = {}
  for (const [id, tab] of Object.entries(l.tabs)) {
    const data = tab?.data as Partial<Extract<TabData, { kind: 'doc' }>> | undefined
    const route = readRoute(data?.route)
    if (tab?.id === id && data?.kind === 'doc' && isString(data.doc) && docIds.includes(data.doc) && route) {
      tabs[id] = { id, data: { kind: 'doc', doc: data.doc, route } }
    }
  }
  let next = L.normalize({ tabs, groups: l.groups, windows: l.windows, activeGroup: l.activeGroup })
  for (const win of Object.keys(next.windows)) if (win !== L.MAIN) next = L.dock(next, win)
  if (!next.groups[next.activeGroup]) return defaultLayout(docIds, groupId)
  for (const id of docIds) {
    if (!tabsOf(next, id).length) next = L.openTab(next, { id: tabIdOf(id), data: { kind: 'doc', doc: id, route: { name: 'home' } } }, { activate: false })
  }
  const active = next.groups[next.activeGroup].active
  return active || docIds.length === 0 ? next : L.activate(next, tabsOf(next, docIds[0])[0])
}

export function readExplorer(raw: unknown): Explorer {
  const x = raw as { expanded?: unknown; selection?: Partial<Selection> } | null
  const s = x?.selection
  const nullable = (v: unknown) => v === null || isString(v)
  return x && strings(x.expanded) && s && strings(s.ids) && nullable(s.anchor) && nullable(s.focus)
    ? { expanded: x.expanded, selection: { ids: s.ids, anchor: s.anchor ?? null, focus: s.focus ?? null } }
    : emptyExplorer()
}

/**
 * The workspace as the browser kept it: each document (an unsaved one marked unsaved, `saved` null), with its file
 * handle; its layout and Explorer checked; documents with no name kept get "New library", "New library 2" and so on.
 */
export function restore(
  read: { workspace: WorkspaceRecord | null; docs: DocRecord[]; handles: Record<string, FileSystemFileHandle> },
  groupId: string,
): Workspace {
  const kept = (read.workspace?.ui as { names?: Record<string, unknown> } | null)?.names ?? {}
  let w = emptyWorkspace(groupId)
  for (const rec of read.docs) {
    const own = kept[rec.id]
    const name = isString(own) && own.trim() ? own : freeDocName(w, 'New library')
    const file = rec.file && { ...rec.file, handle: read.handles[rec.id] ?? null }
    const doc = makeDoc(rec.id, rec.library, name, { saved: rec.dirty ? null : rec.library, drive: rec.drive, file })
    w = { ...w, docs: { ...w.docs, [doc.id]: doc }, order: [...w.order, doc.id] }
  }
  return { ...w, layout: readLayout(read.workspace?.layout, w.order, groupId), explorer: readExplorer(read.workspace?.explorer) }
}
