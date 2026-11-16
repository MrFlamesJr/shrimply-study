# layout (`src/kit/layout.ts`)

## Purpose

The data model and operations for an editor workspace: tabs held in groups, groups arranged in a tree of splits, and
the tree belonging to a window (the main window or popped-out ones). Every operation takes a `Layout<D>` and returns a
new one. `D` is whatever data the host attaches to a tab.

## Public API

Types:

- `TabId`, `GroupId`, `WindowId`: all `string`.
- `Tab<D> = { id: TabId; data: D }`.
- `Group = { id; tabs: TabId[]; active: TabId | null; mru: TabId[] }`. `mru` lists the group's tabs, most recently
  active first. It decides which tab becomes active when the active one closes.
- `Node = { kind: 'group'; id } | { kind: 'split'; dir: 'row' | 'column'; children: Node[]; sizes: number[] }`.
- `Layout<D> = { tabs: Record<TabId, Tab<D>>; groups: Record<GroupId, Group>; windows: Record<WindowId, { root: Node }>; activeGroup: GroupId }`.
  `windows` always has `MAIN`.

Constant: `MAIN: WindowId = 'main'`.

Functions (all return a `Layout<D>` unless noted):

- `emptyLayout<D>(groupId)`: `MAIN` with one empty group.
- `openTab(l, tab, at?: { group?; index?; activate? })`: adds a tab. Defaults: the active group, right after its active
  tab, activated. An id that is already open is only activated, wherever it is.
- `activate(l, tabId)`: makes the tab its group's active and most recent tab, and the group the active group.
- `activateGroup(l, groupId)`: makes a group the active group.
- `updateTab(l, tabId, data)`: replaces a tab's data.
- `mapTabs(l, fn: (tab) => D)`: replaces every tab's data. Same object back when no result differs.
- `closeTabs(l, tabIds)`: closes tabs, then `normalize`.
- `closeOthers(l, tabId)`: closes the other tabs of that tab's group.
- `closeAll(l, groupId)`: closes every tab of a group.
- `moveTab(l, tabId, toGroup, index)`: reorders inside a group or moves to another. `index` counts the target's list
  before the move.
- `split(l, groupId, dir, side: 'before' | 'after', newGroupId, tab?)`: puts a new group beside `groupId`. The two
  share the old group's size half and half. With `tab`, it goes into the new group, active; an open tab is moved, a new
  one is added.
- `join(l, from, into)`: appends `from`'s tabs to `into` and removes `from`.
- `resize(l, win, path: number[], sizes: number[])`: sets the sizes of the split at `path` (child indexes from the
  window's root). Sizes are renormalized to sum 1.
- `popOut(l, groupId, win)`: the group becomes window `win`'s root, tabs and order kept.
- `dock(l, win)`: the window's groups go back into `MAIN` as a row split after its root; the window is removed.
- `normalize(l)`: repairs the layout (see Limitations).
- `groupOf(l, tabId): GroupId | null`, `windowOf(l, groupId): WindowId | null`.
- `groupsIn(l, win): GroupId[]`: a window's groups in reading order. `[]` for an unknown window.
- `allGroups(l): GroupId[]`: `MAIN`'s groups first, then the other windows'.

## Dependencies

None. No imports.

## Inputs and outputs

Input: a `Layout<D>` and ids. Output: a new `Layout<D>` (or an id, list or null for the lookups). Inputs are never
mutated. Operations that cannot apply return the input object itself.

## State ownership

The module is pure. The host holds the current `Layout<D>` (for example in React state or a store) and replaces it with
each result. The host makes the new group ids and window ids; the module never invents ids.

## Events and callbacks

None. The only callback is the `fn` of `mapTabs`, called once per tab.

## Integration

```ts
import { MAIN, emptyLayout, openTab, split, closeTabs, groupsIn, type Layout } from './kit/layout'

type TabData = { title: string }

let layout: Layout<TabData> = emptyLayout<TabData>('g1')
layout = openTab(layout, { id: 't1', data: { title: 'Notes' } })
layout = openTab(layout, { id: 't2', data: { title: 'Todo' } })

// Split to the right and show t2 in the new group.
layout = split(layout, 'g1', 'row', 'after', 'g2', layout.tabs.t2)

console.log(groupsIn(layout, MAIN)) // ['g1', 'g2']

layout = closeTabs(layout, ['t1'])
```

To render, walk `layout.windows[MAIN].root`: a `group` node is one tab strip plus the active tab's content; a `split`
node lays out its `children` in a row or column by `sizes` (fractions that sum to 1). When the user drags a divider, call
`resize` with the node's path.

## Limitations and edge cases

- Operations on an unknown tab, group or window return the input unchanged (`activate`, `activateGroup`, `updateTab`,
  `closeOthers`, `closeAll`, `moveTab`, `join`, `resize`, `split`, `popOut`). `closeTabs` ignores unknown ids and returns
  the input if none is open.
- `split` also returns the input when `newGroupId` already exists. Without `tab` the new group is empty and stays until
  something normalizes the layout (an empty group is removed by the next `normalize`, which most other operations run).
- `join` with `from === into` is refused.
- `moveTab` inside one group does not normalize and returns the input when the order would not change. Moving across
  groups activates the tab in the target, makes the target the active group, and normalizes (an emptied source group is
  removed).
- `closeTabs`: when the active tab closes, the most recently used remaining tab becomes active, else the neighbour at the
  same index (the previous one if it was last), else `null`.
- `normalize` removes empty groups except the last group of `MAIN` (that one stays, empty), removes splits with no child,
  replaces splits with one child by the child, merges a split nested in a split of the same direction (sizes multiply),
  renormalizes sizes (equal shares if they sum to nothing), drops tabs that are in no group or are listed by a group but
  missing from `tabs`, repairs `active` and `mru`, removes windows with no group, and moves `activeGroup` to `MAIN`'s
  first group if it is gone.
- `popOut` refuses `MAIN` as the target, a window id already taken, an unknown group, and the only group of `MAIN`.
- `dock` of `MAIN` or an unknown window returns the input. Docked into a row root, the groups flatten into one row.
- `openTab` with `activate: false` into an empty group still makes the new tab that group's active tab.
- `popOut` and `dock` keep group ids; the host should keep rendering by group id.

In this app: `useWorkspace` keeps a `Layout<TabData>` and `src/layout/Workbench` renders it (`docs/architecture/integration.md`).
