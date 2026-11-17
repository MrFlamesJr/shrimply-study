// The workspace as one immutable object, and its pure transitions (useWorkspace runs them): the open documents, the
// layout (one tab per document for now), the undo history, the clipboard and the Explorer's state. Nothing here
// touches the DOM, storage or the clock: times and new ids come in as arguments.
import { FORMATS, type Course, type Library } from '../model'
import { href, resolve, sameIds, type Route } from '../logic/routes'
import type { AppPage, TabData } from '../logic/workbenchActions'
import type { DriveSource } from '../storage/googleDrive'
import type { FileRef } from '../storage/StorageAdapter'
import type { DocRecord, WorkspaceRecord } from '../storage/workspaceRecord'
import { emptySelection, type Selection } from '../kit/selection'
import { emptyHistory, record, redo, seal, undo, type Entry, type History } from '../kit/history'
import * as L from '../kit/layout'
import { exists, extract, insert, move, type DocId, type Docs, type Fragment, type ItemRef, type Target } from '../logic/contentOps'
import { freeName } from '../logic/names'
import { plural } from '../logic/plural'

export type { AppPage, DocId, TabData }

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
  /**
   * The Google account whose own Drive file this is (as Google said, `drive.mine`), once known: the account signed in
   * while it was shown as the user's own. Null when not known (it is claimed by the next account shown it).
   */
  owner: string | null
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
  /** Tabs, the one active most recently first (across groups and windows). */
  recent: L.TabId[]
}

export const emptyExplorer = (): Explorer => ({ expanded: [], selection: emptySelection })

export const emptyWorkspace = (groupId: string): Workspace => ({
  docs: {},
  order: [],
  layout: L.emptyLayout(groupId),
  history: emptyHistory(),
  clipboard: null,
  explorer: emptyExplorer(),
  recent: [],
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
  owner: null,
  ...more,
})

// ---- Files hidden while signed out (asked for): the user's own Drive files never show in a tab that is not signed
// in with their account. Their libraries and unsaved changes stay as they are, never written over. ----

/**
 * Hidden in a tab signed in as `account` (null: signed out): the user's own Drive file (as Google last said) while
 * signed out, or while another account than its owner is signed in. Shared files and local ones never hide.
 */
export const isHidden = (d: Doc, account: string | null): boolean =>
  !!d.drive?.mine && (account === null || (d.owner !== null && d.owner !== account))

/** The open documents hidden for `account`, in order. */
export const hiddenDocs = (w: Workspace, account: string | null): DocId[] => w.order.filter((id) => isHidden(w.docs[id], account))

/** Every own Drive file shown to `account` with no owner yet becomes that account's. */
export function claimOwners(w: Workspace, account: string | null): Workspace {
  if (account === null) return w
  const claim = w.order.filter((id) => w.docs[id].drive?.mine && w.docs[id].owner === null)
  if (claim.length === 0) return w
  const docs = { ...w.docs }
  for (const id of claim) docs[id] = { ...docs[id], owner: account }
  return { ...w, docs }
}

/** `base`, or "base 2" and so on: a name no open document has. */
export const freeDocName = (w: Workspace, base: string): string => freeName(base, Object.values(w.docs).map(docName))

/** Every open document's library, in order (what contentOps works on). */
export function libraries(w: Workspace): Docs {
  const docs: Docs = {}
  for (const id of w.order) docs[id] = w.docs[id].library
  return docs
}

// ---- Layout: tabs in groups, splits and windows. A file may show in several tabs, each with its own page. The
// active tab is the active group's; `recent` remembers which tabs were active last, across groups. ----

export type DocTab = L.Tab<Extract<TabData, { kind: 'doc' }>>
const HOME: Route = { name: 'home' }

/** Puts a new layout in, with the tab now active first in `recent`. */
function withLayout(w: Workspace, layout: L.Layout<TabData>): Workspace {
  if (layout === w.layout) return w
  const active = layout.groups[layout.activeGroup]?.active ?? null
  const recent = [...(active ? [active] : []), ...w.recent.filter((t) => t !== active && layout.tabs[t])]
  return { ...w, layout, recent }
}

/** The active group's active tab. */
export function activeTab(w: Workspace): L.Tab<TabData> | null {
  const id = w.layout.groups[w.layout.activeGroup]?.active
  return (id && w.layout.tabs[id]) || null
}

const docTab = (w: Workspace, id: L.TabId | null | undefined): DocTab | null => {
  const tab = id ? w.layout.tabs[id] : undefined
  return tab && tab.data.kind === 'doc' && w.docs[tab.data.doc] ? (tab as DocTab) : null
}

/** The active file: the active tab's, else the file of the tab most recently active; null when no tab shows one. */
export function activeDoc(w: Workspace): DocId | null {
  const tab = docTab(w, activeTab(w)?.id) ?? w.recent.map((id) => docTab(w, id)).find(Boolean)
  return tab ? tab.data.doc : null
}

/**
 * The tab the address bar follows: the main window's active tab (the active group's when it is in the main window,
 * else the main group used last), when it shows a file.
 */
export function addressTab(w: Workspace): DocTab | null {
  const main = L.groupsIn(w.layout, L.MAIN)
  let group = main.includes(w.layout.activeGroup) ? w.layout.activeGroup : undefined
  for (const t of w.recent) {
    if (group) break
    const g = L.groupOf(w.layout, t)
    if (g && main.includes(g)) group = g
  }
  return docTab(w, w.layout.groups[group ?? main[0]]?.active)
}

export const tabsOf = (l: L.Layout<TabData>, doc: DocId): L.TabId[] =>
  Object.values(l.tabs).flatMap((t) => (t.data.kind === 'doc' && t.data.doc === doc ? [t.id] : []))

// The tab of `doc` to reuse in a group: the group's active one when it shows the file, else the one used last there.
function tabIn(l: L.Layout<TabData>, group: L.GroupId, doc: DocId): L.TabId | undefined {
  const g = l.groups[group]
  if (!g) return undefined
  const mine = (t: L.TabId) => {
    const d = l.tabs[t]?.data
    return d?.kind === 'doc' && d.doc === doc
  }
  return g.active && mine(g.active) ? g.active : (g.mru.find(mine) ?? g.tabs.find(mine))
}

const docTabData = (doc: DocId, route: Route): TabData => ({ kind: 'doc', doc, route })

/**
 * The group a file opens in when none is named: the active one, unless it shows the Explorer, which stays in view:
 * then the group used last besides it, else the Explorer's own (a new tab beside it), as the Explorer opens things.
 */
export function openingGroup(w: Workspace): L.GroupId {
  return activeTab(w)?.data.kind === 'explorer' ? (recentGroup(w, w.layout.activeGroup) ?? w.layout.activeGroup) : w.layout.activeGroup
}

/** Adds a file, shown at `route` in a new tab (`tabId`) of the group it opens in (`openingGroup`). */
export function addDoc(w: Workspace, doc: Doc, route: Route, tabId: L.TabId): Workspace {
  const added = { ...w, docs: { ...w.docs, [doc.id]: doc }, order: [...w.order, doc.id] }
  return withLayout(added, L.openTab(w.layout, { id: tabId, data: docTabData(doc.id, route) }, { group: openingGroup(w) }))
}

/**
 * Shows a file: its tab in the group it opens in (`openingGroup`), else its tab used last anywhere (never one under
 * the active Explorer), else a new tab (`tabId`) on its home there.
 */
export function activateDoc(w: Workspace, id: DocId, tabId: L.TabId): Workspace {
  if (!w.docs[id]) return w
  const group = openingGroup(w)
  // The Explorer's group, when the file opens elsewhere: none of its tabs covers the Explorer.
  const keep = group === w.layout.activeGroup ? null : w.layout.activeGroup
  const mine = (t: L.TabId) => docTab(w, t)?.data.doc === id && L.groupOf(w.layout, t) !== keep
  const tab = tabIn(w.layout, group, id) ?? w.recent.find(mine) ?? tabsOf(w.layout, id).find(mine)
  return withLayout(w, tab ? L.activate(w.layout, tab) : L.openTab(w.layout, { id: tabId, data: docTabData(id, HOME) }, { group }))
}

/**
 * Shows a place of a file in a group (default: the one it opens in, `openingGroup`): in that group's tab of the file,
 * unless `newTab`, else in a new tab (`tabId`) after the group's active tab. Says which tab shows it.
 */
export function openPlace(
  w: Workspace,
  doc: DocId,
  route: Route,
  tabId: L.TabId,
  o: { group?: L.GroupId; newTab?: boolean; background?: boolean } = {},
): { workspace: Workspace; tab: L.TabId | null } {
  if (!w.docs[doc]) return { workspace: w, tab: null }
  const group = o.group && w.layout.groups[o.group] ? o.group : openingGroup(w)
  const reuse = o.newTab ? undefined : tabIn(w.layout, group, doc)
  if (reuse) {
    const routed = setTabRoute(w, reuse, route)
    return { workspace: withLayout(routed, L.activate(routed.layout, reuse)), tab: reuse }
  }
  return { workspace: withLayout(w, L.openTab(w.layout, { id: tabId, data: docTabData(doc, route) }, { group, activate: !o.background })), tab: tabId }
}

/** The page a tab shows, unless it already shows it (compared as written in the address). */
export function setTabRoute(w: Workspace, tabId: L.TabId, route: Route): Workspace {
  const tab = w.layout.tabs[tabId]
  if (!tab || tab.data.kind !== 'doc' || href(tab.data.route) === href(route)) return w
  return { ...w, layout: L.updateTab(w.layout, tabId, { ...tab.data, route }) }
}

export const activateTab = (w: Workspace, tabId: L.TabId): Workspace => withLayout(w, L.activate(w.layout, tabId))
export const activateGroup = (w: Workspace, group: L.GroupId): Workspace => withLayout(w, L.activateGroup(w.layout, group))
/** Closing tabs never closes a file (it stays in the sidebar and the Explorer). */
export const closeTabs = (w: Workspace, tabIds: L.TabId[]): Workspace => withLayout(w, L.closeTabs(w.layout, tabIds))
export const closeOthers = (w: Workspace, tabId: L.TabId): Workspace => withLayout(w, L.closeOthers(w.layout, tabId))
export const closeAll = (w: Workspace, group: L.GroupId): Workspace => withLayout(w, L.closeAll(w.layout, group))
export const moveTab = (w: Workspace, tabId: L.TabId, toGroup: L.GroupId, index: number): Workspace =>
  withLayout(w, L.moveTab(w.layout, tabId, toGroup, index))
export const joinGroups = (w: Workspace, from: L.GroupId, into: L.GroupId): Workspace => withLayout(w, L.join(w.layout, from, into))
export const resizeSplit = (w: Workspace, win: L.WindowId, path: number[], sizes: number[]): Workspace =>
  withLayout(w, L.resize(w.layout, win, path, sizes))
export const dockWindow = (w: Workspace, win: L.WindowId): Workspace => withLayout(w, L.dock(w.layout, win))

/**
 * A new group (`groupId`) beside `group`. A dragged tab (`move`) moves into it. Otherwise it shows a copy of a tab
 * (`copy`, default the group's active one) as a new tab (`tabId`) of the same file at the same page; a tab of another
 * kind is never copied (there is one Explorer): it moves when its group keeps another tab, else the new group starts empty.
 */
export function splitGroup(
  w: Workspace,
  group: L.GroupId,
  dir: 'row' | 'column',
  side: 'before' | 'after',
  groupId: L.GroupId,
  o: { tabId: L.TabId; move?: L.TabId; copy?: L.TabId },
): Workspace {
  const g = w.layout.groups[group]
  if (!g) return w
  if (o.move) return w.layout.tabs[o.move] ? withLayout(w, L.split(w.layout, group, dir, side, groupId, w.layout.tabs[o.move])) : w
  const source = w.layout.tabs[o.copy ?? g.active ?? '']
  if (source?.data.kind === 'doc') return withLayout(w, L.split(w.layout, group, dir, side, groupId, { id: o.tabId, data: { ...source.data } }))
  const carried = source && g.tabs.length > 1 ? source : undefined
  return withLayout(w, L.split(w.layout, group, dir, side, groupId, carried))
}

/**
 * Moves a group into window `win` (a popup). The main window's only group first gets an empty group beside it
 * (`spareGroupId`), so the main window never ends up with nothing.
 */
export function popOutGroup(w: Workspace, group: L.GroupId, win: L.WindowId, spareGroupId: L.GroupId): Workspace {
  let l = w.layout
  if (L.windowOf(l, group) === L.MAIN && L.groupsIn(l, L.MAIN).length === 1) l = L.split(l, group, 'row', 'after', spareGroupId)
  const next = L.popOut(l, group, win)
  return next === l ? w : withLayout(w, next)
}

/**
 * Moves one tab into window `win` (a popup) in a new group (`groupId`); the rest of its group stays where it is. A tab
 * alone in its group takes the group along (popOutGroup, with its `spareGroupId`).
 */
export function popOutTab(w: Workspace, tabId: L.TabId, win: L.WindowId, groupId: L.GroupId, spareGroupId: L.GroupId): Workspace {
  const from = L.groupOf(w.layout, tabId)
  if (from === null) return w
  if (w.layout.groups[from].tabs.length === 1) return popOutGroup(w, from, win, spareGroupId)
  const l = L.split(w.layout, from, 'row', 'after', groupId, w.layout.tabs[tabId])
  const next = L.popOut(l, groupId, win)
  return next === l ? w : withLayout(w, next)
}

export const explorerTab = (w: Workspace): L.Tab<TabData> | undefined => Object.values(w.layout.tabs).find((t) => t.data.kind === 'explorer')

/** Whether a tab is the one its group shows. */
export const isShown = (w: Workspace, tabId: L.TabId): boolean => Object.values(w.layout.groups).some((g) => g.active === tabId)

/**
 * Shows the Explorer (there is one at most). Shown in a group already: that group becomes active. Otherwise, with
 * `split` (room for it), it goes into a new group (`groupId`) on the left of `beside`; else it shows as a tab
 * (its own place, or a new tab `tabId` in `beside`).
 */
export function showExplorer(w: Workspace, beside: L.GroupId, o: { split: boolean; tabId: L.TabId; groupId: L.GroupId }): Workspace {
  const tab = explorerTab(w)
  if (tab && isShown(w, tab.id)) return withLayout(w, L.activate(w.layout, tab.id))
  const target = w.layout.groups[beside] ? beside : w.layout.activeGroup
  const explorer: L.Tab<TabData> = tab ?? { id: o.tabId, data: { kind: 'explorer' } }
  if (o.split) return withLayout(w, L.split(w.layout, target, 'row', 'before', o.groupId, explorer))
  return withLayout(w, tab ? L.activate(w.layout, tab.id) : L.openTab(w.layout, explorer, { group: target }))
}

/**
 * One of the app's own pages (What's new, the welcome page) in a tab, one at most each: where it is, it becomes
 * active; else a new tab (`tabId`) in `group`. `background` (a Ctrl or middle click): a new tab is not shown, and one
 * already open is left as it is.
 */
export function showAppPage(w: Workspace, kind: AppPage, group: L.GroupId, tabId: L.TabId, background = false): Workspace {
  const tab = Object.values(w.layout.tabs).find((t) => t.data.kind === kind)
  if (tab) return background ? w : withLayout(w, L.activate(w.layout, tab.id))
  const at = { group: w.layout.groups[group] ? group : undefined, activate: !background }
  return withLayout(w, L.openTab(w.layout, { id: tabId, data: { kind } }, at))
}

/**
 * Back, forward or a typed address: the entry names the tab it belongs to (`tabId`, from history.state). That tab,
 * where it still is (any group or window), becomes active on the entry's page. With no such tab, the main window's
 * tab takes the page only when its file has that page; otherwise nothing changes.
 */
export function followHistory(w: Workspace, tabId: L.TabId | null, route: Route): Workspace {
  const tab = docTab(w, tabId)
  if (tab) return activateTab(setTabRoute(w, tab.id, route), tab.id)
  const address = addressTab(w)
  if (!address || resolve(w.docs[address.data.doc].library, route).missing) return w
  return setTabRoute(w, address.id, route)
}

/** The group used most recently other than `except` (where the Explorer opens things), or null when there is none. */
export function recentGroup(w: Workspace, except: L.GroupId | null): L.GroupId | null {
  for (const t of w.recent) {
    const g = L.groupOf(w.layout, t)
    if (g && g !== except) return g
  }
  return L.allGroups(w.layout).find((g) => g !== except) ?? null
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

/** The step undo would undo now (null for none): give it to `undoStep` to undo that step later, and only that one. */
export const lastStep = (w: Workspace): Entry<Snap> | null => w.history.past[w.history.past.length - 1] ?? null

/**
 * Undoes `step` while it is still the last one (a toast's Undo); null once anything came after it (another change,
 * typing merged into it, an undo) or it is gone, and then nothing changes.
 */
export function undoStep(w: Workspace, step: Entry<Snap> | null): { workspace: Workspace; entry: Entry<Snap> } | null {
  return step && lastStep(w) === step ? undoEdit(w) : null
}

/**
 * Tabs of `doc` that a rename left on the old name, named again: each route is read in `before` (the library the
 * routes were last named in), and its course and quiz found again by id in the library now. A page whose course or
 * quiz is gone keeps its route (its tab says so when shown).
 */
export function followRenames(w: Workspace, doc: DocId, before: Library): Workspace {
  const now = w.docs[doc]?.library
  if (!now || now === before) return w
  const layout = L.mapTabs(w.layout, (tab) => {
    const d = tab.data
    if (d.kind !== 'doc' || d.doc !== doc || !('course' in d.route)) return d
    const was = resolve(before, d.route)
    const place = was.missing ? undefined : sameIds(now, was)
    if (!place?.course) return d
    const route = { ...d.route, course: place.course.name, ...(place.quiz && { quiz: place.quiz.name }) } as Route
    return href(route) === href(d.route) ? d : { ...d, route }
  })
  return layout === w.layout ? w : { ...w, layout }
}

/**
 * The history without a document (closed, or replaced from outside). Its own entries go. An entry that also changed
 * another document (a move between files) can't be undone in half: the other file would lose what moved without the
 * gone one getting it back. So it goes with every step beyond it (older ones in `past`, those redone after it in
 * `future`), as undoing those would undo it too: the snapshots hold whole libraries.
 */
export function forget(h: History<Snap>, id: DocId): History<Snap> {
  const touches = (e: Entry<Snap>) => id in e.before || id in e.after
  const shared = (e: Entry<Snap>) => touches(e) && [...Object.keys(e.before), ...Object.keys(e.after)].some((k) => k !== id)
  // Both lists end with the step taken next (undo takes past's last, redo future's last).
  const keep = (list: Entry<Snap>[]) => {
    let cut = -1
    list.forEach((e, i) => shared(e) && (cut = i))
    return list.slice(cut + 1).filter((e) => !touches(e))
  }
  const past = keep(h.past)
  const future = keep(h.future)
  return past.length === h.past.length && future.length === h.future.length ? h : { past, future }
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

/**
 * Another tab wrote the document: this tab takes it up (its unsaved mark too), with `handle`, the file handle kept
 * with it now (the other tab may have saved it to another file), so the stored handle is never forgotten here.
 */
export function takeRecord(w: Workspace, rec: DocRecord, handle: FileSystemFileHandle | null): Workspace {
  if (!w.docs[rec.id]) return w
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
 * Whether a document may close: with unsaved changes, `ask` (Save, Don't save, or null for Cancel) and, for Save,
 * `save`; changes made while it saved are asked about again. `dirty` says whether it has changes now (null: it is
 * gone). Resolves false when it stays open.
 */
export async function readyToClose(
  dirty: () => boolean | null,
  ask: () => Promise<'save' | 'discard' | null>,
  save: () => Promise<boolean>,
): Promise<boolean> {
  for (;;) {
    const changes = dirty()
    if (changes === null) return false
    if (!changes) return true
    const choice = await ask()
    if (choice === null) return false
    if (choice === 'discard') return dirty() !== null
    if (!(await save())) return false
  }
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
  const rest: Workspace = {
    ...w,
    docs,
    order: w.order.filter((x) => x !== id),
    history: forget(w.history, id),
    clipboard: cb && cb.mode === 'cut' && cb.refs.some((r) => r.doc === id) ? { ...cb, mode: 'copy' } : cb,
  }
  return withLayout(rest, L.closeTabs(w.layout, tabsOf(w.layout, id)))
}

/**
 * A draft course dropped as if it was never made, only while it is still exactly the course created (`draft`, the same
 * object: never renamed, given a quiz, pasted or moved into, anywhere). When its "Add course" is the last entry and
 * nothing changed since, the library it was added to comes back as it was (so the unsaved mark too) and the entry
 * goes; otherwise the course is just taken out. Changed since, it stays: then it is no draft.
 */
export function dropDraft(w: Workspace, id: DocId, draft: Course): Workspace {
  const d = w.docs[id]
  if (!d || !d.library.courses.includes(draft)) return w
  const last = w.history.past[w.history.past.length - 1]
  const before = last?.before[id]
  if (last && Object.keys(last.after).length === 1 && last.after[id] === d.library && before && !before.courses.some((c) => c.id === draft.id)) {
    return { ...patchDoc(w, id, { library: before }), history: { ...w.history, past: w.history.past.slice(0, -1) } }
  }
  return patchDoc(w, id, { library: { ...d.library, courses: d.library.courses.filter((c) => c !== draft) } })
}

// ---- Clipboard ----

const count = (f: Fragment) => (f.kind === 'course' ? f.courses.length : f.kind === 'quiz' ? f.quizzes.length : f.cards.length)
const what = (f: Fragment) => {
  const n = count(f)
  return n === 1 ? f.kind : f.kind === 'quiz' ? plural(n, 'quiz', 'quizzes') : plural(n, f.kind)
}

/**
 * Copies (or cuts) the items: their contents as they are now. `from` adds libraries that are not open documents (a
 * Google Drive library peeked at in the Explorer), which can be copied from. Throws the reason when they can't be.
 */
export function toClipboard(w: Workspace, refs: ItemRef[], mode: 'copy' | 'cut', from: Docs = {}): Workspace {
  return { ...w, clipboard: { mode, refs, fragment: extract({ ...from, ...libraries(w) }, refs) } }
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
export function reopenFile(w: Workspace, id: DocId, library: Library, file: FileRef, tabId: L.TabId): { workspace: Workspace; ask: boolean } {
  const d = w.docs[id]
  if (!d) return { workspace: w, ask: false }
  const active = activateDoc(w, id, tabId)
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

/**
 * The workspace's own record: the open documents in order, the layout, the Explorer, each document's own name, the
 * account each own Drive file belongs to, and which tabs were active last.
 */
export const workspaceRecord = (w: Workspace): WorkspaceRecord => ({
  version: 1,
  docs: w.order,
  layout: w.layout,
  explorer: w.explorer,
  ui: {
    names: Object.fromEntries(w.order.map((id) => [id, w.docs[id].name])),
    owners: Object.fromEntries(w.order.flatMap((id) => (w.docs[id].owner ? [[id, w.docs[id].owner]] : []))),
    recent: w.recent,
  },
})

const isString = (x: unknown): x is string => typeof x === 'string'
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(isString)

// Pages of the app itself, not of a file: a tab that held one (before tabs had their own pages) shows its file's home.
const OWN = ['home', 'debug', 'changelog', 'workbench']
/** A route as a tab keeps it, or null (a Drive link is never kept: it would open again). */
export function readRoute(r: unknown): Route | null {
  const x = r as Record<string, unknown> | null
  if (!x || typeof x !== 'object' || !isString(x.name)) return null
  if (OWN.includes(x.name)) return HOME
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

/** One group with a tab per document (`newId` names the tabs), the first active. */
export function defaultLayout(docIds: DocId[], groupId: string, newId: () => string): L.Layout<TabData> {
  return docIds.reduce<L.Layout<TabData>>(
    (l, id, i) => L.openTab(l, { id: newId(), data: docTabData(id, HOME) }, { activate: i === 0, index: i }),
    L.emptyLayout(groupId),
  )
}

/**
 * The stored layout, checked: tabs of documents no longer open (and pages that can't be read) go, one Explorer at
 * most, popped-out groups come back docked. A file may have no tab (its tabs were closed). Anything malformed gives
 * the default layout, a tab per file.
 */
export function readLayout(raw: unknown, docIds: DocId[], groupId: string, newId: () => string): L.Layout<TabData> {
  const l = raw as L.Layout<TabData> | null
  const groupsOk =
    !!l?.groups &&
    typeof l.groups === 'object' &&
    Object.entries(l.groups).every(
      ([id, g]) => g && g.id === id && strings(g.tabs) && strings(g.mru) && (g.active === null || isString(g.active)),
    )
  const windowsOk = !!l?.windows && typeof l.windows === 'object' && !!l.windows[L.MAIN] && Object.values(l.windows).every((w) => isNode(w?.root))
  if (!l || typeof l !== 'object' || !groupsOk || !windowsOk || !isString(l.activeGroup) || !l.tabs || typeof l.tabs !== 'object') {
    return defaultLayout(docIds, groupId, newId)
  }
  const tabs: L.Layout<TabData>['tabs'] = {}
  let explorer = false
  for (const [id, tab] of Object.entries(l.tabs)) {
    const data = tab?.data as Partial<Extract<TabData, { kind: 'doc' }>> | { kind?: unknown } | undefined
    if (tab?.id !== id || !data) continue
    if (data.kind === 'explorer' && !explorer) {
      explorer = true
      tabs[id] = { id, data: { kind: 'explorer' } }
    } else if (data.kind === 'changelog' || data.kind === 'welcome') {
      // One at most each.
      const kind = data.kind
      if (!Object.values(tabs).some((t) => t.data.kind === kind)) tabs[id] = { id, data: { kind } }
    } else if (data.kind === 'doc' && 'doc' in data && isString(data.doc) && docIds.includes(data.doc)) {
      const route = readRoute(data.route)
      if (route) tabs[id] = { id, data: docTabData(data.doc, route) }
    }
  }
  let next = L.normalize({ tabs, groups: l.groups, windows: l.windows, activeGroup: l.activeGroup })
  for (const win of Object.keys(next.windows)) if (win !== L.MAIN) next = L.dock(next, win)
  return next.groups[next.activeGroup] ? next : defaultLayout(docIds, groupId, newId)
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
  newId: () => string,
): Workspace {
  const ui = read.workspace?.ui as { names?: Record<string, unknown>; owners?: Record<string, unknown>; recent?: unknown } | null
  const kept = ui?.names ?? {}
  const owners = ui?.owners && typeof ui.owners === 'object' ? ui.owners : {}
  let w = emptyWorkspace(groupId)
  for (const rec of read.docs) {
    const own = kept[rec.id]
    const name = isString(own) && own.trim() ? own : freeDocName(w, 'New library')
    const file = rec.file && { ...rec.file, handle: read.handles[rec.id] ?? null }
    const owner = isString(owners[rec.id]) ? (owners[rec.id] as string) : null
    const doc = makeDoc(rec.id, rec.library, name, { saved: rec.dirty ? null : rec.library, drive: rec.drive, file, owner })
    w = { ...w, docs: { ...w.docs, [doc.id]: doc }, order: [...w.order, doc.id] }
  }
  const layout = readLayout(read.workspace?.layout, w.order, groupId, newId)
  const recent = strings(ui?.recent) ? ui.recent.filter((t) => layout.tabs[t]) : []
  return withLayout({ ...w, layout: L.emptyLayout(groupId), recent, explorer: readExplorer(read.workspace?.explorer) }, layout)
}
