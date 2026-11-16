# tree (`src/kit/tree.ts`)

## Purpose

Turns a tree of string ids into the flat list of rows a tree widget shows (with depth, set position and filter
matches), and maps keys to actions following the WAI-ARIA tree pattern. It draws nothing.

## Public API

- `TreeSource = { roots: string[]; children(id: string): string[]; label(id: string): string }`: the host's tree, read
  through three functions.
- `Row = { id; depth; parent: string | null; expandable: boolean; expanded: boolean; posInSet: number; setSize: number; match: [number, number] | null }`.
  `depth` is 0 for roots. `posInSet` is 1-based (for `aria-posinset`), `setSize` the number of siblings shown
  (`aria-setsize`). `match` is the matched character range `[start, end)` in the original label, or null.
- `flatten(src, expanded: ReadonlySet<string>, filter?: string): Row[]`: the visible rows in display order. Children of
  an id appear only when it is in `expanded`. With a filter (ignoring case and Latin accents), a row is kept when its
  label contains the text or a descendant's does; kept rows with kept children are shown expanded whatever `expanded`
  says.
- `Nav = { focus?: string; expand?: string; collapse?: string; activate?: string }`: what a key asks the host to do.
- `keyNav(rows, focus: string | null, key: string, pageSize = 10): Nav | null`: the action for a key.
  - `ArrowDown`, `ArrowUp`, `Home`, `End`, `PageDown`, `PageUp`: `{ focus }`, clamped to the rows.
  - `ArrowRight`: `{ expand }` on a collapsed expandable row; `{ focus }` on its first child when expanded; `{}` on a leaf.
  - `ArrowLeft`: `{ collapse }` on an expanded row; else `{ focus }` on the parent; `{}` on a root.
  - `Enter`: `{ activate }` with the row's id.
  - Any other key, or no rows: `null`.
- `pathTo(src, id): string[] | null`: the ancestors of `id`, root first, not including it. `[]` for a root, `null` when
  `id` is not in the tree.
- `typeahead(rows, from: string | null, text: string, label: (id) => string): string | null`: the id of the next row
  whose label starts with `text` (ignoring case and accents), wrapping around. `null` when `text` is empty or nothing
  matches.

## Dependencies

None. No imports.

## Inputs and outputs

Input: a `TreeSource`, the set of expanded ids, an optional filter string, keys as strings (`KeyboardEvent.key`).
Output: `Row[]`, `Nav` objects, id paths. No input is mutated.

## State ownership

The module is pure. The host holds `expanded`, the focused id, the selection and the filter text, calls `flatten` on
every render (or memoizes it), and carries out the `Nav` it gets back. It also owns the typeahead buffer and its
timeout (clear the typed text after a pause).

## Events and callbacks

None. `TreeSource` functions are called during `flatten`. Their results should not change during one call.

## Integration

```ts
import { flatten, keyNav, pathTo, typeahead, type Row, type TreeSource } from './kit/tree'

const kids: Record<string, string[]> = { docs: ['a', 'b'], a: [], b: [] }
const names: Record<string, string> = { docs: 'Documents', a: 'Alpha', b: 'Beta' }
const src: TreeSource = { roots: ['docs'], children: (id) => kids[id] ?? [], label: (id) => names[id] }

let expanded = new Set<string>(['docs'])
let focus: string | null = null
let rows: Row[] = flatten(src, expanded) // docs, a, b

function onKey(key: string) {
  const nav = keyNav(rows, focus, key)
  if (!nav) return
  if (nav.focus) focus = nav.focus
  if (nav.expand) expanded = new Set(expanded).add(nav.expand)
  if (nav.collapse) {
    expanded = new Set(expanded)
    expanded.delete(nav.collapse)
  }
  if (nav.activate) console.log('open', nav.activate)
  rows = flatten(src, expanded)
}

// Reveal an item: expand its ancestors.
const trail = pathTo(src, 'b') ?? []
expanded = new Set([...expanded, ...trail])

// Typing "b" jumps to the next label starting with b.
focus = typeahead(rows, focus, 'b', src.label) ?? focus
```

## Limitations and edge cases

- With a filter, `expanded` is ignored: every kept row with kept children is open. A row that matches but has no
  matching child shows no children and is not expandable, even if it has some.
- An id in `expanded` that has no children is not `expandable` and not `expanded`.
- A filter of only spaces is a filter (it is not trimmed). An empty string or `undefined` means no filter.
- `match` covers the first occurrence only. Ranges map back to the original label, so accents and case are kept in the
  highlight. Ancestors kept only for their descendants have `match: null`.
- When `focus` is null or not in `rows`: `ArrowDown` and `PageDown` count from before the first row (ArrowDown gives
  the first row, PageDown the row `pageSize` places down, minus one); `ArrowUp` and `PageUp` give the first row; `ArrowRight`, `ArrowLeft` and `Enter` give `{ focus: first row }`.
- `ArrowUp` on the first row, `ArrowDown` on the last: the focus stays (returns the same id).
- `typeahead`: a one-character `text` starts searching after `from` (repeated presses cycle through matches); longer
  text starts at `from`, so the current row stays when it still matches.
- `keyNav` matches `key` strings exactly (`'ArrowDown'`, not `'Down'`). It ignores modifiers; the host decides whether to
  call it when Ctrl or Shift is held.
- There is no cycle check. A `TreeSource` where a node is its own descendant never finishes.
- `flatten` calls `label` and `children` several times per id under a filter (it caches only the "kept" answer).

In this app: the Explorer feeds `flatten` with `explorerSource(docs)` (`docs/architecture/integration.md`).
