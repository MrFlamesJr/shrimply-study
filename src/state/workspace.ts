// The workspace as one immutable object, and its pure transitions (useWorkspace runs them): the open documents, the
// closed ones, the layout, the undo history, the clipboard and the Explorer's state. Nothing here touches the DOM,
// storage or the clock: times and new ids come in as arguments.
import { FORMATS, type Course, type Library } from '../model'
import { fileKeys, href, resolve, sameIds, type Route } from '../logic/routes'
import type { AppPage, TabData } from '../logic/workbenchActions'
import { isViewOnly, VIEW_ONLY_TEXT, type SaveProblem } from '../logic/autosave'
import type { DriveSource } from '../storage/googleDrive'
import type { ClosedFile, DocRecord, WorkspaceRecord } from '../storage/workspaceRecord'
import { emptySelection, type Selection } from '../kit/selection'
import { emptyHistory, record, redo, seal, undo, type Entry, type History } from '../kit/history'
import * as L from '../kit/layout'
import { exists, extract, insert, move, type DocId, type Docs, type Fragment, type ItemRef, type Target } from '../logic/contentOps'
import { freeName } from '../logic/names'
import { plural } from '../logic/plural'

export type { AppPage, ClosedFile, DocId, TabData }

/**
 * An open library: a Google Drive file (`drive`), or a browser library (kept in this browser only, until uploaded).
 * The user's own Drive file saves itself (autosave); any other Drive file is view only (`viewOnly`).
 */
export type Doc = {
  id: DocId
  library: Library
  /**
   * The library object last opened or saved to Google Drive here. A Drive file has changes still to save while
   * `library !== saved` (null: never saved here).
   */
  saved: Library | null
  /** Its own name ("New library 2"), shown while it has no Drive file (see `docName`). */
  name: string
  drive: DriveSource | null
  /** Counts the times the whole library was replaced (taken from Google Drive, from another tab, loaded as text). */
  replaced: number
  /** Why its autosave is paused; null while it saves as it should. */
  problem: SaveProblem | null
  /**
   * Another tab has changes to it that are not on Google Drive yet (its record said so when taken up here). That tab
   * saves them; here they are never counted as saved: no newer version from Drive replaces them, and closing keeps them.
   */
  dirtyElsewhere: boolean
}

/** The libraries of some documents, as a history entry keeps them. */
export type Snap = Record<DocId, Library>
export type Clipboard = { mode: 'copy' | 'cut'; refs: ItemRef[]; fragment: Fragment }
// `search` and `scroll`: the filter text and the tree's scroll place, kept with the tab.
export type Explorer = { expanded: string[]; selection: Selection; search?: string; scroll?: number }
export type Workspace = {
  docs: Record<DocId, Doc>
  /** The open documents in the order the sidebar lists them. */
  order: DocId[]
  /**
   * The files closed here, the one closed last first (asked for: closing never removes a file): a browser library
   * (its record stays in the backup) or a Drive file (one entry per Drive file), listed in the Explorer to open again.
   */
  closed: ClosedFile[]
  /** Signed in with Google: then only the user's own Drive files can change (see `viewOnly`). */
  signedIn: boolean
  layout: L.Layout<TabData>
  history: History<Snap>
  clipboard: Clipboard | null
  explorer: Explorer
  /** Tabs, the one active most recently first (across groups and windows). */
  recent: L.TabId[]
}

export const emptyExplorer = (): Explorer => ({ expanded: [], selection: emptySelection })

export const emptyWorkspace = (groupId: string, signedIn = false): Workspace => ({
  docs: {},
  order: [],
  closed: [],
  signedIn,
  layout: L.emptyLayout(groupId),
  history: emptyHistory(),
  clipboard: null,
  explorer: emptyExplorer(),
  recent: [],
})

/** A Drive file has changes still to save (a browser library's changes are in the backup already). */
export const hasChanges = (d: Doc): boolean => d.library !== d.saved
/** What the document is called: its Drive file's name, or its own. */
export const docName = (d: Doc): string => d.drive?.name ?? d.name
export const where = (d: Doc): 'drive' | 'browser' => (d.drive ? 'drive' : 'browser')
/** A file's name without its ".shrimp" ending (a browser library's own name has none). */
export const bareName = (name: string): string => name.replace(/\.shrimp$/i, '')

export const makeDoc = (id: DocId, library: Library, name: string, more: Partial<Doc> = {}): Doc => ({
  id,
  library,
  saved: library,
  name,
  drive: null,
  replaced: 0,
  problem: null,
  dirtyElsewhere: false,
  ...more,
})

/** The names of the open and closed libraries, without ".shrimp": a new one's name is free among them. */
export const docNames = (w: Workspace): string[] => [...Object.values(w.docs).map(docName), ...w.closed.map((c) => c.name)].map(bareName)

/** `base`, or "base 2" and so on: a name no open or closed library has. */
export const freeDocName = (w: Workspace, base: string): string => freeName(base, docNames(w))
/** A browser library's own name changed (a Drive file's name is Google's, see `renameDriveFile`). Not an edit: no history. */
export const renameDoc = (w: Workspace, id: DocId, name: string): Workspace => patchDoc(w, id, (d) => (d.name === name ? null : { name }))

// ---- View only (asked for): a Drive file not known to be the signed-in user's own (someone else's, or any while
// signed out) is shown and studied, never changed: no content change, undo step or cut ever touches it. ----

export const viewOnly = (w: Workspace, id: DocId): boolean => !!w.docs[id] && isViewOnly(w.docs[id], w.signedIn)

export const setSignedIn = (w: Workspace, signedIn: boolean): Workspace => (w.signedIn === signedIn ? w : { ...w, signedIn })

/** The user's own Drive files with changes not on Google Drive yet (waiting, or paused by a problem), in order. */
export const unsavedDrive = (w: Workspace): DocId[] =>
  w.order.filter((id) => !!w.docs[id].drive && !viewOnly(w, id) && (hasChanges(w.docs[id]) || !!w.docs[id].problem))

/**
 * Keeps view-only libraries untouchable: their undo steps go and a cut from one becomes a copy. Changes one holds from
 * before it was known to be view only (a backup from before this release, an account that turned out not to own it)
 * are never lost: they move to a browser library of their own, "<name> (my changes)" (`newId` names it), right after
 * it, and its Drive file is read again on its next sync (its checksum is forgotten). Says which moved where.
 */
export function settleViewOnly(w: Workspace, newId: () => string): { workspace: Workspace; kept: { from: DocId; to: DocId }[] } {
  let next = w
  const kept: { from: DocId; to: DocId }[] = []
  for (const id of w.order) {
    const d = w.docs[id]
    if (!d.drive || !viewOnly(w, id)) continue
    const cb = next.clipboard
    const cut = cb?.mode === 'cut' && cb.refs.some((r) => r.doc === id)
    const history = forget(next.history, id)
    if (history !== next.history || cut) next = { ...next, history, clipboard: cb && cut ? { ...cb, mode: 'copy' } : cb }
    if (!hasChanges(d)) continue
    const copy = makeDoc(newId(), d.library, freeDocName(next, `${bareName(docName(d))} (my changes)`))
    const order = [...next.order]
    order.splice(order.indexOf(id) + 1, 0, copy.id)
    next = { ...next, docs: { ...next.docs, [id]: { ...d, saved: d.library, drive: { ...d.drive, md5: '' } }, [copy.id]: copy }, order }
    kept.push({ from: id, to: copy.id })
  }
  return { workspace: next, kept }
}

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

/** A window's focused group: the active group when it is in that window, else its group used last, else its first. */
export function focusedGroup(w: Workspace, win: L.WindowId): L.GroupId {
  const groups = L.groupsIn(w.layout, win)
  if (groups.includes(w.layout.activeGroup)) return w.layout.activeGroup
  for (const t of w.recent) {
    const g = L.groupOf(w.layout, t)
    if (g && groups.includes(g)) return g
  }
  return groups[0]
}

/** The main window's focused group. */
export const mainGroup = (w: Workspace): L.GroupId => focusedGroup(w, L.MAIN)

/**
 * The tab a window's address names (the main window's by default): its focused group's active tab, of any kind; null
 * when it is empty.
 */
export function shownTab(w: Workspace, win: L.WindowId = L.MAIN): L.Tab<TabData> | null {
  const active = w.layout.groups[focusedGroup(w, win)]?.active
  return (active && w.layout.tabs[active]) || null
}

/** That tab when it shows a file (a typed address goes to its file). */
export const addressTab = (w: Workspace): DocTab | null => docTab(w, shownTab(w)?.id)

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

// ---- Opening what is already open (asked for): a page shown in a tab anywhere (any group, any window) is focused
// there, never opened twice; with several, the one used last. Only an explicit new tab (Ctrl or middle click,
// Duplicate tab) makes another. ----

/** The tab used last of those `match` accepts, else the first of them; null when none. */
export function usedLast(w: Workspace, match: (t: L.Tab<TabData>) => boolean): L.TabId | null {
  const recent = w.recent.find((id) => w.layout.tabs[id] && match(w.layout.tabs[id]))
  return recent ?? Object.values(w.layout.tabs).find(match)?.id ?? null
}

/** The tab showing exactly this page of a file (compared as written in the address), the one used last. */
export const showing = (w: Workspace, doc: DocId, route: Route): L.TabId | null =>
  usedLast(w, (t) => t.data.kind === 'doc' && t.data.doc === doc && href(t.data.route) === href(route))

/**
 * Shows a place of a file. A tab already showing it, anywhere, is focused (unless `newTab`). Otherwise it goes in a
 * group (default: the one it opens in, `openingGroup`): in that group's tab of the file, unless `newTab`, else in a
 * new tab (`tabId`) after the group's active tab. Says which tab shows it.
 */
export function openPlace(
  w: Workspace,
  doc: DocId,
  route: Route,
  tabId: L.TabId,
  o: { group?: L.GroupId; newTab?: boolean; background?: boolean } = {},
): { workspace: Workspace; tab: L.TabId | null } {
  if (!w.docs[doc]) return { workspace: w, tab: null }
  const open = o.newTab ? null : showing(w, doc, route)
  if (open) return { workspace: activateTab(w, open), tab: open }
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

/** The Explorer tab used last (there may be several: Duplicate tab). */
export const explorerTab = (w: Workspace): L.Tab<TabData> | undefined => {
  const id = usedLast(w, (t) => t.data.kind === 'explorer')
  return id ? w.layout.tabs[id] : undefined
}

/** An Explorer tab's view: its own, else the workspace's. */
export function explorerView(w: Workspace, tabId: L.TabId): Explorer {
  const data = w.layout.tabs[tabId]?.data
  return (data?.kind === 'explorer' && data.view) || w.explorer
}

/** Sets an Explorer tab's view: its own when it has one, else the workspace's. */
export function setExplorerView(w: Workspace, tabId: L.TabId, view: Explorer): Workspace {
  const data = w.layout.tabs[tabId]?.data
  if (data?.kind === 'explorer' && data.view) return { ...w, layout: L.updateTab(w.layout, tabId, { kind: 'explorer', view }) }
  return { ...w, explorer: view }
}

/**
 * A copy of a tab (`tabId`, asked for) right after it in its group, shown: a file's page as a new tab of the same
 * file and page; an Explorer with its own view, starting from the original's; What's new and the welcome page alike.
 */
export function duplicateTab(w: Workspace, from: L.TabId, tabId: L.TabId): Workspace {
  const tab = w.layout.tabs[from]
  const group = L.groupOf(w.layout, from)
  if (!tab || group === null) return w
  const data: TabData = tab.data.kind === 'explorer' ? { kind: 'explorer', view: explorerView(w, from) } : { ...tab.data }
  const index = w.layout.groups[group].tabs.indexOf(from) + 1
  return withLayout(w, L.openTab(w.layout, { id: tabId, data }, { group, index }))
}

/** Whether a tab is the one its group shows. */
export const isShown = (w: Workspace, tabId: L.TabId): boolean => Object.values(w.layout.groups).some((g) => g.active === tabId)

/**
 * Shows the Explorer: an Explorer tab, anywhere, is focused (the one used last). With none, with `split` (room for
 * it), it goes into a new group (`groupId`) on the left of `beside`; else it shows as a new tab `tabId` in `beside`.
 */
export function showExplorer(w: Workspace, beside: L.GroupId, o: { split: boolean; tabId: L.TabId; groupId: L.GroupId }): Workspace {
  const tab = explorerTab(w)
  if (tab) return withLayout(w, L.activate(w.layout, tab.id))
  const target = w.layout.groups[beside] ? beside : w.layout.activeGroup
  const explorer: L.Tab<TabData> = { id: o.tabId, data: { kind: 'explorer' } }
  if (o.split) return withLayout(w, L.split(w.layout, target, 'row', 'before', o.groupId, explorer))
  return withLayout(w, L.openTab(w.layout, explorer, { group: target }))
}

/**
 * One of the app's own pages (What's new, the welcome page) in a tab: a tab of it, anywhere, is focused (the one used
 * last); else a new tab (`tabId`) in `group`. `background` (a Ctrl or middle click): a new tab is not shown, and one
 * already open is left as it is.
 */
export function showAppPage(w: Workspace, kind: AppPage, group: L.GroupId, tabId: L.TabId, background = false): Workspace {
  const tab = usedLast(w, (t) => t.data.kind === kind)
  if (tab) return background ? w : withLayout(w, L.activate(w.layout, tab))
  const at = { group: w.layout.groups[group] ? group : undefined, activate: !background }
  return withLayout(w, L.openTab(w.layout, { id: tabId, data: { kind } }, at))
}

const FILE_PAGES: Route['name'][] = ['home', 'course', 'quiz', 'edit', 'study']
// The app's own pages that are tabs, by route name (the same as their tab's kind).
const APP_TABS = ['explorer', 'changelog', 'welcome', 'studyTips'] as const
const appTab = (name: Route['name']): name is (typeof APP_TABS)[number] => (APP_TABS as readonly string[]).includes(name)

/**
 * Back, forward, a typed address or a reload: the entry names the tab it belongs to (`tabId`, from history.state).
 * That tab, where it still is (any group or window), becomes active on the entry's page. The app's own pages (the
 * Explorer, What's new, the welcome page, How studying works) show their tab, opened in the main window's focused group (`newTab`) when
 * there is none. A file's page with no tab of its own: the file it names (`doc`, from the address) in its tab there
 * (`newTab` when it has none); naming none, or the main window's own file, the main window's tab takes the page only
 * when its file has that page. Otherwise nothing changes.
 */
export function followHistory(w: Workspace, tabId: L.TabId | null, route: Route, o: { doc?: DocId | null; newTab?: L.TabId } = {}): Workspace {
  if (appTab(route.name)) {
    const kind = route.name
    const entry = tabId ? w.layout.tabs[tabId] : undefined
    const tab = entry?.data.kind === kind ? entry.id : usedLast(w, (t) => t.data.kind === kind)
    if (tab) return activateTab(w, tab)
    return o.newTab ? withLayout(w, L.openTab(w.layout, { id: o.newTab, data: { kind } }, { group: mainGroup(w) })) : w
  }
  if (!FILE_PAGES.includes(route.name)) return w
  const tab = docTab(w, tabId)
  if (tab) return activateTab(setTabRoute(w, tab.id, route), tab.id)
  const address = addressTab(w)
  if (o.doc && w.docs[o.doc] && address?.data.doc !== o.doc) {
    return o.newTab ? openPlace(w, o.doc, route, o.newTab, { group: mainGroup(w) }).workspace : w
  }
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

/**
 * Pane mode (a popped-out window's address opened on its own, asked for): the main window shows just the page the
 * address names, one group (`groupId`) with one tab (`tabId`). Its file is the one the address names (`file`, its
 * `fileKey`; none: the only file, else the active one); an app page shows its tab. A file not open here, or an address
 * of no page, gives an empty group.
 */
export function paneLayout(w: Workspace, route: Route, file: string | null, o: { groupId: L.GroupId; tabId: L.TabId }): Workspace {
  const empty = L.emptyLayout<TabData>(o.groupId)
  let data: TabData | null = null
  if (appTab(route.name)) data = { kind: route.name }
  else if (FILE_PAGES.includes(route.name)) {
    const keys = fileKeys(w.order.map((id) => ({ id, name: docName(w.docs[id]) })))
    const doc = file ? w.order.find((id) => keys[id] === file) : w.order.length === 1 ? w.order[0] : activeDoc(w)
    if (doc) data = docTabData(doc, route)
  }
  return { ...w, layout: data ? L.openTab(empty, { id: o.tabId, data }) : empty, recent: data ? [o.tabId] : [] }
}

// ---- Content changes and the history ----

// Merged entries: `before` keeps the first snapshot of each document, `after` the last.
const mergeSnaps = (a: Snap, b: Snap, keep: 'first' | 'last'): Snap => (keep === 'first' ? { ...b, ...a } : { ...a, ...b })
const pick = (docs: Docs, ids: DocId[]): Snap => Object.fromEntries(ids.map((id) => [id, docs[id]]))

/**
 * The one content write path: `update` gets every open library and returns them changed (new objects only for what
 * it changed). Records one history entry holding only the documents it changed, merged into the last one when both
 * have the same `key` within 1.5 s (typing in one field). Nothing changed: the same workspace back. Throws the reason
 * when it would change a view-only library (then nothing changes).
 */
export function applyEdit(w: Workspace, label: string, update: (docs: Docs) => Docs, at: number, key?: string): Workspace {
  const before = libraries(w)
  const after = update(before)
  const changed = w.order.filter((id) => after[id] !== undefined && after[id] !== before[id])
  if (changed.length === 0) return w
  if (changed.some((id) => viewOnly(w, id))) throw new Error(VIEW_ONLY_TEXT)
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
 * The whole library replaced from outside (a newer version from Google Drive, another tab's write taken up): saved as
 * it comes, counted in `replaced`, and its history entries dropped.
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
 * Another tab wrote the document: this tab takes it up, with its Drive file as that tab knows it. Changes that tab has
 * not saved yet are its own to save (two tabs never save one change twice), so here they wait elsewhere
 * (`dirtyElsewhere`), and the record written back from here says the same as the one taken.
 */
export function takeRecord(w: Workspace, rec: DocRecord): Workspace {
  if (!w.docs[rec.id]) return w
  return replaceDoc(w, rec.id, rec.library, { drive: rec.drive, dirtyElsewhere: rec.dirty })
}

/**
 * Saved: `saving` is the library as it was when the save started, so an edit made meanwhile keeps the mark. What
 * another tab had not saved was in it (the library here was built on that tab's), so it waits no more.
 */
export function markSaved(w: Workspace, id: DocId, saving: Library, patch: Partial<Doc> = {}): Workspace {
  return patchDoc(w, id, { ...patch, saved: saving, dirtyElsewhere: false })
}

/**
 * Whether a document may close: while it has changes it could not save, `ask` (Save, Close anyway, or null for
 * Cancel) and, for Save, `save`; changes made while it saved are asked about again. `dirty` says whether it has such
 * changes now (null: it is gone). Resolves false when it stays open.
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

// A document goes: it, its tabs and its history entries, and a cut on the clipboard from it becomes a copy (its items
// can't be moved out of a closed file, but they can still be pasted).
function dropDoc(w: Workspace, id: DocId): Workspace {
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

// The closed files without the ones `match` accepts.
const withoutClosed = (w: Workspace, match: (c: ClosedFile) => boolean): Workspace =>
  w.closed.some(match) ? { ...w, closed: w.closed.filter((c) => !match(c)) } : w

/**
 * Closes a document, which never removes its file (asked for): it heads the closed files, in place of an older entry
 * for it or for its Drive file, to be opened again from the Explorer.
 */
export function closeDoc(w: Workspace, id: DocId): Workspace {
  const d = w.docs[id]
  if (!d) return w
  const entry: ClosedFile = { id, name: docName(d), drive: d.drive }
  const rest = withoutClosed(dropDoc(w, id), (c) => c.id === id || (!!d.drive && c.drive?.id === d.drive.id))
  return { ...rest, closed: [entry, ...rest.closed] }
}

/** A closed file opened again (`doc`, read back under its entry's id): its entry goes, and it shows at `route` in a new tab. */
export function reopenClosed(w: Workspace, doc: Doc, route: Route, tabId: L.TabId): Workspace {
  if (w.docs[doc.id]) return activateDoc(w, doc.id, tabId)
  const rest = withoutClosed(w, (c) => c.id === doc.id || (!!doc.drive && c.drive?.id === doc.drive.id))
  return addDoc(rest, doc, route, tabId)
}

/** A closed file removed from the list (deleted from this browser, or a link removed). */
export const forgetClosed = (w: Workspace, id: DocId): Workspace => withoutClosed(w, (c) => c.id === id)

/** Every closed entry of a Drive file goes (it is open again, or in the bin). */
export const forgetClosedDrive = (w: Workspace, driveId: string): Workspace => withoutClosed(w, (c) => c.drive?.id === driveId)

/**
 * Signed out (asked for: the account is forgotten): every Google Drive library closes, the user's own and shared links
 * alike, and none is listed as closed. Browser libraries stay.
 */
export function signedOut(w: Workspace): Workspace {
  const drive = w.order.filter((id) => w.docs[id].drive)
  return setSignedIn(withoutClosed(drive.reduce(dropDoc, w), (c) => !!c.drive), false)
}

/**
 * Make a copy (asked for): `copy` opens on the same page, in the tab that showed `of` (the active tab, else the one
 * used last), and `of` stays open; with no tab showing it, the copy gets a new tab (`tabId`) on its home.
 */
export function openCopy(w: Workspace, of: DocId, copy: Doc, tabId: L.TabId): Workspace {
  if (!w.docs[of] || w.docs[copy.id]) return w
  const order = [...w.order]
  order.splice(order.indexOf(of) + 1, 0, copy.id)
  const added: Workspace = { ...w, docs: { ...w.docs, [copy.id]: copy }, order }
  const active = docTab(w, activeTab(w)?.id)
  const tab = active?.data.doc === of ? active : docTab(w, usedLast(w, (t) => t.data.kind === 'doc' && t.data.doc === of))
  if (!tab) return withLayout(added, L.openTab(w.layout, { id: tabId, data: docTabData(copy.id, HOME) }, { group: openingGroup(w) }))
  return withLayout(added, L.activate(L.updateTab(w.layout, tab.id, docTabData(copy.id, tab.data.route)), tab.id))
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

const count = (f: Fragment) => (f.kind === 'course' ? f.courses.length : f.kind === 'quiz' ? f.quizzes.length : f.kind === 'group' ? f.groups.length : f.cards.length)
const what = (f: Fragment) => {
  const n = count(f)
  return n === 1 ? f.kind : f.kind === 'quiz' ? plural(n, 'quiz', 'quizzes') : plural(n, f.kind)
}

/**
 * Copies (or cuts) the items: their contents as they are now. `from` adds libraries that are not open documents (a
 * Google Drive library peeked at in the Explorer), which can be copied from. Throws the reason when they can't be (a
 * cut from a view-only library, too).
 */
export function toClipboard(w: Workspace, refs: ItemRef[], mode: 'copy' | 'cut', from: Docs = {}): Workspace {
  if (mode === 'cut' && refs.some((r) => viewOnly(w, r.doc))) throw new Error(VIEW_ONLY_TEXT)
  return { ...w, clipboard: { mode, refs, fragment: extract({ ...from, ...libraries(w) }, refs) } }
}

/**
 * Pastes into `target`, as one history entry: a cut moves its items when they are all still there and can change
 * (then the clipboard holds a copy of them), else the copy taken at cut or copy time goes in with new ids. Throws the
 * reason when the target doesn't take them (a view-only library, or a place they don't fit; nothing changed).
 */
export function paste(w: Workspace, target: Target, newId: () => string, at: number): Workspace {
  const cb = w.clipboard
  if (!cb) throw new Error('Nothing is copied.')
  if (viewOnly(w, target.doc)) throw new Error(VIEW_ONLY_TEXT)
  if (cb.mode === 'cut' && cb.refs.every((r) => exists(libraries(w), r) && !viewOnly(w, r.doc))) {
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

export const docWithDrive = (w: Workspace, driveId: string): Doc | undefined =>
  w.order.map((id) => w.docs[id]).find((d) => d.drive?.id === driveId)

// ---- What the browser keeps, and reading it back ----

/** The document's record in the browser backup (`dirty`: a Drive file with changes still to save, here or elsewhere). */
export const docRecord = (d: Doc): DocRecord => ({ id: d.id, library: d.library, dirty: hasChanges(d) || d.dirtyElsewhere, drive: d.drive })

/**
 * The workspace's own record: the open documents in order, the closed files, the layout, the Explorer, each
 * document's own name, and which tabs were active last.
 */
export const workspaceRecord = (w: Workspace): WorkspaceRecord => ({
  version: 1,
  docs: w.order,
  closed: w.closed,
  layout: w.layout,
  explorer: w.explorer,
  ui: {
    names: Object.fromEntries(w.order.map((id) => [id, w.docs[id].name])),
    recent: w.recent,
  },
})

const isString = (x: unknown): x is string => typeof x === 'string'
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(isString)

// Pages of the app itself, not of a file: a tab that held one (before tabs had their own pages) shows its file's home.
const OWN = ['home', 'debug', 'changelog', 'explorer', 'welcome', 'studyTips', 'empty', 'workbench']
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
  for (const [id, tab] of Object.entries(l.tabs)) {
    const data = tab?.data as Partial<Extract<TabData, { kind: 'doc' }>> | { kind?: unknown; view?: unknown } | undefined
    if (tab?.id !== id || !data) continue
    if (data.kind === 'explorer') {
      // Each keeps its own view (a duplicate); the first one may share the workspace's.
      tabs[id] = { id, data: 'view' in data && data.view ? { kind: 'explorer', view: readExplorer(data.view) } : { kind: 'explorer' } }
    } else if (data.kind === 'changelog' || data.kind === 'welcome' || data.kind === 'studyTips') {
      tabs[id] = { id, data: { kind: data.kind } }
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
  const x = raw as { expanded?: unknown; selection?: Partial<Selection>; search?: unknown; scroll?: unknown } | null
  const s = x?.selection
  const nullable = (v: unknown) => v === null || isString(v)
  return x && strings(x.expanded) && s && strings(s.ids) && nullable(s.anchor) && nullable(s.focus)
    ? {
        expanded: x.expanded,
        selection: { ids: s.ids, anchor: s.anchor ?? null, focus: s.focus ?? null },
        ...(isString(x.search) && x.search !== '' && { search: x.search }),
        ...(typeof x.scroll === 'number' && x.scroll > 0 && { scroll: x.scroll }),
      }
    : emptyExplorer()
}

/**
 * The workspace as the browser kept it: each open document (a Drive file with changes still to save marked so,
 * `saved` null), the closed files (their records stay closed), its layout and Explorer checked. A document's name is
 * the local file's it was once tied to (`legacyName`, without ".shrimp"), else its own, else "New library", "New
 * library 2" and so on.
 * `signedIn`: whether Google is signed in on start.
 */
export function restore(
  read: { workspace: WorkspaceRecord | null; docs: DocRecord[] },
  groupId: string,
  newId: () => string,
  signedIn = false,
): Workspace {
  const ui = read.workspace?.ui as { names?: Record<string, unknown>; recent?: unknown } | null
  const kept = ui?.names ?? {}
  const closed = read.workspace?.closed ?? []
  let w = emptyWorkspace(groupId, signedIn)
  for (const rec of read.docs) {
    if (closed.some((c) => c.id === rec.id)) continue
    const own = kept[rec.id]
    const name = rec.legacyName ? bareName(rec.legacyName) : isString(own) && own.trim() ? own : freeDocName(w, 'New library')
    const doc = makeDoc(rec.id, rec.library, name, { saved: rec.dirty ? null : rec.library, drive: rec.drive })
    w = { ...w, docs: { ...w.docs, [doc.id]: doc }, order: [...w.order, doc.id] }
  }
  w = { ...w, closed }
  const layout = readLayout(read.workspace?.layout, w.order, groupId, newId)
  const recent = strings(ui?.recent) ? ui.recent.filter((t) => layout.tabs[t]) : []
  return withLayout({ ...w, layout: L.emptyLayout(groupId), recent, explorer: readExplorer(read.workspace?.explorer) }, layout)
}
