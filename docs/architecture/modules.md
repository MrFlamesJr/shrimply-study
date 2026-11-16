# Modules and their contracts

Every signature here is binding: an implementer creates the file with exactly these exports (more private helpers are fine).
"Pure" means no DOM, no React, no clock or random inside (ids and times come in as arguments), never mutates its inputs.

## The kit: `src/kit/` (generic, reusable)

Rules for every file in `src/kit/`:
- Imports only `react`, `react-dom`, `react-dom/client` and other files in `src/kit/` (checked by `src/kit/boundary.test.ts`).
- Knows nothing of courses, quizzes, cards, `.shrimp` or this app's tokens. Data is ids and strings.
- Styles: a component imports its own css file (`src/kit/<name>.css`), classes start with `kit-`, every value is a
  `--kit-*` variable (the host maps them; this app does in `src/theme/tokens.css`) or component geometry (sizes in px).
  Motion uses `--kit-dur` / `--kit-ease` and is off under `prefers-reduced-motion`.
- DOM code never uses the global `window` / `document` for an element it was given: it uses
  `el.ownerDocument` and `el.ownerDocument.defaultView` (the element may live in a popup window), and never
  `instanceof HTMLElement` (fails across windows: use `nodeType` / `nodeName`).

Host variables: `--kit-ground --kit-surface --kit-surface-2 --kit-popup --kit-text --kit-muted --kit-border
--kit-border-strong --kit-accent --kit-accent-soft --kit-accent-line --kit-focus --kit-danger --kit-radius --kit-font
--kit-text-sm --kit-text-xs --kit-weight-bold --kit-line --kit-line-thick --kit-dim --kit-space-1..4 --kit-tap
--kit-dur --kit-ease`.

### `layout.ts` (pure): editor groups, splits and windows

```ts
export type TabId = string
export type GroupId = string
export type WindowId = string
export const MAIN: WindowId = 'main'
export type Tab<D> = { id: TabId; data: D }
// `mru`: the group's tabs, most recently active first (who becomes active when the active one closes).
export type Group = { id: GroupId; tabs: TabId[]; active: TabId | null; mru: TabId[] }
export type Node = { kind: 'group'; id: GroupId } | { kind: 'split'; dir: 'row' | 'column'; children: Node[]; sizes: number[] }
export type Layout<D> = {
  tabs: Record<TabId, Tab<D>>
  groups: Record<GroupId, Group>
  windows: Record<WindowId, { root: Node }>   // always has MAIN
  activeGroup: GroupId
}
export function emptyLayout<D>(groupId: GroupId): Layout<D>              // MAIN with one empty group
export function openTab<D>(l: Layout<D>, tab: Tab<D>, at?: { group?: GroupId; index?: number; activate?: boolean }): Layout<D>
// ^ a tab id already open: only activates it (wherever it is). Default group: activeGroup; default index: after its active tab.
export function activate<D>(l: Layout<D>, tabId: TabId): Layout<D>       // its group's active + mru, and activeGroup
export function activateGroup<D>(l: Layout<D>, groupId: GroupId): Layout<D>
export function updateTab<D>(l: Layout<D>, tabId: TabId, data: D): Layout<D>
export function mapTabs<D>(l: Layout<D>, fn: (tab: Tab<D>) => D): Layout<D>  // same object back when nothing changed
export function closeTabs<D>(l: Layout<D>, tabIds: TabId[]): Layout<D>   // then normalize
export function closeOthers<D>(l: Layout<D>, tabId: TabId): Layout<D>    // in that tab's group
export function closeAll<D>(l: Layout<D>, groupId: GroupId): Layout<D>
export function moveTab<D>(l: Layout<D>, tabId: TabId, toGroup: GroupId, index: number): Layout<D>  // reorder or across groups; index in the target's list before the move
export function split<D>(l: Layout<D>, groupId: GroupId, dir: 'row' | 'column', side: 'before' | 'after',
  newGroupId: GroupId, tab?: Tab<D>): Layout<D>
// ^ inserts a new group beside `groupId` (a sibling when the parent split has the same dir, else the leaf becomes a
//   split), sharing the group's size half and half; `tab` (new or an existing id: then moved) goes in it, active.
export function join<D>(l: Layout<D>, from: GroupId, into: GroupId): Layout<D>  // tabs appended, `from` removed
export function resize<D>(l: Layout<D>, win: WindowId, path: number[], sizes: number[]): Layout<D>
// ^ `path`: child indexes from the window's root to the split; sizes are fractions, renormalized to sum 1
export function popOut<D>(l: Layout<D>, groupId: GroupId, win: WindowId): Layout<D>  // the group becomes window `win`'s root
export function dock<D>(l: Layout<D>, win: WindowId): Layout<D>
// ^ the window's groups (same ids, tabs, order) go back into MAIN as a split after its root; the window is removed
export function normalize<D>(l: Layout<D>): Layout<D>
// ^ removes empty groups (except MAIN's last group), splits with one child, nests of the same dir; sizes sum 1;
//   tabs in no group dropped; activeGroup valid (falls to MAIN's first group)
export function groupOf<D>(l: Layout<D>, tabId: TabId): GroupId | null
export function windowOf<D>(l: Layout<D>, groupId: GroupId): WindowId | null
export function groupsIn<D>(l: Layout<D>, win: WindowId): GroupId[]   // in reading order
export function allGroups<D>(l: Layout<D>): GroupId[]
```

### `history.ts` (pure): undo and redo

```ts
export type Entry<S> = { label: string; before: S; after: S; key?: string; at: number }
export type History<S> = { past: Entry<S>[]; future: Entry<S>[] }
export function emptyHistory<S>(): History<S>
export type RecordOptions<S> = {
  limit?: number      // default 100; the oldest go
  mergeMs?: number    // default 1500
  // How two snapshots combine when entries merge: `before` keeps the first, `after` the last. Default: a / b.
  merge?: (a: S, b: S, keep: 'first' | 'last') => S
}
export function record<S>(h: History<S>, e: Entry<S>, o?: RecordOptions<S>): History<S>
// ^ clears `future`. Merges into the last entry when both have the same `key` and e.at - last.at <= mergeMs
//   (label stays the first's, `at` becomes e.at).
export function undo<S>(h: History<S>): { history: History<S>; entry: Entry<S> } | null
export function redo<S>(h: History<S>): { history: History<S>; entry: Entry<S> } | null
export function drop<S>(h: History<S>, pred: (e: Entry<S>) => boolean): History<S>  // from past and future
export function seal<S>(h: History<S>): History<S>   // the next record never merges into the current last entry
export const undoLabel: <S>(h: History<S>) => string | null
export const redoLabel: <S>(h: History<S>) => string | null
```

### `selection.ts` (pure): multi-selection over an ordered list of ids

```ts
export type Selection = { ids: string[]; anchor: string | null; focus: string | null }
export const emptySelection: Selection
export function select(s: Selection, id: string, mods: { ctrl?: boolean; shift?: boolean }, order: string[]): Selection
// plain: just id. ctrl: toggle id (anchor = focus = id). shift: anchor..id in `order` (anchor falls back to id).
// ctrl+shift: adds that range to what is selected.
export function step(s: Selection, delta: number, order: string[], mods: { shift?: boolean; ctrl?: boolean }): Selection
// moves focus by delta (clamped). plain: selects just the new focus. shift: anchor..focus. ctrl: moves focus only.
export function selectAll(order: string[]): Selection
export function prune(s: Selection, exists: (id: string) => boolean): Selection
export function ordered(s: Selection, order: string[]): string[]   // the selected ids in `order`'s order
```

### `tree.ts` (pure): a tree flattened to rows, keyboard navigation

```ts
export type TreeSource = { roots: string[]; children(id: string): string[]; label(id: string): string }
export type Row = { id: string; depth: number; parent: string | null; expandable: boolean; expanded: boolean;
  posInSet: number; setSize: number; match: [number, number] | null }
export function flatten(src: TreeSource, expanded: ReadonlySet<string>, filter?: string): Row[]
// filter: case- and accent-insensitive substring of the label; shows matches and their ancestors (ancestors shown
// expanded whatever `expanded` says); `match` is the matched range in the label.
export type Nav = { focus?: string; expand?: string; collapse?: string; activate?: string }
export function keyNav(rows: Row[], focus: string | null, key: string, pageSize?: number): Nav | null
// WAI-ARIA tree: ArrowDown/Up, Home/End, PageDown/Up (pageSize, default 10), ArrowRight (expand, else first child),
// ArrowLeft (collapse, else parent), Enter (activate). null for any other key.
export function pathTo(src: TreeSource, id: string): string[] | null   // ancestors, root first, not including id
export function typeahead(rows: Row[], from: string | null, text: string, label: (id: string) => string): string | null
```

### `dnd.ts`: native HTML5 drag and drop helpers (pure parts testable)

```ts
export const DRAG_MIME = 'application/x-kit-drag+json'
export type DragPayload = { kind: string; ids: string[] }
export function startDrag(dt: DataTransfer, payload: DragPayload, text: string): void
// ^ sets DRAG_MIME (JSON) and text/plain, effectAllowed 'copyMove', and keeps the payload in this module (the drag
//   may end in another of the app's windows: same JavaScript, so the module copy is read first)
export function readDrag(dt: DataTransfer | null): DragPayload | null   // module copy, else DRAG_MIME when readable
export function endDrag(): void
export function effectFor(mods: { ctrlKey: boolean; altKey: boolean; metaKey: boolean }, mac: boolean): 'move' | 'copy'
// copy with Ctrl (Alt/Option on Mac), else move
export function dropPosition(top: number, height: number, y: number, inside: boolean): 'before' | 'inside' | 'after'
// inside allowed: top quarter before, bottom quarter after, the middle inside; else halves
export function edgeZone(rect: { left: number; top: number; width: number; height: number }, x: number, y: number):
  'left' | 'right' | 'top' | 'bottom' | 'center'   // outer quarter of each side, else center
```

### `shortcuts.ts`

```ts
export type Combo = string   // "Mod+S", "Ctrl+Shift+E", "Alt+Shift+ArrowUp", "F2", "Delete"; Mod = Cmd on Mac, Ctrl elsewhere
export function matches(e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean },
  combo: Combo, mac: boolean): boolean   // exact modifiers; letters case-insensitive
export function isEditable(target: EventTarget | null): boolean   // input (text-like), textarea, select, contenteditable; no instanceof
export function comboLabel(combo: Combo, mac: boolean): string   // "Ctrl+Shift+E" or "⌘⇧E"
export const isMac: (platform: string) => boolean
```

### `windows.ts`: the app's windows (main plus popups)

```ts
export function openPopup(id: string, url: string, o: { width: number; height: number; left?: number; top?: number }): Window | null
// ^ call synchronously inside the click; null when the browser blocked it. Features: 'popup,width,height,left,top'.
export function mountPopup(win: Window, o: { title: string }): Promise<HTMLElement>
// ^ waits for the page to load, copies the opener's <link rel=stylesheet>, <style> and <html> attributes (data-theme,
//   lang, class) and keeps them in sync (MutationObserver), sets the title, returns a fresh root element in its body
export function setPopupTitle(win: Window, title: string): void
export function onPopupClosed(win: Window, cb: () => void): () => void
// ^ once, on pagehide (closed or reloaded) or when win.closed turns true (500 ms poll as a fallback)
export function appWindows(): Window[]             // the main window, then open popups
export function activeWindow(): Window             // the app window focused last (main by default)
export function subscribeWindows(cb: () => void): () => void   // popups opened or closed, or focus moved
export function closePopups(): void
export function windowOf(el: Element): Window      // el.ownerDocument.defaultView
```

### Components

```tsx
// Popout.tsx: renders children into a popup window opened by openPopup.
export function Popout(p: { win: Window; title: string; onClosed: () => void; children: ReactNode }): ReactNode

// TabStrip.tsx: one group's tabs. role=tablist; arrows move focus, Enter/Space activate, Delete closes, Shift+F10 or the
// ContextMenu key opens the menu. Middle click closes. Drags with startDrag({ kind: dragKind, ids: [id] }).
export type TabItem = { id: string; title: string; description?: string; tooltip?: string; dirty?: boolean; icon?: ReactNode }
export function TabStrip(p: {
  group: string; tabs: TabItem[]; active: string | null; focused: boolean; dragKind: string
  onActivate(id: string): void; onClose(id: string): void
  onMove(id: string, index: number): void                     // a tab of this strip dropped at index
  onDrop(payload: DragPayload, index: number): void           // anything else accepted by canDrop
  canDrop(payload: DragPayload): boolean
  onContextMenu(id: string, at: { x: number; y: number }): void
  actions?: ReactNode                                         // buttons at the strip's right end
}): ReactNode

// SplitView.tsx: one window's node tree. Sashes: pointer drag (pointer capture), arrows (2% a press) on a focusable
// role=separator, double click makes the sizes equal. Never shrinks a group under minSize.
export function SplitView(p: { root: Node; renderGroup(id: GroupId): ReactNode; onResize(path: number[], sizes: number[]): void;
  minSize?: { width: number; height: number } }): ReactNode
// Overlay on a group while something is dragged over it: highlights the edge or center zone (edgeZone).
export function DropZones(p: { accept(payload: DragPayload): boolean;
  onDrop(payload: DragPayload, zone: 'left' | 'right' | 'top' | 'bottom' | 'center'): void }): ReactNode

// TreeView.tsx: virtualized (fixed rowHeight, renders the rows in view plus a few), roving tabindex, role=tree.
export type DropRule = { ok: true } | { ok: false; reason: string }
export function TreeView(p: {
  label: string; source: TreeSource; rowHeight: number
  expanded: ReadonlySet<string>; onExpanded(next: Set<string>): void
  selection: Selection; onSelection(next: Selection): void
  filter?: string
  icon?(id: string): ReactNode; description?(id: string): string | null; dimmed?(id: string): boolean
  onActivate(id: string): void                                  // Enter or double click
  onContextMenu(target: string | null, at: { x: number; y: number }): void  // null: empty space
  onKeyDown?(e: KeyboardEvent, focus: string | null): boolean    // the host's own keys first; true = handled
  drag?: {
    kind(ids: string[]): string | null                          // null: these can't be dragged
    rule(payload: DragPayload, target: string | null, pos: 'before' | 'inside' | 'after', effect: 'move' | 'copy'): DropRule
    allowInside(target: string): boolean
    onDrop(payload: DragPayload, target: string | null, pos: 'before' | 'inside' | 'after', effect: 'move' | 'copy'): void
    label(payload: DragPayload, effect: 'move' | 'copy'): string  // "Move 3 cards", shown by the cursor
  }
  rename?: { id: string | null; commit(id: string, name: string): void; cancel(): void; check?(id: string, name: string): string | null }
  empty?: ReactNode
}): ReactNode

// ContextMenu.tsx: imperative, so any handler can open one. A top-layer popover in `doc` (default: the document of
// `at.anchor`, else activeWindow()'s), placed at the point (or under the anchor) and kept on screen; arrows, Home/End,
// Enter/Space, ArrowRight/Left for submenus, typeahead, Esc and a click outside close it and give focus back.
export type MenuItem = 'separator' | { label: string; onSelect?: () => void; shortcut?: string; disabled?: boolean;
  reason?: string; danger?: boolean; checked?: boolean; submenu?: MenuItem[] }
export function openMenu(items: MenuItem[], at: { x: number; y: number; doc?: Document } | { anchor: Element }): void
export function closeMenu(): void

// confetti.ts (pure) + Confetti.tsx
export type Particle = { x: number; y: number; vx: number; vy: number; angle: number; spin: number; color: string;
  w: number; h: number; life: number }
export function burst(o: { count: number; x: number; y: number; angle: number; spread: number; speed: number;
  colors: string[]; random: () => number }): Particle[]
export function stepParticles(ps: Particle[], dt: number, o: { gravity: number; drag: number; height: number }): Particle[]
export function Confetti(p: { level: 'done' | 'perfect'; colors: string[] }): ReactNode
// fixed canvas over its own document, pointer-events none, device pixel ratio aware, frames from its own window;
// renders nothing under prefers-reduced-motion
```

## The app

### `src/logic/contentOps.ts` (pure): copying, moving and deleting across open files

```ts
export type DocId = string
export type Docs = Record<DocId, Library>
export type ItemRef =
  | { kind: 'course'; doc: DocId; course: string }
  | { kind: 'quiz'; doc: DocId; course: string; quiz: string }
  | { kind: 'card'; doc: DocId; course: string; quiz: string; card: string }
export type Target =
  | { kind: 'doc'; doc: DocId; index?: number }                                         // courses go here
  | { kind: 'course'; doc: DocId; course: string; index?: number }                      // quizzes go here
  | { kind: 'quiz'; doc: DocId; course: string; quiz: string; index?: number; group?: string | null }  // cards
// index: in the target's list (courses, quizzes, cards) before the operation; default the end.
// group: for cards, undefined = keep each card's group by name (re-created in the target quiz with its color when
// missing); null = no group; an id = that group of the target quiz.
export type Fragment =
  | { kind: 'course'; courses: Course[]; sideTypes: Sides[] }
  | { kind: 'quiz'; quizzes: Quiz[]; sideTypes: Sides[] }
  | { kind: 'card'; cards: { card: Card; group: Group | null }[]; sideTypes: Sides[] }
export function extract(docs: Docs, refs: ItemRef[]): Fragment
// deep copy, in document order whatever the order of refs; throws when refs are of mixed kinds or one is missing.
// sideTypes: the own side types the items' term cards use.
export function canPlace(docs: Docs, refs: ItemRef[], target: Target, effect: 'move' | 'copy'): string | null
// null when allowed, else a plain reason ("A course can't go inside a quiz", "Can't move a course into itself").
// Wrong level, a missing item or target, or moving a quiz into the course it is in at the same place are refused.
export function insert(docs: Docs, fragment: Fragment, target: Target, newId: () => string): { docs: Docs; created: ItemRef[] }
// fresh ids for everything inside (courses, quizzes, groups, cards); a name taken in the target (by slug) gets
// freeName's "Name (2)"; groups and sideTypes carried as above; order kept; throws (nothing changed) when not allowed.
export function remove(docs: Docs, refs: ItemRef[]): Docs
export function move(docs: Docs, refs: ItemRef[], target: Target): { docs: Docs; moved: ItemRef[] }
// keeps ids; within one parent it is a reorder (no rename, index counted before the move); across parents and files,
// names are made free and groups/sideTypes carried; one call, so one history entry; throws when canPlace refuses.
export function exists(docs: Docs, ref: ItemRef): boolean
export function itemName(docs: Docs, ref: ItemRef): string   // a course/quiz name, a card's first text (trimmed)
```

### `src/logic/explorerTree.ts` (pure): the Explorer's tree over the open files

```ts
// Node ids: "d:<doc>", "c:<doc>:<course>", "q:<doc>:<course>:<quiz>", "k:<doc>:<course>:<quiz>:<card>".
export type OpenDoc = { id: DocId; name: string; library: Library }
export function explorerSource(docs: OpenDoc[]): TreeSource      // cards in group order, labels from itemName
export function refOf(nodeId: string): ItemRef | { kind: 'doc'; doc: DocId }
export function nodeOf(ref: ItemRef | { kind: 'doc'; doc: DocId }): string
export function targetFor(docs: Docs, nodeId: string | null, pos: 'before' | 'inside' | 'after', kind: Fragment['kind']): Target | null
// where a drop or paste of `kind` lands relative to a node (inside a quiz: its end; before/after a card: that index in
// its quiz and that card's group; on a file: its end; null node: the last file); null when no place fits
```

### `src/state/useWorkspace.ts`

```ts
export type TabData = { kind: 'doc'; doc: DocId; route: Route } | { kind: 'explorer' } | { kind: 'welcome' }
export type DocMeta = { id: DocId; name: string; where: 'device' | 'drive' | 'browser'; dirty: boolean }
export type Nav = { route: Route; go(r: Route): void; redirect(r: Route): void; goToNew(r: Route, id: string): void; takeCreated(id: string): boolean }
export type WorkspaceApi = {
  ready: boolean
  docs: DocMeta[]
  doc(id: DocId): LibraryApi          // the same shape as today's LibraryApi (plus replace, save, close); memoized per doc
  layout: Layout<TabData>
  // layout actions (openTab, closeTabs, split, moveTab, join, resize, popOut, dock, activate...) wrap kit/layout
  apply(label: string, update: (docs: Docs) => Docs, key?: string): void   // the one content write path
  undo(): void; redo(): void; undoLabel: string | null; redoLabel: string | null
  clipboard: { mode: 'copy' | 'cut'; refs: ItemRef[]; fragment: Fragment } | null
  copy(refs: ItemRef[]): void; cut(refs: ItemRef[]): void; paste(target: Target): void
  newDoc(): DocId; openFile(): Promise<DocId | null>; saveAll(): Promise<void>; closeDoc(id: DocId): Promise<boolean>
  explorer: { expanded: string[]; selection: Selection }
}
```
