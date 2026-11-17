# treeview (`src/kit/TreeView.tsx`, `src/kit/tree.css`)

## Purpose

An accessible, virtualized tree widget: multi-selection, keyboard navigation, type-ahead, filtering with highlight,
drag and drop with host-defined rules, inline rename and context menu callbacks. It draws the rows that `tree.ts` computes
and uses `selection.ts`, `dnd.ts` and `shortcuts.ts`. The host owns the data and all state.

## Public API

```ts
type DropRule = { ok: true } | { ok: false; reason: string }
```

`TreeView(p): ReactNode` with props:

- `label: string`: accessible name of the tree.
- `source: TreeSource`: `{ roots, children(id), label(id) }` (see tree.md).
- `rowHeight: number`: every row's height in px (fixed).
- `expanded: ReadonlySet<string>`, `onExpanded(next: Set<string>)`: the open ids, held by the host.
- `selection: Selection`, `onSelection(next: Selection)`: held by the host (see selection.md).
- `filter?: string`: passed to `flatten`; matches are highlighted with `<mark>`.
- `icon?(id): ReactNode`, `description?(id): string | null`, `dimmed?(id): boolean`: optional per-row extras (`dimmed`
  adds the class `is-dimmed`, for example for cut items).
- `onActivate(id)`: Enter or double click.
- `onContextMenu(target: string | null, at: { x; y })`: right click, the ContextMenu key or Shift+F10. `null` target:
  empty space. If the row is not selected it is selected first.
- `onKeyDown?(e: KeyboardEvent, focus: string | null): boolean`: the host's own keys, run first; return true to say the key
  is handled. `e` is the native event.
- `drag?`: `{ kind(ids): string | null; rule(payload, target, pos, effect): DropRule; allowInside(target): boolean; onDrop(payload, target, pos, effect): void; label(payload, effect): string }`.
  `kind` returns the payload kind (null: these cannot be dragged). `target` is a row id or null (empty space below the
  rows), `pos` is `'before' | 'inside' | 'after'`, `effect` is `'move' | 'copy'`. `label` is the text shown by the drop
  point ("Move 3 cards").
- `rename?`: `{ id: string | null; commit(id, name): void; cancel(): void; check?(id, name): string | null }`. The row with
  `id` shows a text field.
- `empty?: ReactNode`: shown when there are no rows.

## Dependencies

`react`, `./dnd`, `./selection`, `./shortcuts` (`isMac`), `./tree`, and `./tree.css`. The css uses: `--kit-accent
--kit-accent-line --kit-accent-soft --kit-border-strong --kit-danger --kit-dim --kit-dur --kit-ease --kit-focus
--kit-font --kit-line --kit-line-thick --kit-muted --kit-popup --kit-radius --kit-space-1 --kit-space-2 --kit-space-3
--kit-surface-2 --kit-text --kit-text-sm --kit-text-xs`.

## Inputs and outputs

Input: the props. Output: a scrolling `div.kit-tree[role=tree]` of absolutely positioned `div.kit-row[role=treeitem]`
rows (with `aria-level`, `aria-posinset`, `aria-setsize`, `aria-expanded`, `aria-selected`), plus a drop label while a
drag is over it. The tree changes nothing itself: every change goes out through a callback.

## State ownership

The host holds the data, `expanded`, `selection`, the filter, the rename target and whatever a drop changes. TreeView
keeps only UI state: scroll position, measured height, the current drop target, the type-ahead text and the auto-expand
timer. The focused row is `selection.focus` (or the first row when that is null or hidden).

## Events and callbacks

Keyboard map (keys act on the focused row; the tree is one tab stop with a roving `tabindex`):

| Key | Action |
| --- | --- |
| `ArrowDown`, `ArrowUp`, `Home`, `End`, `PageDown`, `PageUp` | move focus and select it (a page is the visible rows minus one) |
| the same with Shift | extend the selection from the anchor |
| the same with Ctrl or Cmd | move focus only |
| `ArrowRight` | expand a collapsed row, else focus its first child |
| `ArrowLeft` | collapse an expanded row, else focus its parent |
| `Enter` | `onActivate` |
| `Space` | toggle the focused row in the selection |
| `Ctrl+A` / `Cmd+A` | select every visible row |
| `ContextMenu`, `Shift+F10` | `onContextMenu` at the row (the row is selected if it was not) |
| letters | type-ahead on labels (buffer resets after 700 ms) |

Keys with Alt are ignored. Keys typed in a rename field are not handled by the tree.

Mouse: a click selects (Ctrl or Cmd toggles, Shift extends); a click on the chevron expands or collapses; a double click
activates; a right click opens the menu callback.

Drag and drop: dragging a selected row drags all selected rows (in display order); dragging an unselected row drags just
it. Over the tree, `drag.rule` is asked for every move; the result shows the label (or the refusal `reason`), a drop line
or highlight, and the cursor (`none` when refused). A refused drop calls nothing. A collapsed folder hovered for 600 ms
expands. Near the top or bottom edge (28 px) the tree scrolls.

## Integration

The host holds selection and expansion, and refuses to drop a folder into itself.

```tsx
import { useMemo, useState } from 'react'
import { TreeView } from './kit/TreeView'
import { emptySelection, type Selection } from './kit/selection'
import type { TreeSource } from './kit/tree'

const kids: Record<string, string[]> = { docs: ['a', 'b'], a: [], b: [] }
const names: Record<string, string> = { docs: 'Documents', a: 'Alpha', b: 'Beta' }

export function Files() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['docs']))
  const [selection, setSelection] = useState<Selection>(emptySelection)
  const source = useMemo<TreeSource>(() => ({
    roots: ['docs'],
    children: (id) => kids[id] ?? [],
    label: (id) => names[id],
  }), [])
  return (
    <div style={{ height: 360, width: 320 }}>
      <TreeView
        label="Files"
        source={source}
        rowHeight={28}
        expanded={expanded}
        onExpanded={setExpanded}
        selection={selection}
        onSelection={setSelection}
        onActivate={(id) => console.log('open', id)}
        onContextMenu={(target, at) => console.log('menu', target, at)}
        drag={{
          kind: () => 'file',
          allowInside: (id) => id === 'docs',
          rule: (payload, target, pos) =>
            payload.ids.includes(target ?? '') && pos === 'inside' ? { ok: false, reason: "Can't go inside itself" } : { ok: true },
          onDrop: (payload, target, pos, effect) => console.log(effect, payload.ids, pos, target),
          label: (payload, effect) => `${effect === 'copy' ? 'Copy' : 'Move'} ${payload.ids.length}`,
        }}
      />
    </div>
  )
}
```

`source` should be memoized: the tree recomputes its rows when `source`, `expanded` or `filter` change identity.

## Limitations and edge cases

- Touch: a long press (500 ms, see [longpress.md](longpress.md)) on a row or on empty space does what a right click does: it
  selects the row if it was not selected and calls `onContextMenu(target, { x, y })` where the finger went down. The click,
  double click and drag that follow the lift are ignored. `tree.css` turns off the touch callout. Row height for touch is
  the host's choice through `rowHeight` (this app uses 44 on touch).
- Virtualization assumes a fixed row height: every row is exactly `rowHeight` px tall and positioned at `index * rowHeight`.
  Pointer positions are turned into rows by arithmetic, not by looking at the DOM, so rows of other heights break clicks,
  drops and scrolling. Wrapping text must be clipped.
- Only the rows in view plus 8 above and below are rendered, plus the focused row. The container needs a definite height
  (the tree scrolls itself); until it is measured the tree assumes 600 px. The height follows a `ResizeObserver` of the
  element's own window.
- Row elements are found by `data-id`; ids are used as React keys and must be unique and stable.
- The tree does not prune the selection. If items disappear, the host calls `prune` from `selection.ts`. A `selection.focus`
  that is not in the visible rows makes the first row the tab stop.
- Keyboard focus moved by keys is applied after render; a row scrolled out of view is scrolled in first.
- With a filter, every matching branch is shown open, and `expanded` is ignored until the filter is cleared (see tree.md).
- Drag: a payload of another kind or from outside is still passed to `rule`, which must refuse it. The tree calls
  `preventDefault` on every dragover that has a payload, so the refusal is shown by the cursor (`none`) and the label.
  Drop on empty space gives target `null` and pos `'after'`.
- Copy is Ctrl (Option on a Mac), read from the event's window's `navigator.platform`.
- Rename: Enter commits, Esc cancels, leaving the field commits. While `check` returns a message, Enter does nothing, the
  message shows under the field, and leaving the field cancels instead of committing. Name trimming and conflicts are the
  host's job.
- Popup windows: all timers, the resize observer and the platform test use the tree's own window, so the tree works when
  rendered through a portal into a popup. The css must be present in that document.
- Everything the tree shows comes from the host. It has no built-in clipboard, delete or rename keys; use `onKeyDown` for them.

In this app: the Explorer renders a `TreeView` over `explorerSource(docs)` (`docs/architecture/integration.md`).
