# Modules and their contracts

The signatures below were the contract the code was built to. They have been brought in line with what was built; a line
marked "Built:" says where the code goes further than, or differs from, the original contract. Detailed per-module pages
for the kit are in `docs/kit/`.
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

`src/kit/longPress.ts` is a kit file too: `createLongPress(onPress: (x, y) => void)` returns `{ fired, down, move, end, cancel }`,
a touch or pen long press (500 ms, cancelled by moving over 8 px; `onPress` runs 80 ms after the finger lifts) as the stand-in
for a right click. `TabStrip` and `TreeView` use it (a long press calls their `onContextMenu`; the click and drag after it
are ignored while `fired`), and `ContextMenu` picks an item by click only when a pointer went down inside the menu, so the
lifting finger picks nothing. See `docs/kit/longpress.md`.

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
Built: operations on unknown ids return the input object. `split` also returns it when `newGroupId` exists; `join` when
`from === into`; `popOut` refuses `MAIN` as target, a window id in use and the only group of `MAIN`; `moveTab` inside one
group does not normalize. `allGroups` lists `MAIN`'s groups first.

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
// Built: `undo` and `redo` return a sealed history, so typing after an undo starts a new step.
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
// Built: only ancestors with a kept child open. A row that matches but has no matching child shows no children and is
// not `expandable`. A filter of spaces is a filter; `match` is the first occurrence only.
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
// Built: the DRAG_MIME copy is validated (`kind` a string, `ids` an array; ids converted to strings), else null.
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
// ^ waits for the page to load (rejects with an Error if it was closed first), copies the opener's <link rel=stylesheet>,
//   <style> and <html> attributes (data-theme, lang, class, style: Built: `style` too) and keeps them in sync (MutationObserver), sets the title, returns a fresh root element in its body
export function setPopupTitle(win: Window, title: string): void
export function onPopupClosed(win: Window, cb: () => void): () => void
// ^ once, on pagehide (closed or reloaded) or when win.closed turns true (500 ms poll as a fallback)
export function appWindows(): Window[]             // the main window, then open popups
export function activeWindow(): Window             // the app window focused last (main by default)
export function subscribeWindows(cb: () => void): () => void   // popups opened or closed, or focus moved
export function closePopups(): void
// ^ Built: also runs on the main window's pagehide. `openPopup` uses `id` as the window name, so an id still open is reused.
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
// Built: also Home/End; roving tabindex; a long press opens the menu on touch; dropEffect is always 'move'; a drop of this
// strip's own single tab calls onMove, anything else accepted calls onDrop.

// SplitView.tsx: one window's node tree. Sashes: pointer drag (pointer capture), arrows (2% a press) on a focusable
// role=separator, double click makes the sizes equal. Built: a sash moves the two panes beside it and keeps both above
// minSize where the room allows (default 320 x 240; the sash gap is 4px); minSize is only enforced while resizing, and
// onResize is called at most once per frame while dragging, then once on release.
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
// Built: also Space (toggle the focused row), Ctrl+A (select all), ContextMenu and Shift+F10, type-ahead (700 ms buffer);
// a collapsed folder under a drag opens after 600 ms; the tree scrolls within 28px of its top or bottom edge during a
// drag; 8 rows are rendered beyond the view; the container needs a definite height (600px assumed until measured);
// rename: Enter commits, Esc cancels, leaving the field commits unless `check` returns a message (then it cancels);
// the selection is not pruned (the host calls selection.prune). Rows must be exactly `rowHeight` tall.

// ContextMenu.tsx: imperative, so any handler can open one. A top-layer popover in `doc` (default: the document of
// `at.anchor`, else Built: the global `document`: pass `doc` for a click in a popup), placed at the point (or under the anchor) and kept on screen; arrows, Home/End,
// Enter/Space, ArrowRight/Left for submenus, typeahead, Esc and a click outside close it and give focus back.
export type MenuItem = 'separator' | { label: string; onSelect?: () => void; shortcut?: string; disabled?: boolean;
  reason?: string; danger?: boolean; checked?: boolean; submenu?: MenuItem[] }
export function openMenu(items: MenuItem[], at: { x: number; y: number; doc?: Document } | { anchor: Element }): void
export function closeMenu(): void

// confettiMath.ts (pure; not confetti.ts, which clashes with Confetti.tsx on Windows) + Confetti.tsx
export type Particle = { x: number; y: number; vx: number; vy: number; angle: number; spin: number; color: string;
  w: number; h: number; life: number }
export function burst(o: { count: number; x: number; y: number; angle: number; spread: number; speed: number;
  colors: string[]; random: () => number; life?: number }): Particle[]   // Built: life (seconds, default 1) was added
export function stepParticles(ps: Particle[], dt: number, o: { gravity: number; drag: number; height: number }): Particle[]
export function Confetti(p: { level: 'done' | 'perfect'; colors: string[] }): ReactNode
// fixed canvas over its own document, pointer-events none, device pixel ratio aware, frames from its own window;
// renders nothing under prefers-reduced-motion
// Built: 'done' is one burst of 40 from the top centre (about 1.2 s), 'perfect' four bursts from the bottom corners (about
// 2.5 s). The effect restarts when `level` or the identity of `colors` changes (pass a stable array); after it ends the
// component stays mounted and renders nothing. The canvas is sized once, when it starts.
```

## The app

Everything below runs: `App` renders the `Workbench` (tabs, split panes, popped-out windows), the Explorer tab and the Sidebar
beside it (there is no top bar; see `integration.md`). `#/_workbench` is a demo host that uses only the kit.

### `src/logic/contentOps.ts` (pure): copying, moving and deleting across open files

Built as contracted. Types: `DocId`, `Docs = Record<DocId, Library>`, `ItemRef` (course, quiz or card, each with `doc`),
`Target` (`doc` | `course` | `quiz`, each with an optional `index`; a quiz target also an optional `group`), `Fragment`
(courses, quizzes or cards with the own side types they use). Functions:

```ts
export function extract(docs: Docs, refs: ItemRef[]): Fragment      // deep copies in document order; throws on mixed kinds or a missing item
export function canPlace(docs: Docs, refs: ItemRef[], target: Target, effect: 'move' | 'copy'): string | null   // null, or a plain reason
export function insert(docs: Docs, fragment: Fragment, target: Target, newId: () => string): { docs: Docs; created: ItemRef[] }
export function remove(docs: Docs, refs: ItemRef[]): Docs           // throws when an item is missing
export function move(docs: Docs, refs: ItemRef[], target: Target): { docs: Docs; moved: ItemRef[] }   // keeps ids; throws when canPlace refuses
export function exists(docs: Docs, ref: ItemRef): boolean
export function itemName(docs: Docs, ref: ItemRef): string          // a course or quiz name, a card's first text; "Empty card" when it has none
```

Built: `move` keeps ids, except an id the target file already uses (a move from a file with the same ids, such as two copies of
one backup) gets a new one, so ids never repeat within a file; a group moved with a card from another quiz gets a new id.
`insert` and `move` give a taken name (by slug) the next free "Name (2)", carry groups (re-created with their color when
missing) and own side types, and throw before changing anything when not allowed.

### `src/logic/explorerTree.ts` (pure): the Explorer's tree over the open files

```ts
// Node ids: "d:<doc>", "c:<doc>:<course>", "q:<doc>:<course>:<quiz>", "k:<doc>:<course>:<quiz>:<card>".
export type OpenDoc = { id: DocId; name: string; library: Library; driveId?: string | null }   // driveId: the Drive file it is
export function explorerSource(open: OpenDoc[], drive?: DriveListing): TreeSource   // files, courses, quizzes, cards (as stored, so in group order); file labels are the names; with `drive`, a Google Drive root after the files
export function refOf(nodeId: string): ItemRef | { kind: 'doc'; doc: DocId }   // throws on an unknown id
export function nodeOf(ref: ItemRef | { kind: 'doc'; doc: DocId }): string
export function targetFor(docs: Docs, nodeId: string | null, pos: 'before' | 'inside' | 'after', kind: Fragment['kind']): Target | null
```

Google Drive in the tree (`explorerTree.ts`): there is no Drive root. The user's Google Drive libraries that are not open
are roots among the open files, in one list sorted by name (`Intl.Collator`, ignoring case and accents, "2" before "10"; the
sort is stable, so equal names keep the open files first). An open library is already a root (its place says it is on
Drive), so the list never shows it twice. Node ids: `g:f:<drive file id>` (a closed library) and `g:w:<drive file id>`
(its one placeholder child, "Opening...", so its row can be expanded). Exports: `DriveFileInfo` (`{ id, name, modified }`),
`DriveListing` (`{ signedIn, loading, failed, files: DriveFileInfo[] | null }`), `DriveNode` (`{ kind: 'file' | 'wait'; id }`),
`driveNodeOf`, `parseDriveNode(nodeId): DriveNode | null` and `closedDriveFiles(listing, open)` (the listed libraries that are
not open; none when signed out or not listed yet). `explorerSource(open, drive?)` builds the roots from both.

`targetFor` (Built, more than the one-line contract): inside a quiz is its end with no group; before or after a card is
that place in its quiz and that card's group; before or after a quiz or course is that place in its parent; on a file
(any position) or no node (the last file) is the end of its courses. A kind that cannot go at the node walks up to the
nearest parent that takes it, after the child it came from (before it for "before"). `null` when none does or the node
does not exist.

### `src/logic/explorerActions.ts` (pure): what the Explorer lets the user do, as data

The decisions behind `src/layout/Explorer.tsx`; the component only carries them out. `NodeKind` also names the Drive nodes:
`'drivefile'` and `` `drive:${'root' | 'signin' | 'loading' | 'failed' | 'pick'}` ``. Exports:

```ts
export type ItemKind = ItemRef['kind']; export type NodeKind = ItemKind | 'doc'; export type DocRef = { kind: 'doc'; doc: DocId }
export type Clip = { mode: 'copy' | 'cut'; refs: ItemRef[] }
export const kindCount: (kind: ItemKind, n: number) => string                     // "1 card", "3 quizzes"
export function parseNode(id: string): ItemRef | DocRef | null                    // null for an id that is not a node
export function selectionKind(ids: string[]): NodeKind | 'mixed' | null
export const itemRefs: (ids: string[]) => ItemRef[]; export const docIds: (ids: string[]) => DocId[]
export const cardDescription: (card: Card) => string                              // a term card's side names, else its kind
export function describeNode(docs, meta: Record<DocId, { where: string; dirty: boolean }>, node: string): string | null
export const whereIcon: (where: string) => 'cloud' | 'browser' | 'file'
export function pasteTarget(docs: Docs, clipboard: Clip | null, node: string | null): { target: Target } | { reason: string }
export type Action; export type Item; export type Entry = 'separator' | Item; export type MenuContext = { docs; names; clipboard; mac }
export function menuFor(ctx: MenuContext, ids: string[], at: string | null): Entry[]    // the context menu per kind of selection, with disabled reasons
export function keyDecision(ctx: MenuContext, e: KeyEvent, ids: string[], at: string | null): { action: Action } | { refuse: string } | null   // Mod+C, Mod+X, Mod+V, Delete, F2
export function addCourse(docs, doc, id): { docs: Docs; ref: ItemRef } | null   // also addQuiz(docs, doc, course, id), addCard(docs, doc, course, quiz, id)
export function renameProblem(docs, ref, name): string | undefined; export function renameItem(docs, ref, name): Docs | null
export type DeletePlan; export function deletePlan(docs, ids, mac): DeletePlan | { reason: string }
export function removeItems(docs, refs): { ok: true; docs: Docs } | { ok: false; reason: string }
export type Plan = { ok: true; docs: Docs; label: string; created: ItemRef[] } | { ok: false; reason: string }
export const dragLabel, dragKind, allowInside; export function dropTarget, dropRule, placeItems, dropPlan
export type Destination; export function moveDestinations, ancestorNodes
```

Functions return a result instead of throwing (a refusal is a `reason`). Files cannot be dragged or deleted from the tree
(close them instead).

Google Drive in `explorerActions`: `NodeKind` also has `'drivefile'`; `Action` has `driveOpen` and `driveRemove`;
`describeNode(docs, meta, node, drive?)` takes an optional `{ listing }`. A row's muted text is its state and place: "Open ·
On this device" (or "Open · Unsaved · ..."), "Open · Only in this browser", "Open · Your Google Drive", and for a library that
is not open "Not open · Your Google Drive". A Drive library's menu has Open, a disabled Paste ("Open the library first.") and
Move to bin (Delete). Refusals: pasting or dropping on a Drive library says "Open the library first."; deleting one from the
tree says "Move a Google Drive library to the bin from its own menu."; nothing can be dropped inside it (`allowInside`).
`keyDecision` maps Delete on a Drive library to `driveRemove`. Sign in, Refresh and Choose files are buttons of the Explorer
itself, not menu actions.

### `src/logic/workbenchActions.ts` (pure): what the Workbench shows and does, as data

For `src/layout/Workbench.tsx`.

```ts
export type TabData; export type WorkbenchDoc = { name: string; dirty: boolean; library: Library }; export type Docs = Record<string, WorkbenchDoc>
export const MIN_PANE = { width: 320, height: 240 }; export const KEPT_ALIVE = 7   // hidden tabs kept mounted besides the shown one
export function tabTitle(tab, docs): string; export function tabDescription(tab, docs): string | undefined; export function copyPathText(tab, docs): string | null
export function tabDirty(tab, docs): boolean; export function tabTooltip(tab, docs): string
export function mountedTabs(g: Group): Set<string>      // the shown tab and the most recent hidden ones, in tab order
export function canSplit(size: { width: number; height: number }, dir: 'row' | 'column'): boolean   // both halves stay at least MIN_PANE
export type GroupContext; export type MenuAction; export type MenuEntry
export function tabMenu(tab, docs, g: GroupContext, mac: boolean): MenuEntry[]; export function groupMenu(g: GroupContext): MenuEntry[]
```

`TabData` is declared here (`doc`, `explorer`, `changelog`) and re-exported by `state/workspace.ts`. The file imports `resolve`
from `src/route.ts`.

### `src/logic/routes.ts` (pure) and `src/route.ts`

`logic/routes.ts` holds the routes as data: `Route`, `parseHash`, `href`, `resolve(library, route)` (the course and quiz a
route names, and which is `missing`), `Place`, `sameIds`, `Nav`, `Found` and `followRename`. `src/route.ts` re-exports them
and adds what needs the browser: `go`, `goToNew`, `takeCreated`, `redirect`, `useRoute`, `usePlace` and
`usePlaceFor(library, route, onRouteChange)` (follows renames for a route that belongs to a tab). Logic and state import
the pure file.

### `src/logic/tabNav.ts` (pure) and `src/layout/tabNav.ts`: a tab's navigation

```ts
// logic/tabNav.ts
export type TabNavEffects = { setRoute(route: Route): void; syncAddress(route: Route, mode: 'push' | 'replace'): void }
export type Created = { get(): string | undefined; set(id: string | undefined): void }
export function buildTabNav(route: Route, fx: TabNavEffects, created: Created): Nav
// layout/tabNav.ts
export type TabNavOps = { setRoute(tabId: string, route: Route): void; ownsAddress(tabId: string): boolean }
export function makeTabNav(tabId: string, route: Route, ops: TabNavOps): Nav   // pushes or replaces a history entry ({ tab }) only for the tab that owns the address bar
```

`Nav` is declared in `src/logic/routes.ts` (re-exported by `src/route.ts`): `{ route; go(r); redirect(r); goToNew(id, r);
takeCreated(id): boolean }` (id first). Every screen takes its tab's `nav` (required). `route.ts` keeps only the hooks:
`usePlaceFor` (a tab's place, following renames) and `useRoute`.

### `src/state/workspace.ts` (pure): the workspace and its transitions (run by `useWorkspace`)

```ts
export type TabData = { kind: 'doc'; doc: DocId; route: Route } | { kind: 'explorer' } | { kind: 'changelog' }   // declared in logic/workbenchActions, re-exported here
export type Doc = { id; library; saved: Library | null; name; file: FileRef | null; drive: DriveSource | null; replaced: number; newer: boolean }
export type Workspace = { docs: Record<DocId, Doc>; order: DocId[]; layout: Layout<TabData>; history: History<Snap>;
  clipboard: Clipboard | null; explorer: Explorer; recent: TabId[] }   // recent: tabs, the one active last first, across groups and windows
export type Snap = Record<DocId, Library>; export type Clipboard = { mode: 'copy' | 'cut'; refs: ItemRef[]; fragment: Fragment }
export type Explorer = { expanded: string[]; selection: Selection }
```

A document has unsaved changes when `library !== saved` (`hasChanges`). Transitions take a `Workspace`, return a new
one, and read no clock or random source (times and new ids are arguments; `useWorkspace` makes the ids before it runs one):

- Documents: `emptyWorkspace`, `makeDoc`, `docName`, `where`, `freeDocName`, `libraries`.
- Layout (a file may show in several tabs, each with its own page; closing tabs never closes a file): `activeTab`,
  `activeDoc` (the active tab's file, else the file of the tab active last), `addressTab` (the main window's active tab, which
  the address bar follows), `tabsOf`, `addDoc`, `openingGroup` (the group a file opens in when none is named: the active one, unless it shows the Explorer,
  which stays in view; then the group used last besides it), `activateDoc`, `openPlace(w, doc, route, tabId, { group?, newTab?,
  background? })` (a place of a file in a group, by default the one it opens in: in that group's tab of the file unless `newTab`), `setTabRoute`,
  `activateTab`, `activateGroup`, `closeTabs`, `closeOthers`, `closeAll`, `moveTab`, `joinGroups`, `resizeSplit`,
  `dockWindow`, `splitGroup` (a new group beside one; a dragged tab moves into it, else a copy of a file's tab; the
  Explorer is never copied), `popOutGroup` (the main window's only group first gets an empty group beside it, so the main
  window never ends up with nothing), `popOutTab` (one tab into a new window in a group of its own, the rest of its group
  staying; a lone tab takes its group, as `popOutGroup`), `explorerTab`, `isShown`, `showChangelog(w, group, tabId)` (every release's notes in a tab, one at most: activated where it is, else a new tab in the group), `followHistory`, `showExplorer` (one Explorer at most: activated where it
  shows, else split on the left of a group, else a tab), `recentGroup`.
- Back and Forward: `followHistory(w, tabId, route)`. A history entry names its tab (`history.state.tab`); that tab, wherever it
  is now (any group or window), becomes active on the entry's page. With no such tab (a typed address) the main window's
  tab takes the page only when its file has it (`resolve` finds no `missing`); otherwise nothing changes.
- Content: `applyEdit(w, label, update, at, key?)` is the one write path; it records only the documents that changed and
  merges entries of the same key within 1.5 s. `undoEdit` and `redoEdit` return `{ workspace, entry }` or null. `lastStep(w)`
  is the step undo would undo and `undoStep(w, step)` undoes that step only while it is still the last (a toast's Undo): null
  once anything came after it. `forget(history, id)` takes a document out of the history (it closed, or was replaced from
  outside): its own entries go; an entry that also changed another document (a move between files) cannot be undone in half,
  so it goes with every step beyond it (older ones in the past, those redone after it in the future). `patchDoc`,
  `replaceDoc` (the whole library replaced from outside: saved as it comes, `replaced` counted, then `forget`), `takeRecord(w,
  rec, handle)` (another tab wrote the document; `handle` is the file handle stored with it now, so the stored handle is
  never forgotten here), `markSaved`, `closeDoc` (its tabs and history go; a cut from it becomes a copy),
  `readyToClose(dirty, ask, save)` (async: with unsaved changes asks Save, Don't save or Cancel and saves; changes made while it
  saved are asked about again; false when the document stays open), `followRenames(w, doc, before)` (every tab of the document,
  shown or not, takes the new name of a renamed course or quiz, found again by id; a page whose course or quiz is gone keeps its
  route), `dropDraft(w, id, draft: Course)` (a draft course is dropped as if never made only while the library still holds that
  very course object: never renamed, given a quiz, pasted or moved into, anywhere; otherwise it stays).
- Clipboard: `toClipboard`, `paste` (a cut moves when its items still exist, else the copy goes in with new ids; throws
  the reason when refused).
- Files: `changedOnDisk`, `reopenFile`, `docWithDrive`.
- Persistence: `docRecord`, `workspaceRecord`, `readRoute`, `defaultLayout` (one group, a tab per document),
  `readLayout`, `readExplorer`, `restore`. `readLayout` checks a stored layout: tabs of documents no longer open go, at most
  one Explorer and one changelog tab stay, popped-out groups come back docked, a file may have no tab, and anything malformed gives the default
  layout.

### `src/state/useWorkspace.ts`

`useWorkspace(adapter, notify, ask, askChoice)`. `adapter` (`StorageAdapter`) is the one seam
for files: the hook calls nothing else for opening, saving in place, saving as, downloading and comparing files. `Notify` is
declared in `logic/pushToast` and `Choice` in `model.ts`, so the state layer imports no component.

```ts
export type DocMeta = { id: DocId; name: string; where: 'device' | 'drive' | 'browser'; dirty: boolean }
export type WorkspaceApi = {
  ready: boolean                                   // the browser backup has been read; App renders nothing before
  docs: DocMeta[]                                  // open documents, in the sidebar's order
  active: DocId | null                             // the active tab's file, else the file of the tab active last
  doc(id: DocId): LibraryApi                       // one document's API; the same object until it (or the sign-in) changes
  layout: Layout<TabData>
  address: DocTab | null                           // the main window's active tab when it shows a file: the address bar follows it
  recent: TabId[]                                  // tabs, the one active most recently first
  activate(id: DocId): void                        // shows a file: its tab in the active group, else its tab used last, else a new tab on its home
  openPlace(doc, route, o?: { group?, newTab?, background? }): TabId | null
  setTabRoute(tabId, route): void
  activateTab(tabId): void; activateGroup(groupId): void
  closeTabs(tabIds): void; closeOthers(tabId): void; closeAll(groupId): void
  moveTab(tabId, toGroup, index): void
  split(groupId, dir, side, tabId?, move?): void; join(from, into): void; resize(win, path, sizes): void
  popOut(groupId, win): void; popOutTab(tabId, win): void; dock(win): void   // the caller opens the popup, in the click
  showExplorer(beside: GroupId, split: boolean): void
  showChangelog(group?: GroupId): void             // every release's notes in a tab (one at most)
  followHistory(tabId: TabId | null, route: Route): boolean   // Back, forward or a typed address; true when something changed
  recentGroup(except: GroupId | null): GroupId | null
  apply(label: string, update: (docs: Docs) => Docs, key?: string): void   // the one content write path
  undo(): void; redo(): void; undoLabel: string | null; redoLabel: string | null
  undoLater(): () => void                          // call right after a change: the function it returns undoes that step later (a toast's Undo), only while it is still the last
  clipboard: Clipboard | null
  copy(refs: ItemRef[]): void; cut(refs: ItemRef[]): void; paste(target: Target): void
  newDoc(at?: Route): DocId
  openFile(at?: Route): Promise<DocId | null>
  openLibrary(load: () => Promise<Library>, name: string, at?: Route): Promise<DocId | null>
  openDrive(id: string, own?: boolean): Promise<boolean>
  saveAll(): Promise<void>
  closeDoc(id: DocId): Promise<boolean>
  explorer: Explorer; setExplorer(explorer: Explorer): void
  drive: DriveApi                                  // Google Drive with no document behind it (sign in, list, picker)
  loadLabel: string; loadHint: string
}
```

`LibraryApi` (one document; what screens use) has: `ready`, `id`, `name`, `library`, `replaced`, `hasChanges`,
`loadLabel`, `saveLabel`, `loadHint`, `saveHint`, `findCourse`, `findQuiz`, `addCourse` (a draft until anything changes it, here or in the Explorer), `leaveCourse` (drops an untouched draft), `renameCourse`,
`deleteCourse`, `addQuiz`, `renameQuiz`, `deleteQuiz`, `setCards`, `addSideType`, `renameSideType`, `deleteSideType`,
`updateCard`, `replace`, `save`, `download`, `close`, `file`, `fileName` and `drive: DriveApi` (`setUp`, `file`,
`signedIn`, `yours`, `newer`, `savesInto`, `signOut`, `account`, `prepare`, `signIn`, `canSave`, `open`, `refresh`,
`pull`, `save`, `saveCopy`, `saveNew`, `share`, `list`, `remove`, `pick`).

Content edits go through `apply`, which marks every document it changed as unsaved and schedules that document's browser
backup 300 ms later. The workspace's own record (open documents, layout, Explorer, names) is written the same way, and what
waits is flushed on `pagehide` and when the page is hidden. The hook no longer takes an `onSwitch` callback: the address
bar follows `address` (see `integration.md`).

### `src/layout/`: Explorer, ExplorerPane, Workbench, PaneHead, PaneScreen, Sidebar

- `Explorer(p: ExplorerProps)`: every file as a tree, driven only by its props. The roots are one list, sorted by name: the open
  files and the Google Drive libraries that are not open. Props: `docs: ExplorerDoc[]` (`{ id, name, library, dirty, where,
  driveId? }`), `drive?: ExplorerDrive`, `expanded`, `onExpanded`, `selection`, `onSelection`, `clipboard`, `apply(label,
  update)`, `undoLater?(): () => void` (called right after a delete: gives back the way to undo that step, offered on the toast
  only while it is still the latest), `copy`, `cut`, `paste`, `notify`, `ask`, `open(node)`, `edit(ref)`, `newDoc`, `openFile`,
  `saveDoc`, `downloadDoc`, `closeDoc`, `reveal: string | null` and `onRevealed`. It renders a `TreeView` (row height 32, 44 on
  touch), opens `ContextMenu`s from `explorerActions.menuFor`, and runs every change through `apply`. Each row's muted text
  says "Open" or "Not open" and where it lives (`describeNode`).
  `ExplorerDrive` is `{ setUp, listing: DriveListing, signIn(), pick(), refresh(), open(id), remove(file) }`: the host does the
  listing and the calls; with `setUp` false nothing about Drive shows. Signed out, a "Sign in with Google to see your Google
  Drive libraries" row sits under the tree; signed in, a Refresh button joins Collapse all in the head, and under the tree a
  "Don't see a file? Choose files in Google Drive" link, or "Loading your Google Drive..." while it lists, or "Couldn't load
  your Google Drive." with Retry. Enter or expanding a closed Drive library opens it as a file (a root of its own). The
  selection is pruned against the open files' nodes and the Drive libraries currently listed.
- `Workbench(p: WorkbenchProps)`: the main window's `SplitView` of groups (each a `TabStrip`, a `PaneHead` and the tabs'
  screens, hidden ones kept mounted per `mountedTabs`) and a `Popout` for each other window of the layout. Props:
  `layout`, `docs: Record<string, WorkbenchDoc>`, `popups: Record<WindowId, Window>`, `renderTab(tab, shown)`,
  `crumbs(tab)`, `onCrumb(tabId, route)`, `canPopOut` and `on`: `activate`, `activateGroup`, `close`, `closeOthers`,
  `closeAll`, `move`, `split`, `join`, `resize`, `popOut(groupId, tabId?)` (the group, or only that tab; the host calls `openPopup` synchronously inside it), `dock`,
  `saveDoc`, `saveAll`, `revealInExplorer`, `copyText`. Each tab's screen is rendered through a portal into a node of its own
  (one per tab and window, `wb-tab-node`) that its group's slot adopts. A tab moved to another group in the same window keeps
  its screen and its state (a study round goes on); only the node moves. Moved to another window it starts afresh there, as
  what it measured and listened to belonged to the old window. Nodes of tabs no longer shown anywhere are let go.
- `ExplorerPane(p: { ws: WorkspaceApi; notify; ask; openNode; editNode; reveal; onRevealed })`: the glue from the workspace to
  `Explorer`. It builds `ExplorerDoc[]` from `ws.docs` and `ws.doc(id)` (the `where` text from `whereLine`), keeps that array
  the same object while nothing in it changed (the tree rebuilds on a new one), turns `ws.explorer` (`expanded` as a
  `string[]`) into the set `Explorer` wants, composes several changes in one event, and wires `apply`, `undoLater`, `copy`,
  `cut`, `paste`, `newDoc`, `openFile`, and each file's save, download and close to the workspace. `Explorer` also takes an
  optional `undoLater()` (`ws.undoLater`), whose Undo action on the toast of a drop, paste or delete undoes only that step. Google Drive in `ExplorerPane`: it lists
the libraries with `ws.drive.list()` on mount, when the sign-in changes, and after an open, save (unsaved to saved), save
under a new file, choose (`pick`) or remove (the refresh key is the sign-in state plus each open file's id, Drive id, name
and unsaved mark). It never asks Google for a token without a click: signed in with a token that has run out and nothing
listed yet, the Explorer shows the sign-in button until the user clicks it (`hasFreshToken`). A listing that arrives after a newer
one was started is dropped. An open from the list becomes an open file: expanded and selected.
- `EmptyPane({ docs, onExplorer, onNewFile, onOpenFile, onOpenDoc })`: what a group with no tab shows (`Workbench`'s
  `renderEmpty(groupId)`; the default is a plain "No tab open"). A large faded shrimp as a watermark, the quiet title "No tab
  open", then actions: Show the Explorer (with its shortcut), New file, Open file, and under "Open files" one button per open file
  (`DocMeta[]`, an icon for where it lives) that opens that file's home in this group (`ws.openPlace(id, home, { group })`).
- `PaneHead({ crumbs, onCrumb })`: a compact, plain row of breadcrumbs above the pane's page, with no frosted glass or fade;
  `Crumb = { label; route?; icon? }` (`icon`: the root crumb's mark, where its file lives or the app's shrimp). A plain click goes through the pane's own tab (`onCrumb`); Ctrl, Shift, Alt or another button is
  left to the browser. In a narrow pane (below 480px of the pane's own width, not the window's: `workbench.css`) the trail gives
  way to one "‹ <parent>" link, when the page has a parent. `App.crumbs(tab)` builds the trail: the file first (under its name
  as it is now, with its where-icon; on its home followed by the page's own name, so a home reads file › "Your courses"), then the course and quiz the tab's page names, followed by id through a rename (`followRename`); a page that
  is gone shows the file alone; none for a study session or the Explorer (each has a head of its own, the same height); a
  changelog tab is the shrimp's "Shrimply Study" › "All releases".
- `PaneScreen(p: { tab; group; shown; active; s: PaneShared })`: one tab's screen. An Explorer tab renders `ExplorerPane`; a
  changelog tab renders `ChangelogScreen` (its way back closes the tab); a tab whose file is gone renders nothing; a file tab renders `DocPane`: its own `Nav`
  from `makeTabNav`, `usePlaceFor` for the course and quiz its route names (a deleted one leads to the nearest page with a
  note, quiet when the library was just replaced), its own scroll position in the pane's `.pane-body`, and links to pages
  of its file (`#/...`) followed in the tab, or in a new tab beside it with Ctrl or the middle button. It then renders the
  `Course`, `Quiz`, `Edit`, `Study` or `Home` screen. A study session fills the pane (`pane-session`); `active` says whether
  its keys work. `PaneShared` is what `App` hands every tab (`ws`, `notify`, `ask`, `navOps`, the study options, the
  collapsed groups, the tips state, the welcome state, open and new actions, the Explorer's `openNode`, `editNode`,
  `reveal` and `openCard`).
- `Sidebar` (`{ ws, lib, current, open, setOpen, theme, setTheme, onDrive, onNewCourse, onExplorer, onOpen }`): the open
  files from `ws.docs`, the course tree of the active file (`onOpen(route, newTab)` shows a page in the active group), the
  Explorer button, "+ New course" and the theme select. The brand (`onHome`) opens the active file's home: its home tab in the main window if one exists, else a new tab in the active
  group; with no file open it is the plain link home (the welcome page). Under the brand a "Files" heading carries the file actions that a
  top bar used to hold: New file, Open file, Google Drive and Save all (greyed out with nothing to save).
- `App` composes them: the shell is the `Sidebar` and a `wb-cell` holding the `Workbench`, which starts at the top of the window (hidden on the debug page
  and the welcome page). A study session alone in the main window keeps the full-screen look. The kit demo is a full-screen page outside the
  shell. In the main window the group at the top-left corner has a tab strip that makes room for the sidebar's corner while the
  sidebar is closed (`is-corner`).

### `src/logic/toastLift.ts` (pure) and `Toasts`

`toastLift(viewH, height, edge, gap, controls: Span[]): number`: how far (px) the toast stack rises from its corner so it covers
none of `controls` (`Span = { top; bottom }`, window px). The stack is `height` tall with its bottom `edge` above the window's
bottom and keeps `gap` from every control; the lowest clear spot wins; with no clear spot (a short window), the one that covers
the fewest controls. `components/Toasts` measures the controls of a study question and its feedback sheet under the stack's
column (not the flip card, not the results list) and sets `--toasts-lift`, again whenever the page changes, and never while the
stack is pointed at or focused. `Notify` (`(kind, text, ms?, action?) => void`) is declared in `logic/pushToast`; `Toasts`
re-exports it. `askChoice` (ConfirmDialog) resolves null when its window goes away (a popped-out pane's popup closed).

### `src/logic/whereLine.ts` (pure)

`whereLine(f: { hasFile: boolean; drive: { shared: boolean; trashed: boolean } | null; yours: boolean; signedIn: boolean }): string`:
where an open file lives, in words: "On this device", "Only in this browser", or for a Drive file "Your Google Drive" (needs
a sign-in and Google's word), "Someone else's Google Drive" (signed in, not yours), "Shared on Google Drive" or "On Google
Drive" (signed out: nobody can tell), plus ", in the bin" when it is trashed. Used by `ExplorerPane`.

### `src/screens/edit/EditorCard.tsx`, `SortableCard.tsx` (mounted)

- `EditorCard` (`memo`): one card of the editor's list. Props: `card`, `index`, `groups`, `lib`, `flagged`, `nudge`, and
  `actions: RefObject<CardActions>`. `CardActions` is `{ patch(id, patch), remove(id), move(card, group), advance(card),
  shift(card, by) }`. `EditScreen` keeps the latest of these in a ref and gives each card a stand-in for the library, so a
  card's props stay the same until it changes itself: typing in one card or moving one re-renders only the cards whose own
  props changed, not all of a 2000-card quiz. It renders `EditCard` with `editor.sortable` from `useSortableCard`.
- `SortableCard.tsx`: `CardSortables` (the dnd-kit context and list, cards move up and down only, with screen reader
  announcements by card number), `SectionSortable`, and `useSortableCard(id, n): CardSortable`.

### `src/storage/StorageAdapter.ts`: the one seam for files

```ts
export type FileRef = { name: string; handle: FileSystemFileHandle | null; size: number; modified: number }   // handle null where the browser can't write back (Firefox, Safari)
export type Opened = { ok: true; library: Library; file: FileRef } | { ok: false; name: string; error: string }
export type SaveResult = { status: 'saved'; file: FileRef } | { status: 'changed'; modified: number } | { status: 'denied' } | { status: 'error'; message: string }
export type StorageAdapter = {
  loadLabel: string; saveLabel: string; loadHint: string; saveHint: string
  openFiles(): Promise<Opened[] | null>        // null when nothing was picked; a file that can't be read is reported in its place, never thrown
  saveInPlace(handle, library, expected: number | null, force?: boolean): Promise<SaveResult>   // 'changed' when the file has another modified time than `expected`, unless `force`
  saveAs(library, suggestedName?): Promise<FileRef | null>   // the picked file, kept with a handle where the browser allows, else a download; null when cancelled
  download(library, name?): Promise<string | null>           // a copy as a file; never ties the library to it
  sameFile(a: FileRef, b: FileRef): Promise<boolean>
}
```

`fileStorage` implements it (the file picker, File System Access where available, else a download); `useWorkspace` calls
nothing else for files. A new backend is a new adapter. The old `load()` / `save()` pair is gone, and so is the single-backup
API of `browserBackup` (`readBackup`, `writeBackup`, `onBackupWritten`, `Backup`) and its BroadcastChannel; the workspace's own
channel (`shrimply-workspace`) remains.

### `src/storage/` additions for the workspace

- `workspaceRecord.ts`: `DocRecord` (`id`, `library`, `dirty`, `drive`, `file: { name, size, modified } | null`),
  `WorkspaceRecord` (`{ version: 1; docs; layout; explorer; ui }`), `parseDocRecord`, `docRecordText`,
  `parseWorkspaceRecord`, `migrateBackup(backupText, newId): DocRecord` (the old single-library backup as a
  document) and `textHash(text)` (cyrb53, 14 hex digits).
- `browserBackup.ts`: one IndexedDB record per document (`doc.<id>`), one for the workspace (`workspace.v1`), file handles
  (`handle.<id>`, read back with `readHandle(id)`, which another tab's write also uses so a stored handle is never forgotten), unreadable records copied aside (`broken.doc.<id>`). `readWorkspace()` returns `{ workspace, docs,
  handles, broken, unstored, notes }`: a record that can not be read is copied aside and listed in `broken`, and the others
  still load; storage that is blocked reads as an empty workspace.
- Migration of the old backup (`library.v1`, written by versions before the workspace): once per text. The key
  `migrated.v1` holds the fingerprint of the last text taken. A new text becomes the document `v1-<fingerprint>`, the same id
  in every tab, so a retry or two tabs at once write one record. A document already stored under that id, or open with the
  same courses, is never overwritten or duplicated. The fingerprint is written only once the document is stored; if the
  browser refuses the write, the document is in `docs` and its id in `unstored` (written again later) and the migration is
  tried again next start. An old backup that can not be read is kept aside (`keepBrokenBackup`) and listed in `broken`.
  When `library.v1` changed after it became a document (an older version of the app in another tab), the text becomes its own
  file and `notes` holds `OLDER_TAB_NOTE`: "Changes made in another tab with an older version of the app were opened as
  their own file." `library.v1` itself is read once and never written or deleted now.
- `useWorkspace` shows `broken` as a warning toast and `notes` as info toasts, and treats `unstored` documents as not yet
  written, so the first backup write after the start writes them.
