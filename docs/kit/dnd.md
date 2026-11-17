# dnd (`src/kit/dnd.ts`)

## Purpose

Small helpers for native HTML5 drag and drop: carry a typed payload from the drag source to a drop target (even in
another window of the same app), choose move or copy from the modifier keys, and find where on a row or a pane the
pointer is. It does not attach any listeners.

## Public API

- `DRAG_MIME = 'application/x-kit-drag+json'`: the data type the payload is stored under.
- `DragPayload = { kind: string; ids: string[] }`: what is dragged. `kind` says what the ids are (for example `'tab'`).
- `startDrag(dt: DataTransfer, payload: DragPayload, text: string): void`: call in `dragstart`. Stores the payload as
  JSON under `DRAG_MIME`, sets `text/plain` to `text` (for other apps), sets `effectAllowed` to `'copyMove'`, and keeps
  the payload in the module.
- `readDrag(dt: DataTransfer | null): DragPayload | null`: the drag in progress. Returns the module's copy first; if
  there is none, parses `DRAG_MIME` from `dt`. `null` when there is no drag, or the data is not a valid payload.
- `endDrag(): void`: forgets the module's copy. Call in `dragend`.
- `guardNativeDrags(doc: Document): () => void`: holds back the browser's own drag and drop in one document. A `dragstart`
  on `a[href]` or `img` outside a `[draggable="true"]` source is cancelled; `DRAG_MIME` payloads are refused over text
  fields (`dropEffect = 'none'`, so no `text/plain` label is inserted); a file or link from outside that no target
  accepted (no `preventDefault` on `dragover`) is refused, so the browser never opens it in place of the app. Installed
  for the main document when the module loads; call it for each popup window and keep the returned function to take it
  off.
- `effectFor(mods: { ctrlKey; altKey; metaKey }, mac: boolean): 'move' | 'copy'`: `'copy'` when Ctrl is held (Alt, called
  Option, on a Mac), else `'move'`.
- `dropPosition(top, height, y, inside: boolean): 'before' | 'inside' | 'after'`: where `y` falls on a row that starts
  at `top` and is `height` tall. With `inside` true: the top quarter is `'before'`, the bottom quarter `'after'`, the
  middle half `'inside'`. With `inside` false: the top half is `'before'`, the rest `'after'`.
- `edgeZone(rect: { left; top; width; height }, x, y): 'left' | 'right' | 'top' | 'bottom' | 'center'`: the side whose
  outer quarter holds the point (the nearest side in a corner), else `'center'`.

## Dependencies

None. No imports. It uses the `DataTransfer` type from the DOM library.

## Inputs and outputs

Input: a `DataTransfer` (or null), payloads, modifier flags, coordinates in the same unit (usually client pixels).
Output: payloads and plain strings. `startDrag` writes into the `DataTransfer` and the module's copy.

## State ownership

`startDrag`, `readDrag` and `endDrag` share one module-level variable, the drag in progress. This is the only state
in the kit that is not held by the host. It exists because browsers hide the data of a drag from `dragover` handlers
(only `getData` in `drop` works) and because a drag may end in another window running the same JavaScript. `effectFor`,
`dropPosition` and `edgeZone` are pure. The host holds everything else (what is highlighted, which target is hovered).

## Events and callbacks

The host calls the module from its own handlers: `startDrag` in `dragstart`, `readDrag` in `dragover` and `drop`,
`endDrag` in `dragend`. There are no callbacks.

## Integration

```ts
import { startDrag, readDrag, endDrag, effectFor, dropPosition } from './kit/dnd'

const mac = false

export function onDragStart(e: DragEvent, id: string) {
  if (e.dataTransfer) startDrag(e.dataTransfer, { kind: 'item', ids: [id] }, id)
}

export function onDragOver(e: DragEvent, row: HTMLElement) {
  const drag = readDrag(e.dataTransfer)
  if (!drag || drag.kind !== 'item') return // not ours: do not call preventDefault, the drop is refused
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = effectFor(e, mac)
  const box = row.getBoundingClientRect()
  console.log(dropPosition(box.top, box.height, e.clientY, true)) // 'before' | 'inside' | 'after'
}

export function onDrop(e: DragEvent) {
  e.preventDefault()
  const drag = readDrag(e.dataTransfer)
  console.log(drag?.ids, effectFor(e, mac))
}

export function onDragEnd() {
  endDrag()
}
```

`effectFor` takes the event itself because a `DragEvent` has `ctrlKey`, `altKey` and `metaKey`. Get `mac` from
`isMac(navigator.platform)` in `shortcuts`.

## Limitations and edge cases

- `readDrag` ignores `dt` while the module's copy exists, so a drag started outside the app (files, text) reads as the
  app's payload if an app drag was never ended. Always call `endDrag` in `dragend`, which also fires when the drop
  happens elsewhere or the user presses Esc.
- A drag from another page that carries `DRAG_MIME` is read through `dt`, but only where the browser allows `getData`
  (during `drop`). Invalid JSON, a missing `kind` or `ids`, or wrong types give `null`. Ids are converted to strings.
- Only one drag at a time.
- `dropPosition` and `edgeZone` do not clamp: a point outside the box gives `'before'` / `'after'` (or the nearest side)
  by the same rules.
- `dropPosition` boundaries: at exactly a quarter or three quarters the result is `'inside'`; in halves mode the
  middle point is `'after'`.
- The `effectAllowed` set by `startDrag` is `'copyMove'`. Set `dropEffect` in `dragover` to show the cursor the user will
  get; a `dropEffect` that `effectAllowed` does not allow cancels the drop.
- The module does not decide whether a drop is valid. The host checks `kind`, the target and any rule, and decides what
  to tell the user.

In this app: tabs and the Explorer drag with these helpers; dnd-kit handles sorting inside one list (`docs/architecture/integration.md`, `dependencies.md`).
