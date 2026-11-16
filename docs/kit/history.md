# history (`src/kit/history.ts`)

## Purpose

An undo and redo stack for any snapshot type `S`. Each entry stores the state before and after one change, so undo
and redo only hand back the snapshot to restore. Entries with the same key that come close together in time merge into
one (typing in a field becomes one undo step).

## Public API

- `Entry<S> = { label: string; before: S; after: S; key?: string; at: number }`. `at` is a time in milliseconds,
  supplied by the host.
- `History<S> = { past: Entry<S>[]; future: Entry<S>[] }`. The last element of `past` is the next undo; the last
  element of `future` is the next redo.
- `RecordOptions<S> = { limit?: number; mergeMs?: number; merge?: (a: S, b: S, keep: 'first' | 'last') => S }`.
  Defaults: `limit` 100, `mergeMs` 1500. The default `merge` returns `a` for `'first'` and `b` for `'last'`.
- `emptyHistory<S>(): History<S>`: no past, no future.
- `record(h, entry, options?): History<S>`: adds an entry and clears the future. Merges into the last entry when
  both have the same defined `key` and `entry.at - last.at <= mergeMs`. A merged entry keeps the first label, `before`
  from `merge(last.before, entry.before, 'first')`, `after` from `merge(last.after, entry.after, 'last')`, and takes
  `entry.at`. Over `limit`, the oldest entries are dropped.
- `undo(h): { history, entry } | null`: moves the last past entry to the future. The host applies `entry.before`.
  `null` when there is nothing to undo.
- `redo(h): { history, entry } | null`: moves the last future entry back to the past. The host applies `entry.after`.
  `null` when there is nothing to redo.
- `drop(h, pred): History<S>`: removes the entries `pred` picks, from past and future.
- `seal(h): History<S>`: the next `record` never merges into the current last entry (it loses its key). The same object
  when there is no entry or it has no key.
- `undoLabel(h): string | null`: the label of the entry undo would undo.
- `redoLabel(h): string | null`: the label of the entry redo would redo.

## Dependencies

None. No imports.

## Inputs and outputs

Input: a `History<S>` and entries. Output: a new `History<S>`; `undo` and `redo` also return the entry to apply.
The module never looks inside `S` except through the optional `merge` function.

## State ownership

The module is pure. The host holds the `History<S>`, decides what `S` is (a whole document, or a record of only the
documents that changed), reads the clock for `at`, and applies the snapshots that `undo` and `redo` return.

## Events and callbacks

None, except the optional `merge` in `RecordOptions`, called when two entries merge.

## Integration

```ts
import { emptyHistory, record, undo, redo, seal, undoLabel, type History } from './kit/history'

type Doc = { text: string }

let doc: Doc = { text: '' }
let history: History<Doc> = emptyHistory<Doc>()

function edit(label: string, next: Doc, key?: string) {
  history = record(history, { label, before: doc, after: next, key, at: Date.now() })
  doc = next
}

edit('Type', { text: 'h' }, 'field-1')
edit('Type', { text: 'hi' }, 'field-1') // merged: one undo step
history = seal(history) // the next typing starts a new step

const back = undo(history)
if (back) {
  history = back.history
  doc = back.entry.before // { text: '' }
}
console.log(undoLabel(history)) // null
```

## Limitations and edge cases

- Entries without a `key`, or with different keys, never merge.
- The merge window is measured from the last merged entry's `at`, which moves forward with every merge. Typing that
  never pauses longer than `mergeMs` stays one step.
- `record` clears the future even when the entry merges.
- `limit` counts entries after merging. The oldest entry is dropped first.
- Only the last entry can merge. `seal` is for when something other than a record (a focus change, a save) should end
  the run.
- `merge` is for snapshots that are not plain values, for example a record of changed documents where two entries touch
  different documents.
- `drop` does not renumber or merge anything. Use it when a snapshot can no longer be applied (for example its file
  was replaced from outside).
- `undo` and `redo` do not apply anything. The host decides how to put a snapshot back and must not record that
  application as a new entry.

In this app: `useWorkspace.apply(label, update, key)` records `{ before, after }` snapshots of only the documents the
update changed (`docs/architecture/integration.md`).
