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
   documents (one per library: a Google Drive file or a browser library), the layout, the undo history, the clipboard
   and the Explorer's state. Content changes go through one path, `apply`, which records history, schedules the browser
   backup and, for a Drive library of your own, the autosave; it never changes a view-only library. The layout is a set of
   tabs in groups, split panes and windows; a library may show in several tabs, and closing tabs never closes a library.
5. `src/layout/`, `src/screens/`, `src/components/`: the UI. Screens get `lib: LibraryApi` (one document) and
   `nav: Nav` (their tab) as props. `App` mounts the `Sidebar` and the `Workbench` (there is no top bar), whose tabs
   show `PaneScreen`s: a library's page, the Explorer, How studying works or every release's notes. With no library open the app shows the welcome page.

## One state, many windows

Everything runs in the main window. A popped-out pane is a popup window of a blank same-origin page
(`public/popout.html`, no script) into which the main window's React tree renders through a portal. So every window
shows the same state with no syncing, undo is one history, and closing a popup simply docks its groups back.
Separate browser tabs of the site are separate copies of the app, kept in step per document through the browser
backup (IndexedDB plus a BroadcastChannel naming the document), as before.

## Documents

A document is one library plus where it lives: a Google Drive file (autosaved 1.5 s after the last edit; view only when
it is not the signed-in user's own, and then kept in sync) or only this browser (until it is uploaded). A `.shrimp` file is
a copy: opened as a browser library, downloaded as a copy. Each has its own status (Saving, Saved, or the reason a save is
paused), Share, Download a copy and Close; closing keeps the library in the Explorer's closed files. There is one Google
account per browser; Sign out closes every Drive library everywhere.
A tab is a view of a document at a place (home, course, quiz, editor, study); closing tabs never loses anything.
A popped-out window has a real address (`&pane`), so a reload keeps it popped out and a pasted address opens pane mode.

## Compatibility

The `.shrimp` format is versioned (`FORMAT_VERSION`). Every older version opens through `src/storage/upgrade.ts`;
frozen fixtures of every released version and the sample files are opened by the tests on every change.
