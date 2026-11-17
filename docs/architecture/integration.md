# Integration: how the app uses the kit

Status as built. "Mounted" means `App` renders it; "not mounted" means the code and its tests exist but no screen shows it
yet (the Workbench and the Explorer are being mounted).

## What runs today

- **`App`** (`src/App.tsx`) calls `useWorkspace(fileStorage, notify, askConfirm, askChoice, showTab)` once. It gets
  `ws: WorkspaceApi`, takes the active document's `LibraryApi` (`ws.doc(ws.active)`, or null) as `lib`, and renders the
  shell: `Sidebar`, `TopBar` and the page for the address bar's route (`Home`, `Course`, `Quiz`, `Edit`, `Study`, the
  debug page, the changelog). The active document's tab keeps the page shown (`ws.setRoute(route)` follows the hash),
  and `showTab` writes the active tab's route into the hash when another document becomes active. Ctrl+S saves the active
  document. Undo and redo (`Mod+Z`, `Mod+Shift+Z`, `Ctrl+Y`) are app-wide through `ws.undo` and `ws.redo` and are left to
  the browser inside text fields (`isEditable`). `#/_workbench` renders `kit/demo/WorkbenchDemo`.
- **`useWorkspace`** (`src/state/useWorkspace.ts`) holds the whole state in a `Workspace` (`src/state/workspace.ts`, pure
  transitions): the open documents (one per `.shrimp` file, Drive file or browser-only library, each with its own
  unsaved mark `library !== saved`), a `kit/layout` `Layout<TabData>` with one tab per document, the `kit/history`
  undo history, the clipboard and the Explorer's state. All content changes go through `apply(label, update, key)`:
  one undoable step holding snapshots of only the documents it changed, merged per key for typing. Saving, Drive, the
  browser backup (a record per document and one for the workspace, written 300 ms after a change and flushed on
  `pagehide`) and restoring on start are done here, through `src/storage/`.
- **`Sidebar`** (`src/layout/Sidebar.tsx`) lists `ws.docs` as file rows (`ws.doc(id)` for Save, Download, Close;
  `ws.activate`), New library, Open file, and the course tree of the active document.
- **Screens** get `lib: LibraryApi` (one document) and an optional `nav: Nav` (their tab; without it they use
  `windowNav(route)`, the address bar's).

## Built, not mounted

- **`src/layout/Workbench`** renders `SplitView` for the main window and a `Popout` with a `SplitView` for each other
  window; each group is a `TabStrip`, a `PaneHead` (crumbs) and the tabs' screens (hidden ones mounted, up to
  `KEPT_ALIVE + 1` per group, chosen by `mountedTabs`). Its decisions (titles, menus, disabled reasons, whether a pane may
  split) are `logic/workbenchActions`. It takes the layout and callbacks as props; `WorkspaceApi` does not have the layout
  actions it needs yet (see `modules.md`).
- **`src/layout/Explorer`** feeds `TreeView` with `explorerSource(docs)`, takes `expanded` and `selection` (the
  workspace's `explorer`) as props, opens `ContextMenu`s from `explorerActions.menuFor`, and runs every move, copy, paste,
  rename, create and delete through `apply`, so each is one undoable step that marks every file it touched as unsaved.
  `contentOps` does the work on the libraries; `explorerActions` decides what is allowed and why not.
- **`src/layout/ExplorerPane`** is the glue from `WorkspaceApi` to `Explorer`: it builds the open files' rows from `ws.docs`
  and `ws.doc(id)` (the file's place in words from `logic/whereLine`), keeps `ws.explorer` (`expanded`, `selection`) in step
  through `ws.setExplorer`, and passes `ws.apply`, `ws.undo`, `ws.copy`, `ws.cut`, `ws.paste` and each file's save,
  download and close. Nothing renders it yet; the Explorer tab is being mounted.
- **Per-tab navigation** (`logic/tabNav.buildTabNav`, `layout/tabNav.makeTabNav`): a tab's `go`, `redirect`, `goToNew` and
  `takeCreated`, writing the hash only for the tab that owns the address bar. Nothing calls `makeTabNav` yet.

## Storage and the browser backup

`useWorkspace` reads everything with `storage/browserBackup.readWorkspace()` and writes through `writeDoc` and
`writeWorkspace` (one IndexedDB record per document, one for the workspace). Rules as built:

- A record that can not be read is copied aside and skipped; the other documents still load, and a warning toast says how
  many were set aside.
- The old single-library backup (`library.v1`) moves in once per text, keyed by its content: the document `v1-<fingerprint>`
  (the same id in every tab, so a retry or two tabs never duplicate it), recorded in `migrated.v1` only after the document is
  stored. `library.v1` is never changed or deleted. A text that changed later (an older version in another tab) becomes its
  own file. `readWorkspace` also reports `unstored` (documents the browser refused to store) and `notes` (the
  older-version message); `useWorkspace` does not use these two yet.
- Ids never repeat within a file: a move or paste into a file that already uses an id gives the item a new one
  (`contentOps`).

## The editor's cards

`EditScreen` renders each card as a memoized `EditorCard` (`src/screens/edit/EditorCard.tsx`). The screen keeps the latest
card actions and the library in refs, so a card's props change only when that card does: typing in one card of a 2000-card
quiz re-renders that card. `useSortableCard` (`SortableCard.tsx`) gives each card its drag handle (dnd-kit, within one list).

## Kit use

- **Layout.** `useWorkspace` keeps a `Layout<TabData>` and uses `kit/layout` for adding, closing and activating tabs and
  for restoring (`readLayout` docks popped-out groups on reload). Splits, moves, pop out and dock are used by the
  Workbench props, not yet by the hook.
- **History.** `applyEdit` records `{ before, after }` snapshots of only the documents the update changed
  (`kit/history`, with a `merge` for snapshots). Undo and redo put those libraries back. A document replaced from outside
  (another tab, a Drive pull, a reload) drops its entries (`forget`).
- **Touch.** `TabStrip` and `TreeView` open their menus on a long press (`kit/longPress`), and `ContextMenu` ignores the
  lifting finger, so tab and Explorer menus work on a phone.
- **Windows.** `kit/windows` knows the app's windows; `components/ownWindow` gives an element's own window. The toast stack
  (`useSyncExternalStore` on `subscribeWindows` and `activeWindow`) and `useKeydown` (`appWindows`) already follow the
  windows; nothing calls `openPopup` outside the kit demo yet. Components measure with their element's own window.
- **Styles.** Kit components use `--kit-*` variables, mapped to the app's tokens in `src/theme/tokens.css`.
- **Confetti.** The results screen uses `kit/Confetti`.

To reuse a kit module elsewhere, see `docs/kit/README.md` and the page of that module. `#/_workbench` is a demo host that
uses only the kit.
