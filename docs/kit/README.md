# The kit (`src/kit/`)

A small set of generic building blocks for workspace-style apps: editor groups and splits, undo history, multi-selection,
a flattened tree with keyboard navigation, drag and drop helpers, shortcut matching and a confetti effect. It knows
nothing about the app it lives in. Data is ids and strings.

## Rules every kit file follows

- It imports only `react`, `react-dom`, `react-dom/client` and other files in `src/kit/`. `src/kit/boundary.test.ts`
  fails when a file imports anything else (test files may also import `vitest`; `.css` imports are allowed).
- It knows nothing of the host's domain. Types are generic (`Layout<D>`, `History<S>`) or plain ids.
- The pure modules (`layout`, `history`, `selection`, `tree`, `confettiMath`, and the pure functions of `shortcuts`
  and `dnd`) never mutate their arguments, return new objects, and return the same object when nothing changed. The host
  can therefore compare results with `===` to skip work.
- Ids and times come in as arguments. The pure modules read no clock and no random source.
- DOM code never uses the global `window` or `document` for an element it was given. It uses `el.ownerDocument` and
  `el.ownerDocument.defaultView`, because the element may live in a popup window. It never uses `instanceof HTMLElement`
  (fails across windows); it checks `nodeType` and `nodeName`.
- Styles: a component imports its own css file, class names start with `kit-`, and every value is a `--kit-*` variable
  or component geometry in px. Motion uses `--kit-dur` and `--kit-ease` and is off under `prefers-reduced-motion`.
  None of the modules documented here has a css file.

## Copying a module into another project

1. Copy the module file (`src/kit/<module>.ts`). `confetti` needs two files: `confettiMath.ts` and `Confetti.tsx`.
   The other modules are single files. Copy the test files next to them if you want the tests.
2. If a module has a css file (`tabs.css`, `split.css`, `menu.css`, `tree.css`), copy it too; the component imports it itself.
3. Keep the files in one folder: they import each other with relative paths. `Confetti.tsx` imports `confettiMath.ts`;
   `TabStrip.tsx` and `SplitView.tsx` import `dnd.ts`, and `SplitView.tsx` imports types from `layout.ts`; `TreeView.tsx` imports `dnd`, `selection`, `shortcuts` and `tree`.
4. `Confetti.tsx`, `TabStrip.tsx`, `SplitView.tsx`, `ContextMenu.tsx` (also `react-dom/client`) and `TreeView.tsx` need React. The rest are plain TypeScript.
5. Map the `--kit-*` variables below in your own stylesheet. the four css files use them (the lists are in
   each module's page); the other modules use none.

### The `--kit-*` variables a host maps

This app maps them in the last block of `src/theme/tokens.css`, on `:root`:

| Variable | Job | This app maps it to |
| --- | --- | --- |
| `--kit-ground` | page background | `--bg` |
| `--kit-surface`, `--kit-surface-2` | raised surfaces | `--surface`, `--surface-2` |
| `--kit-popup` | solid popup background | `--popup` |
| `--kit-text`, `--kit-muted` | text, secondary text | `--text`, `--text-muted` |
| `--kit-border`, `--kit-border-strong` | lines | `--border`, `--border-strong` |
| `--kit-accent`, `--kit-accent-soft`, `--kit-accent-line` | the one action color, its tint, its thin line | `--accent`, `--accent-soft`, `--accent-line` |
| `--kit-focus` | focus ring | `--focus` |
| `--kit-danger` | deleting | `--danger` |
| `--kit-radius` | corner radius | `--radius` |
| `--kit-font` | font family | `--font-body` |
| `--kit-text-sm`, `--kit-text-xs` | text sizes | `--text-sm`, `--text-xs` |
| `--kit-weight-bold` | bold weight | `--weight-bold` |
| `--kit-line`, `--kit-line-thick` | line widths | `--line`, `--line-thick` |
| `--kit-dim` | opacity of faded things | `--dim` |
| `--kit-space-1` to `--kit-space-4` | spacing steps | `--space-1` to `--space-4` |
| `--kit-tap` | minimum touch target | `--tap` |
| `--kit-dur` | short transition time | `--dur-fast` |
| `--kit-ease` | easing curve | `--ease` |

## Index

| Module | File | Page |
| --- | --- | --- |
| Editor groups, splits, windows | `layout.ts` | [layout.md](layout.md) |
| Undo and redo | `history.ts` | [history.md](history.md) |
| Multi-selection | `selection.ts` | [selection.md](selection.md) |
| Tree rows and keyboard navigation | `tree.ts` | [tree.md](tree.md) |
| Drag and drop helpers | `dnd.ts` | [dnd.md](dnd.md) |
| Shortcut matching | `shortcuts.ts` | [shortcuts.md](shortcuts.md) |
| Confetti | `confettiMath.ts`, `Confetti.tsx` | [confetti.md](confetti.md) |
| Tab strip | `TabStrip.tsx`, `tabs.css` | [tabs.md](tabs.md) |
| Split view and drop zones | `SplitView.tsx`, `split.css` | [split.md](split.md) |
| Context menu | `ContextMenu.tsx`, `menu.css` | [menu.md](menu.md) |
| Tree view | `TreeView.tsx`, `tree.css` | [treeview.md](treeview.md) |

The kit also has a `windows` module and the popout component. They are not
documented here yet; their contracts are in `docs/architecture/modules.md`.
