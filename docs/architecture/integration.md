# Integration: how the app uses the kit

Everything described here runs: `App` mounts the Workbench (with the Explorer tab) beside the Sidebar. There is no top bar.

## The shell

- **`App`** (`src/App.tsx`) calls `useWorkspace(fileStorage, notify, askConfirm, askChoice)` once and builds the shell: a
  `Sidebar` and a `wb-cell` holding the `Workbench`, which starts at the top of the window (hidden on the app's own pages: debug, and the welcome page
  when no file is open). The kit demo (`#/_workbench`) is a full-screen page outside the shell; every release's notes (`#/_changelog`) open as a tab. A study
  session alone in the main window keeps the full-screen look (the shell steps aside by CSS; the workbench stays mounted).
  `lib` is the active file's `LibraryApi` (`ws.doc(ws.active)`), used by the Sidebar, Ctrl+S and the Drive dialog.
- **The address bar** follows `ws.address`, the main window's active tab when it shows a file. Switching tabs writes that
  tab's page into the hash and the entry names the tab (`history.state` `{ tab }`), replacing the entry; going somewhere inside
  a tab pushes one (`makeTabNav`, only for the tab that owns the address); the same tab on another page from the Sidebar or
  the Explorer adds an entry too. Back, Forward and a typed address are handled in the `popstate` and `hashchange` events
  (at once, `flushSync`): the entry's own tab, wherever it is now, becomes active on that page (`ws.followHistory`), and an
  entry with no tab (a typed address) goes to the main window's tab only when its file has that page. On start the address
  wins. The debug page and Drive links are left alone; `#/_changelog` opens the What's new tab (`ws.showAppPage('changelog')`).
- **Keys** (`useKeydown`): Ctrl+S saves the active file; Ctrl+Alt+S saves every file with changes; undo and redo
  (`Mod+Z`, `Mod+Shift+Z`, `Ctrl+Y`) are app-wide through `ws.undo` and `ws.redo` and left to the browser inside text
  fields (`isEditable`); `Mod+Shift+E` shows the Explorer; `Mod+\` splits the active group; Ctrl+Alt+Shift+D toggles the debug bar.
- **Screens** get `lib: LibraryApi` (one document) and `nav: Nav` (their tab's, from `makeTabNav`; always given, since
  `route.ts` no longer has global navigation functions); none touches the address bar.

## State: `useWorkspace`

`src/state/useWorkspace.ts` holds the whole state in a `Workspace` (`src/state/workspace.ts`, pure transitions): the open
documents (one per `.shrimp` file, Drive file or browser-only library, each with its own unsaved mark `library !== saved`),
a `kit/layout` `Layout<TabData>` of tabs, groups, splits and windows, `recent` (tabs, the last active first), the
`kit/history` undo history, the clipboard and the Explorer's state. A file may show in several tabs, each with its own
page, and closing tabs never closes a file. A file opened without a named group goes to the active group, unless that shows the
Explorer (it stays in view): then to the group used last besides it (`openingGroup`). Layout operations are on `WorkspaceApi` (`openPlace`, `activateTab`,
`closeTabs`, `moveTab`, `split`, `join`, `resize`, `popOut`, `dock`, `showExplorer`, ...) and wrap the pure transitions.
All content changes go through `apply(label, update, key)`: one undoable step holding snapshots of only the documents it
changed, merged per key for typing. A toast's Undo (`ws.undoLater`, taken right after the change) undoes only its own step, and
says so when other changes came after it. Replacing a document from outside or closing it takes it out of the history, and
with it any step that also changed another file and every step beyond that one (`forget`). Every tab of a document follows a
rename of its course or quiz, shown or not, once the typing pauses (`followRenames`). A course created with "New course" is a
draft that goes away if left untouched, and stays once anything changed that very course (here or in the Explorer). Closing a
file with changes asks Save, Don't save or Cancel, and asks again when changes came in while it saved (`readyToClose`).
Saving, Drive, the browser backup and restoring on start are done here, through
`src/storage/` through the `StorageAdapter` (`openFiles`, `saveInPlace`, `saveAs`, `download`, `sameFile`), the one seam for files.

## The Workbench

- **`src/layout/Workbench`** renders `SplitView` for the main window and a `Popout` with a `SplitView` for each other
  window of the layout. Each group is a `TabStrip`, a `PaneHead` (crumbs) and the tabs' screens (the shown one plus the
  most recent hidden ones, `mountedTabs`, stay mounted), with `DropZones` on the pane for tab drops. Each tab's screen renders into a node of its own (one per tab and window) that its
  group's slot adopts, so moving a tab to another group of the same window keeps its screen and state (a study round goes on);
  moved to another window it starts afresh there. Its decisions (titles,
  menus, disabled reasons, whether a pane may split) are `logic/workbenchActions`. It takes the layout and callbacks as props;
  `App` wires them to `WorkspaceApi`.
- **Popping a pane out.** `App.popOut` calls `openPopup` synchronously in the click, keeps the `Window` in its `popups` state
  by window id, then calls `ws.popOut(groupId, win)` (a group, from its ⋯ menu) or `ws.popOutTab(tabId, win)` (one tab, from
  its tab menu: it moves into a group of its own there; the rest of its group stays). `Workbench` renders a `Popout` for each
  such window, with no title row: its tab strip comes first and Dock sits in its top-right group's strip (and every
  group's ⋯ menu); closing or
  reloading the popup docks its groups back (`ws.dock`). If the browser blocks the popup a warning toast says so. A window of
  the layout with no popup (after a reload) comes back docked.
- **`src/layout/PaneScreen`** renders one tab: the Explorer (`ExplorerPane`), every release's notes (a changelog tab; its way
  back closes the tab), or a file's page. A file's
  tab gets its own `Nav` (`makeTabNav`), follows renames in its route (`usePlaceFor`), keeps its own scroll position, and
  follows links to pages of its file inside the tab (Ctrl or middle button: a new tab beside it). Screens get `lib:
  LibraryApi`, `nav: Nav`, and for study `active` (only the active pane's keys work).
- **Empty groups and the brand.** A group with no tab shows `EmptyPane` (Show the Explorer, New file, Open file, and each open
  file's home to open there). Clicking the Sidebar's brand opens the Welcome tab (`ws.showAppPage('welcome')`); the sidebar's What's
  new link opens the What's new tab. Both are one at most and come back on reload. An empty group also says how many tabs
  are in popped-out windows (`poppedOut`), with Show them and Dock all; the main window's top-right strip shows that
  count with a menu of the windows and Dock all.
- **Breadcrumbs.** Each pane's `PaneHead` (a compact plain row, no frosted glass) shows the trail built by `App.crumbs`: the file's name first (led by an icon of where it lives; on its home followed by
  the page's own name, "Your courses"), then the course and
  quiz, followed by id through renames; none for a study session or the Explorer; the shrimp, "Shrimply Study" › "What's new" or "Welcome" for the app's own tabs. The row starts
  at the pane's left, in line with the first tab's text. In a pane
  narrower than 480px the trail becomes one "‹ parent" link. A click goes through that pane's own tab.
- **Sidebar** (`src/layout/Sidebar.tsx`): under the brand a "Files" heading with New file, Open file, Google Drive and Save
  all (the actions a top bar used to hold), then `ws.docs` as file rows (Save, Download, Close; `ws.activate`), the course tree of the active file (a click shows the page in the active group, Ctrl or middle in a new tab), and
  the Explorer button.

## The Explorer

- **`src/layout/ExplorerPane`** is the glue from `WorkspaceApi` to `Explorer`: it builds the open files' rows from `ws.docs`
  and `ws.doc(id)` (the file's place in words from `logic/whereLine`), keeps `ws.explorer` (`expanded`, `selection`) in step
  through `ws.setExplorer`, and passes `ws.apply`, `ws.undoLater`, `ws.copy`, `ws.cut`, `ws.paste` and each file's save,
  download and close. It also lists the user's Google Drive libraries (below).
- **`src/layout/Explorer`** feeds `TreeView` with `explorerSource(docs)`, opens `ContextMenu`s from
  `explorerActions.menuFor`, and runs every move, copy, paste, rename, create and delete through `apply`, so each is one
  undoable step that marks every file it touched as unsaved. `contentOps` does the work on the libraries;
  `explorerActions` decides what is allowed and why not.
- **Google Drive in the Explorer.** The tree is one list sorted by name: the open files and the user's Google Drive libraries
  that are not open, each with its state ("Open" or "Not open") and where it lives. Signed out, a "Sign in with Google" button
  sits under the tree; signed in, a Refresh button, and a "Choose files in Google Drive" link (or a loading or failure line
  with Retry) under it. `ExplorerPane` lists them through `ws.drive.list()` and refreshes after a sign-in change, an open, a
  save, a pick or a removal; it never asks Google for a token without a click. Enter or expanding a closed library opens it as
  a file of the tree; Delete or Move to bin on a library asks, then moves it to the bin. Pasting or dropping on a library is
  refused ("Open the library first."), and so is deleting one from the tree. A delete in the Explorer offers Undo on its toast
  (`ws.undoLater`) that undoes only that step.
- **Showing it.** `App.showExplorer` (Sidebar button, `Mod+Shift+E`, a tab's Reveal in Explorer) activates the Explorer
  tab where it shows; otherwise it splits on the left of the active group when the window is 1000px or wider and the group has
  room (`canSplit`), else opens it as a tab. There is at most one. What the Explorer opens goes to the group used last
  besides its own (`ws.recentGroup`), or a new tab beside it; Edit on a card opens that quiz's page with the card dialog.

## Storage and the browser backup

`useWorkspace` opens, saves and compares files only through the `StorageAdapter` it is given, and reads everything the browser
kept with `storage/browserBackup.readWorkspace()` and writes through `writeDoc` and
`writeWorkspace` (one IndexedDB record per document, one for the workspace). Rules as built:

- A record that can not be read is copied aside and skipped; the other documents still load, and a warning toast says how
  many were set aside.
- The old single-library backup (`library.v1`) moves in once per text, keyed by its content: the document `v1-<fingerprint>`
  (the same id in every tab, so a retry or two tabs never duplicate it), recorded in `migrated.v1` only after the document is
  stored. `library.v1` is read once and never written or deleted now (the old single-backup code is gone). A text that changed later (an older version in another tab) becomes its
  own file. `readWorkspace` also reports `unstored` (documents the browser refused to store) and `notes` (the
  older-version message). `useWorkspace` treats `unstored` documents as not yet written (the first backup write after the
  start writes them and warns if that fails), and shows `notes` as info toasts.
- Another tab's write of a document is taken up together with the file handle stored with it (`readHandle`), and a handle
  another tab stored is never deleted here.
- Ids never repeat within a file: a move or paste into a file that already uses an id gives the item a new one
  (`contentOps`).

## The editor's cards

`EditScreen` renders each card as a memoized `EditorCard` (`src/screens/edit/EditorCard.tsx`). The screen keeps the latest
card actions and the library in refs, so a card's props change only when that card does: typing in one card of a 2000-card
quiz re-renders that card. `useSortableCard` (`SortableCard.tsx`) gives each card its drag handle (dnd-kit, within one list).

## Kit use

- **Layout.** `useWorkspace` keeps a `Layout<TabData>` and uses `kit/layout` for every tab, group, split and window operation
  (`openTab`, `activate`, `closeTabs`, `moveTab`, `split`, `join`, `resize`, `popOut`, `dock`, `normalize`), and for restoring
  (`readLayout` docks popped-out groups on reload).
- **History.** `applyEdit` records `{ before, after }` snapshots of only the documents the update changed
  (`kit/history`, with a `merge` for snapshots). Undo and redo put those libraries back. A document replaced from outside
  (another tab, a Drive pull, a reload) drops its entries (`forget`).
- **Touch.** `TabStrip` and `TreeView` open their menus on a long press (`kit/longPress`), and `ContextMenu` ignores the
  lifting finger, so tab and Explorer menus work on a phone.
- **Windows.** `kit/windows` knows the app's windows (`App` opens popups with `openPopup`; `Workbench` renders them with
  `Popout`); `components/ownWindow` gives an element's own window. The toast stack (`useSyncExternalStore` on
  `subscribeWindows` and `activeWindow`) and `useKeydown` (`appWindows`) follow the windows. Components measure with their
  element's own window.
- **Styles.** Kit components use `--kit-*` variables, mapped to the app's tokens in `src/theme/tokens.css`.
- **Toasts.** While a study session shows, the toast stack rises above the controls of the question and its feedback sheet
  (`logic/toastLift`, `--toasts-lift`), so a toast never covers an answer button.
- **Confetti.** The results screen uses `kit/Confetti`.

To reuse a kit module elsewhere, see `docs/kit/README.md` and the page of that module. `#/_workbench` is a demo host that
uses only the kit.
