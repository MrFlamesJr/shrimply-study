# Integration: how the app uses the kit

- **Layout.** `useWorkspace` keeps a `kit/layout` `Layout<TabData>` and calls its pure operations. `src/layout/Workbench`
  renders `SplitView` for the main window and a `Popout` with a `SplitView` for each other window; each group is a
  `TabStrip`, the pane head (crumbs) and the tabs' screens (inactive ones mounted but hidden, up to 8 per group).
- **Navigation.** Each doc tab holds a `Route`. `PaneScreen` resolves it against the tab's document and renders the
  screen with `nav` bound to that tab. The main window's active tab mirrors `location.hash`.
- **Explorer.** `src/layout/Explorer` feeds `TreeView` with `explorerSource(docs)`, keeps `expanded` and `selection`
  in the workspace, opens `ContextMenu`s built per node kind, and runs `contentOps` through `apply`, so every move,
  copy, paste and delete is one undoable step that marks every file it touched as unsaved.
- **History.** `apply(label, update, key)` records `{ before, after }` snapshots of only the documents the update
  changed (`kit/history`, merged per key for typing). Undo and redo put those libraries back.
- **Windows.** `kit/windows` knows the app's windows. Dialogs (`askConfirm`, `askChoice`), toasts, the image viewer and
  `useKeydown` use the active window; components measure with their element's own window.
- **Styles.** Kit components use `--kit-*` variables, mapped to the app's tokens in `src/theme/tokens.css`.

To reuse a kit module elsewhere: copy `src/kit/<module>.ts(x)` and its `.css`, map the `--kit-*` variables, and pass
the props in `modules.md`. `#/_workbench` is a demo host that uses only the kit.
