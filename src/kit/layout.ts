export type TabId = string
export type GroupId = string
export type WindowId = string
/** The main window's id. */
export const MAIN: WindowId = 'main'
export type Tab<D> = { id: TabId; data: D }
// `mru`: the group's tabs, most recently active first (who becomes active when the active one closes).
export type Group = { id: GroupId; tabs: TabId[]; active: TabId | null; mru: TabId[] }
export type Node = { kind: 'group'; id: GroupId } | { kind: 'split'; dir: 'row' | 'column'; children: Node[]; sizes: number[] }
export type Layout<D> = {
  tabs: Record<TabId, Tab<D>>
  groups: Record<GroupId, Group>
  windows: Record<WindowId, { root: Node }> // always has MAIN
  activeGroup: GroupId
}

const leafIds = (n: Node): GroupId[] => (n.kind === 'group' ? [n.id] : n.children.flatMap(leafIds))

/** Fractions renormalized to sum 1 (equal shares when they sum to nothing). */
const share = (sizes: number[]): number[] => {
  const total = sizes.reduce((a, b) => a + b, 0)
  return total > 0 && Number.isFinite(total) ? sizes.map((s) => s / total) : sizes.map(() => 1 / sizes.length)
}

/** The node without the groups `keep` refuses: empty splits go, one-child splits collapse, same-direction nests merge. */
function prune(n: Node, keep: (id: GroupId) => boolean): Node | null {
  if (n.kind === 'group') return keep(n.id) ? n : null
  const children: Node[] = []
  const sizes: number[] = []
  n.children.forEach((c, i) => {
    const p = prune(c, keep)
    if (!p) return
    const s = n.sizes[i] ?? 1 / n.children.length
    if (p.kind === 'split' && p.dir === n.dir) p.children.forEach((g, j) => (children.push(g), sizes.push(s * p.sizes[j])))
    else (children.push(p), sizes.push(s))
  })
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { kind: 'split', dir: n.dir, children, sizes: share(sizes) }
}

/** The group without these tabs; a closed active tab gives way to the most recent one, else its neighbour. */
function without(g: Group, ids: TabId[]): Group {
  const gone = new Set(ids)
  if (!g.tabs.some((t) => gone.has(t))) return g
  const tabs = g.tabs.filter((t) => !gone.has(t))
  const mru = g.mru.filter((t) => !gone.has(t))
  let active = g.active
  if (active !== null && gone.has(active)) active = mru[0] ?? tabs[Math.min(g.tabs.indexOf(active), tabs.length - 1)] ?? null
  return { ...g, tabs, mru, active }
}

const withGroup = <D>(l: Layout<D>, g: Group): Layout<D> => ({ ...l, groups: { ...l.groups, [g.id]: g } })
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)

/** MAIN with one empty group. */
export function emptyLayout<D>(groupId: GroupId): Layout<D> {
  return {
    tabs: {},
    groups: { [groupId]: { id: groupId, tabs: [], active: null, mru: [] } },
    windows: { [MAIN]: { root: { kind: 'group', id: groupId } } },
    activeGroup: groupId,
  }
}

/** Opens a tab (a tab id already open is only activated). Default group: the active one; default index: after its active tab. */
export function openTab<D>(l: Layout<D>, tab: Tab<D>, at: { group?: GroupId; index?: number; activate?: boolean } = {}): Layout<D> {
  if (l.tabs[tab.id]) return activate(l, tab.id)
  const g = l.groups[at.group ?? ''] ?? l.groups[l.activeGroup]
  const after = g.active === null ? g.tabs.length : g.tabs.indexOf(g.active) + 1
  const tabs = [...g.tabs]
  tabs.splice(clamp(at.index ?? after, 0, tabs.length), 0, tab.id)
  const on = at.activate !== false
  const next = withGroup({ ...l, tabs: { ...l.tabs, [tab.id]: tab } }, {
    ...g,
    tabs,
    active: on || g.active === null ? tab.id : g.active,
    mru: on ? [tab.id, ...g.mru] : [...g.mru, tab.id],
  })
  return on ? { ...next, activeGroup: g.id } : next
}

/** Makes a tab its group's active one (and most recent), and its group the active group. */
export function activate<D>(l: Layout<D>, tabId: TabId): Layout<D> {
  const id = groupOf(l, tabId)
  if (id === null) return l
  const g = l.groups[id]
  return { ...withGroup(l, { ...g, active: tabId, mru: [tabId, ...g.mru.filter((t) => t !== tabId)] }), activeGroup: id }
}

/** Makes a group the active group. */
export function activateGroup<D>(l: Layout<D>, groupId: GroupId): Layout<D> {
  return !l.groups[groupId] || l.activeGroup === groupId ? l : { ...l, activeGroup: groupId }
}

/** Replaces a tab's data. */
export function updateTab<D>(l: Layout<D>, tabId: TabId, data: D): Layout<D> {
  const tab = l.tabs[tabId]
  return !tab || tab.data === data ? l : { ...l, tabs: { ...l.tabs, [tabId]: { id: tabId, data } } }
}

/** Replaces every tab's data; the same object back when nothing changed. */
export function mapTabs<D>(l: Layout<D>, fn: (tab: Tab<D>) => D): Layout<D> {
  let changed = false
  const tabs: Record<TabId, Tab<D>> = {}
  for (const [id, tab] of Object.entries(l.tabs)) {
    const data = fn(tab)
    if (data !== tab.data) changed = true
    tabs[id] = data === tab.data ? tab : { id, data }
  }
  return changed ? { ...l, tabs } : l
}

/** Closes tabs, then normalizes. */
export function closeTabs<D>(l: Layout<D>, tabIds: TabId[]): Layout<D> {
  const gone = tabIds.filter((id) => l.tabs[id])
  if (gone.length === 0) return l
  const groups: Record<GroupId, Group> = {}
  for (const [id, g] of Object.entries(l.groups)) groups[id] = without(g, gone)
  const tabs = { ...l.tabs }
  for (const id of gone) delete tabs[id]
  return normalize({ ...l, tabs, groups })
}

/** Closes the other tabs of that tab's group. */
export function closeOthers<D>(l: Layout<D>, tabId: TabId): Layout<D> {
  const id = groupOf(l, tabId)
  return id === null ? l : closeTabs(l, l.groups[id].tabs.filter((t) => t !== tabId))
}

/** Closes every tab of a group. */
export function closeAll<D>(l: Layout<D>, groupId: GroupId): Layout<D> {
  const g = l.groups[groupId]
  return g ? closeTabs(l, g.tabs) : l
}

/** Reorders a tab within its group or moves it to another; `index` counts the target's list before the move. */
export function moveTab<D>(l: Layout<D>, tabId: TabId, toGroup: GroupId, index: number): Layout<D> {
  const from = groupOf(l, tabId)
  const dst = l.groups[toGroup]
  if (from === null || !dst) return l
  if (from === toGroup) {
    const rest = dst.tabs.filter((t) => t !== tabId)
    const i = clamp(index, 0, dst.tabs.length)
    rest.splice(i > dst.tabs.indexOf(tabId) ? i - 1 : i, 0, tabId)
    return rest.every((t, k) => t === dst.tabs[k]) ? l : withGroup(l, { ...dst, tabs: rest })
  }
  const tabs = [...dst.tabs]
  tabs.splice(clamp(index, 0, tabs.length), 0, tabId)
  const moved = withGroup(l, without(l.groups[from], [tabId]))
  return normalize({ ...withGroup(moved, { ...dst, tabs, active: tabId, mru: [tabId, ...dst.mru] }), activeGroup: toGroup })
}

function insertBeside(n: Node, id: GroupId, dir: 'row' | 'column', side: 'before' | 'after', leaf: Node): Node {
  if (n.kind === 'group') {
    return n.id === id ? { kind: 'split', dir, children: side === 'before' ? [leaf, n] : [n, leaf], sizes: [0.5, 0.5] } : n
  }
  const i = n.children.findIndex((c) => c.kind === 'group' && c.id === id)
  if (i < 0 || n.dir !== dir) return { ...n, children: n.children.map((c) => insertBeside(c, id, dir, side, leaf)) }
  const at = side === 'before' ? i : i + 1
  const half = n.sizes[i] / 2
  const children = [...n.children]
  const sizes = [...n.sizes]
  children.splice(at, 0, leaf)
  sizes.splice(at, 0, half)
  sizes[i + (side === 'before' ? 1 : 0)] = half
  return { ...n, children, sizes }
}

/** Puts a new group beside `groupId`, sharing its size half and half; `tab` (new, or an open one that is moved) goes in it, active. */
export function split<D>(l: Layout<D>, groupId: GroupId, dir: 'row' | 'column', side: 'before' | 'after',
  newGroupId: GroupId, tab?: Tab<D>): Layout<D> {
  const win = windowOf(l, groupId)
  if (win === null || l.groups[newGroupId]) return l
  let cur = l
  if (tab) {
    const from = groupOf(l, tab.id)
    cur = from === null ? { ...l, tabs: { ...l.tabs, [tab.id]: tab } } : withGroup(l, without(l.groups[from], [tab.id]))
  }
  const ids = tab ? [tab.id] : []
  const made = withGroup(cur, { id: newGroupId, tabs: ids, active: tab?.id ?? null, mru: ids })
  const root = insertBeside(l.windows[win].root, groupId, dir, side, { kind: 'group', id: newGroupId })
  const next = { ...made, windows: { ...made.windows, [win]: { root } }, activeGroup: newGroupId }
  return tab ? normalize(next) : next
}

/** Appends `from`'s tabs to `into` and removes `from`. */
export function join<D>(l: Layout<D>, from: GroupId, into: GroupId): Layout<D> {
  const a = l.groups[from]
  const b = l.groups[into]
  if (!a || !b || from === into) return l
  const groups = { ...l.groups, [into]: { ...b, tabs: [...b.tabs, ...a.tabs], active: b.active ?? a.active, mru: [...b.mru, ...a.mru] } }
  delete groups[from]
  return normalize({ ...l, groups, activeGroup: l.activeGroup === from ? into : l.activeGroup })
}

/** Sets the sizes of the split at `path` (child indexes from the window's root), renormalized to sum 1. */
export function resize<D>(l: Layout<D>, win: WindowId, path: number[], sizes: number[]): Layout<D> {
  const root = l.windows[win]?.root
  if (!root) return l
  const go = (n: Node, rest: number[]): Node => {
    if (n.kind === 'group') return n
    if (rest.length === 0) return sizes.length === n.children.length ? { ...n, sizes: share(sizes) } : n
    const [i, ...tail] = rest
    const child = n.children[i] && go(n.children[i], tail)
    return child && child !== n.children[i] ? { ...n, children: n.children.map((c, k) => (k === i ? child : c)) } : n
  }
  const next = go(root, path)
  return next === root ? l : { ...l, windows: { ...l.windows, [win]: { root: next } } }
}

/** Makes the group window `win`'s root (its tabs and order kept). The last group of MAIN stays. */
export function popOut<D>(l: Layout<D>, groupId: GroupId, win: WindowId): Layout<D> {
  const from = windowOf(l, groupId)
  if (from === null || win === MAIN || l.windows[win]) return l
  const rest = prune(l.windows[from].root, (id) => id !== groupId)
  if (!rest && from === MAIN) return l
  const windows = { ...l.windows, [win]: { root: { kind: 'group', id: groupId } as Node } }
  if (rest) windows[from] = { root: rest }
  else delete windows[from]
  return normalize({ ...l, windows })
}

/** Moves the window's groups back into MAIN as a row split after its root; the window goes. */
export function dock<D>(l: Layout<D>, win: WindowId): Layout<D> {
  const w = l.windows[win]
  if (win === MAIN || !w) return l
  const windows = { ...l.windows }
  delete windows[win]
  windows[MAIN] = { root: { kind: 'split', dir: 'row', children: [l.windows[MAIN].root, w.root], sizes: [0.5, 0.5] } }
  return normalize({ ...l, windows })
}

/** Removes empty groups (but MAIN's last), one-child splits and same-direction nests; sizes sum 1; drops stray tabs; keeps activeGroup valid. */
export function normalize<D>(l: Layout<D>): Layout<D> {
  const alive = (id: GroupId) => l.groups[id]?.tabs.some((t) => l.tabs[t]) ?? false
  const windows: Layout<D>['windows'] = {}
  for (const [w, { root }] of Object.entries(l.windows)) {
    let r = prune(root, alive)
    if (!r && w === MAIN) {
      const first = leafIds(root).find((id) => l.groups[id])
      r = first ? { kind: 'group', id: first } : root
    }
    if (r) windows[w] = { root: r }
  }
  const groups: Record<GroupId, Group> = {}
  const tabs: Record<TabId, Tab<D>> = {}
  for (const root of Object.values(windows)) {
    for (const id of leafIds(root.root)) {
      const g = l.groups[id]
      if (!g) continue
      const own = g.tabs.filter((t) => l.tabs[t])
      const mru = [...g.mru.filter((t) => own.includes(t)), ...own.filter((t) => !g.mru.includes(t))]
      groups[id] = { id, tabs: own, mru, active: g.active !== null && own.includes(g.active) ? g.active : mru[0] ?? null }
      for (const t of own) tabs[t] = l.tabs[t]
    }
  }
  const activeGroup = groups[l.activeGroup] ? l.activeGroup : leafIds(windows[MAIN].root)[0]
  return { tabs, groups, windows, activeGroup }
}

/** The group holding a tab. */
export function groupOf<D>(l: Layout<D>, tabId: TabId): GroupId | null {
  return Object.values(l.groups).find((g) => g.tabs.includes(tabId))?.id ?? null
}

/** The window whose tree holds a group. */
export function windowOf<D>(l: Layout<D>, groupId: GroupId): WindowId | null {
  return Object.keys(l.windows).find((w) => leafIds(l.windows[w].root).includes(groupId)) ?? null
}

/** A window's groups in reading order. */
export function groupsIn<D>(l: Layout<D>, win: WindowId): GroupId[] {
  const w = l.windows[win]
  return w ? leafIds(w.root) : []
}

/** Every group: MAIN's first, then the other windows'. */
export function allGroups<D>(l: Layout<D>): GroupId[] {
  return Object.keys(l.windows).sort((a, b) => Number(b === MAIN) - Number(a === MAIN)).flatMap((w) => groupsIn(l, w))
}
