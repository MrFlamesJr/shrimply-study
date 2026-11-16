# Dependencies

## Packages

No package was added for the workspace. Runtime: `react`, `react-dom`, `fflate` (zip), `@dnd-kit/*` (sorting inside one
list: a sequence's steps, the editor's cards). Tabs and the Explorer drag with native HTML5 drag and drop, which works
across the app's windows and shows the system's move or copy cursor.

## Module graph (arrows: "imports")

```
screens, components, layout ──> state/useWorkspace ──> storage/* ──> model, logic
        │                              │
        │                              └──> logic/contentOps, logic/explorerTree ──> model, logic/names
        └──> kit/* (TabStrip, SplitView, TreeView, ContextMenu, Popout, Confetti, shortcuts, windows)
kit/*     ──> react, react-dom, kit/*     (never anything else: kit/boundary.test.ts)
logic/*   ──> model, logic/*, kit's pure files (tree types, selection)
storage/* ──> model, logic                (no React)
```

Rules: no cycles; `src/kit/` never imports outside itself; only `src/storage/` does I/O; screens never import storage
(the debug page excepted, as before).
