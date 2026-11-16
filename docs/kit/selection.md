# selection (`src/kit/selection.ts`)

## Purpose

Multi-selection over an ordered list of string ids, with the usual mouse and keyboard rules: click, Ctrl-click,
Shift-click, Ctrl+Shift-click and arrow keys with the same modifiers.

## Public API

- `Selection = { ids: string[]; anchor: string | null; focus: string | null }`. `ids` is the selected set. `anchor` is
  where a Shift range starts. `focus` is the item the keyboard is on.
- `emptySelection: Selection`: nothing selected, no anchor, no focus.
- `select(s, id, mods: { ctrl?: boolean; shift?: boolean }, order: string[]): Selection`: the result of a click on `id`.
  - Plain: only `id`; anchor and focus are `id`.
  - Ctrl: toggles `id`; anchor and focus become `id` (also when it was just removed).
  - Shift: the ids from the anchor to `id` in `order`, either direction; the anchor stays (it falls back to `id` when
    there is none); focus is `id`.
  - Ctrl+Shift: the same range added to the current ids.
- `step(s, delta, order, mods: { shift?: boolean; ctrl?: boolean }): Selection`: an arrow key. Moves focus by `delta`
  rows, clamped to the ends of `order`.
  - Plain: selects only the new focus (anchor and focus become it).
  - Shift: selects anchor to the new focus (anchor falls back to the old focus, then to the new focus).
  - Ctrl: moves focus only; `ids` and anchor are kept.
  - Ctrl+Shift: adds the range to the current ids.
- `selectAll(order): Selection`: every id, anchored at the first and focused on the last (`emptySelection` shape for an
  empty `order`).
- `prune(s, exists: (id) => boolean): Selection`: forgets ids that no longer exist. Anchor or focus that is gone
  becomes `null`. The same object when nothing was removed.
- `ordered(s, order): string[]`: the selected ids in `order`'s order. Selected ids missing from `order` are left out.

## Dependencies

None. No imports.

## Inputs and outputs

Input: a `Selection`, an id or a delta, the modifier flags, and `order`, the ids as the user sees them top to bottom.
Output: a new `Selection`. `ordered` returns a list of ids.

## State ownership

The module is pure. The host holds the `Selection`, passes the current visible `order` on every call, and reads the
modifier flags from the event. `ids` is in the order the user selected, not in display order: use `ordered` when the
display order matters (copy, delete, drag).

## Events and callbacks

None.

## Integration

```ts
import { emptySelection, select, step, ordered, prune, type Selection } from './kit/selection'

const order = ['a', 'b', 'c', 'd']
let sel: Selection = emptySelection

// A click on "b", then Shift-click on "d".
sel = select(sel, 'b', {}, order)
sel = select(sel, 'd', { shift: true }, order)
console.log(ordered(sel, order)) // ['b', 'c', 'd']

// ArrowUp with Shift shrinks the range from the focus end.
sel = step(sel, -1, order, { shift: true })

// An item was deleted: forget it.
sel = prune(sel, (id) => id !== 'c')
```

In an event handler, map the event to the flags: `{ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }`.

## Limitations and edge cases

- `order` must be the current visible order. An `anchor` that is not in `order` makes a Shift click select only the
  clicked id.
- `step` on an empty `order` returns `s` unchanged. When the focus is null or not in `order`, a positive `delta` starts
  from before the first item and a negative one from after the last (so the first ArrowDown selects the first item and
  the first ArrowUp the last).
- `select` and `step` never check that `id` is in `order` for plain and Ctrl clicks. The id is accepted as given.
- Ctrl toggling off the last selected id leaves `ids` empty with anchor and focus on that id.
- `prune` does not touch the order of `ids`.
- Duplicate ids in `order` are not handled.

In this app: the Explorer keeps a `Selection` over its tree rows (`docs/architecture/integration.md`).
