# Architecture overview

Shrimply Study is the first app built on a small reusable kit (`src/kit/`): editor groups and splits, tabs, a tree,
context menus, selection, undo history, drag and drop helpers, popup windows and confetti. The kit knows nothing about
study data. The app composes it with its own domain code.

## Layers (each may only use the ones below it)

1. `src/kit/`: generic. Imports only React, react-dom and itself.
2. `src/model.ts`, `src/logic/`: the study domain, pure functions with tests next to them. They may import the kit's pure
   files. The routes as data (`Route`, `parseHash`, `href`, `resolve`, `Nav`) are `logic/routes.ts`; `src/route.ts` adds the
   hooks and the address bar.
3. `src/storage/`: every file, zip, IndexedDB, localStorage and Google call. Nothing else touches them.
4. `src/state/` (`workspace.ts` the pure transitions, `useWorkspace.ts` the hook): owns all runtime state: the open
   documents (one per `.shrimp` file, Drive file or browser-only library), the layout, the undo history, the clipboard
   and the Explorer's state. Content changes go through one path, `apply`, which records history, marks the files
   touched as unsaved and schedules the browser backup. The layout is a set of tabs in groups, split panes and windows; a
   file may show in several tabs, and closing tabs never closes a file.
5. `src/layout/`, `src/screens/`, `src/components/`: the UI. Screens get `lib: LibraryApi` (one document) and an
   optional `nav: Nav` (their tab) as props. `App` mounts `Sidebar`, `TopBar` and the `Workbench`, whose tabs
   show `PaneScreen`s: a file's page, the Explorer or the welcome page.

## One state, many windows

Everything runs in the main window. A popped-out pane is a popup window of a blank same-origin page
(`public/popout.html`, no script) into which the main window's React tree renders through a portal. So every window
shows the same state with no syncing, undo is one history, and closing a popup simply docks its groups back.
Separate browser tabs of the site are separate copies of the app, kept in step per document through the browser
backup (IndexedDB plus a BroadcastChannel naming the document), as before.

## Documents

A document is one library plus where it lives: a local file (with its `FileSystemFileHandle` in Chrome and Edge), a
Google Drive file, or only this browser. Each has its own unsaved mark (`library !== saved`), Save, Download and Close.
A tab is a view of a document at a place (home, course, quiz, editor, study); closing tabs never loses anything.

## Compatibility

The `.shrimp` format is versioned (`FORMAT_VERSION`). Every older version opens through `src/storage/upgrade.ts`;
frozen fixtures of every released version and the sample files are opened by the tests on every change.
