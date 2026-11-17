// What the Workbench shows and lets the user do, decided as data: tab titles and paths, the tab and group menus with
// their disabled reasons, which tabs stay mounted, and whether a group may split. All pure; the component carries
// them out.
import type { Group, Tab } from '../kit/layout'
import { resolve, type Route } from './routes'
import type { Library } from '../model'

/** What a tab shows (the workspace's tabs hold these): a page of a file, the Explorer, or every release's notes. */
export type TabData = { kind: 'doc'; doc: string; route: Route } | { kind: 'explorer' } | { kind: 'changelog' }
export type WorkbenchDoc = { name: string; dirty: boolean; library: Library }
export type Docs = Record<string, WorkbenchDoc>

/** The least size a pane may have after a split. */
export const MIN_PANE = { width: 320, height: 240 }
/** The sash between two panes (kit/split.css). */
const SASH = 4
/** Hidden tabs kept alive in a group besides the shown one. */
export const KEPT_ALIVE = 7

type Place = { doc: WorkbenchDoc; course?: string; quiz?: string }

// The file a doc tab shows and the course and quiz its route names, as far as they exist.
function placeOf(data: TabData, docs: Docs): Place | null {
  if (data.kind !== 'doc') return null
  const doc = docs[data.doc]
  if (!doc) return null
  const { course, quiz } = resolve(doc.library, data.route)
  return { doc, course: course?.name, quiz: quiz?.name }
}

/** A tab's title: for a document its page (the quiz or course name, the file's name at its home). */
export function tabTitle(tab: Tab<TabData>, docs: Docs): string {
  const d = tab.data
  if (d.kind === 'explorer') return 'Explorer'
  if (d.kind === 'changelog') return 'All releases'
  const place = placeOf(d, docs)
  return place ? (place.quiz ?? place.course ?? place.doc.name) : 'Missing file'
}

/** The muted text after a title: the file's name when the tab is not at its home. */
export function tabDescription(tab: Tab<TabData>, docs: Docs): string | undefined {
  const place = placeOf(tab.data, docs)
  return place && (place.course !== undefined || place.quiz !== undefined) ? place.doc.name : undefined
}

/** "Biology.shrimp/Cell Biology/Quiz 1": the file, then its course and quiz as far as the tab shows them. Null for a tab with no file. */
export function copyPathText(tab: Tab<TabData>, docs: Docs): string | null {
  const place = placeOf(tab.data, docs)
  return place && [place.doc.name, place.course, place.quiz].filter((p) => p !== undefined).join('/')
}

export function tabDirty(tab: Tab<TabData>, docs: Docs): boolean {
  return tab.data.kind === 'doc' && !!docs[tab.data.doc]?.dirty
}

/** A tab's native tooltip: its path, and whether the file has unsaved changes. */
export function tabTooltip(tab: Tab<TabData>, docs: Docs): string {
  const path = copyPathText(tab, docs)
  if (path === null) return tabTitle(tab, docs)
  return tabDirty(tab, docs) ? `${path} (unsaved changes)` : path
}

/** The tabs to keep mounted in a group: the shown one and the most recent hidden ones, in tab order. */
export function mountedTabs(g: Group): Set<string> {
  const keep = new Set<string>()
  if (g.active !== null) keep.add(g.active)
  for (const id of g.mru) {
    if (keep.size > KEPT_ALIVE) break
    if (g.tabs.includes(id)) keep.add(id)
  }
  return keep
}

/** Whether a pane of this size may split in `dir`: both halves must stay at least MIN_PANE. */
export function canSplit(size: { width: number; height: number }, dir: 'row' | 'column'): boolean {
  const half = (n: number) => (n - SASH) / 2
  return dir === 'row'
    ? half(size.width) >= MIN_PANE.width && size.height >= MIN_PANE.height
    : half(size.height) >= MIN_PANE.height && size.width >= MIN_PANE.width
}

export type MenuAction =
  | 'close' | 'closeOthers' | 'closeAll' | 'splitRight' | 'splitDown' | 'popOut' | 'reveal' | 'copyPath' | 'save' | 'saveAll' | 'join'
export type MenuEntry = 'separator' | { action: MenuAction; label: string; shortcut?: string; disabled?: boolean; reason?: string }

/** What a menu needs to know about the group it belongs to. */
export type GroupContext = {
  tabCount: number
  /** The pane's size in px, or null when not measured. */
  size: { width: number; height: number } | null
  /** Groups in this group's window, and whether it is the main window. */
  groupsInWindow: number
  inMain: boolean
  /** The group that Join with next group would join into (the one after in reading order), if any. */
  next: boolean
  canPopOut: boolean
  anyDirty: boolean
}

const entry = (action: MenuAction, label: string, why?: string | false | null, shortcut?: string): MenuEntry =>
  why ? { action, label, shortcut, disabled: true, reason: why } : { action, label, shortcut }

const SMALL = 'The pane is too small to split.'

function splitWhy(g: GroupContext, dir: 'row' | 'column'): string | null {
  return g.size && !canSplit(g.size, dir) ? SMALL : null
}

function popOutWhy(g: GroupContext): string | null {
  if (!g.canPopOut) return 'Needs a wider screen with a mouse.'
  if (g.groupsInWindow > 1) return null
  return g.inMain ? 'The main window keeps its last group.' : 'This group is already alone in its window.'
}

/**
 * The menu of a tab. Split shows a copy of a file's tab in the new group; a tab of another kind (the Explorer, of
 * which there is one) moves instead, which would leave an empty group, so it needs a second tab beside it.
 */
export function tabMenu(tab: Tab<TabData>, docs: Docs, g: GroupContext, mac: boolean): MenuEntry[] {
  const doc = tab.data.kind === 'doc'
  const lone = !doc && g.tabCount < 2 && 'It is the only tab in its group.'
  const dirty = tabDirty(tab, docs)
  const why = (dir: 'row' | 'column') => lone || splitWhy(g, dir)
  return [
    entry('close', 'Close'),
    entry('closeOthers', 'Close others', g.tabCount < 2 && 'No other tabs in this group.'),
    entry('closeAll', 'Close all'),
    'separator',
    entry('splitRight', 'Split right', why('row'), mac ? '⌘\\' : 'Ctrl+\\'),
    entry('splitDown', 'Split down', why('column')),
    entry('popOut', g.tabCount > 1 ? 'Move group to new window' : 'Move to new window', popOutWhy(g)),
    'separator',
    entry('reveal', 'Reveal in Explorer', !doc && 'Only files, courses and quizzes are in the Explorer.'),
    entry('copyPath', 'Copy path', !doc && 'Only files, courses and quizzes have a path.'),
    'separator',
    entry('save', 'Save', !doc ? 'Nothing to save here.' : !dirty && 'No unsaved changes.'),
    entry('saveAll', 'Save all', !g.anyDirty && 'No unsaved changes.'),
  ]
}

/** The menu of a group (its More button). */
export function groupMenu(g: GroupContext): MenuEntry[] {
  return [
    entry('splitRight', 'Split right', splitWhy(g, 'row')),
    entry('splitDown', 'Split down', splitWhy(g, 'column')),
    entry('join', 'Join with next group', !g.next && 'There is no group after this one.'),
    entry('popOut', 'Move to new window', popOutWhy(g)),
    'separator',
    entry('closeAll', 'Close all', g.tabCount === 0 && 'No tabs to close.'),
  ]
}
