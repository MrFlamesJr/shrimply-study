# float (`src/kit/float.ts`)

## Purpose

A small popup that hangs under a field, such as the reason a typed name is refused. It lives in the top layer, so no
scroll box or narrow column around the field can cut it off. It sits under its anchor, moves left to stay inside the
window, and goes above the anchor when there is no room below.

## Public API

- `placeBelow(anchor, size, view, margin = 8, gap = 4)`: pure. Takes the anchor's `{ left, top, bottom }` (a
  `DOMRect` fits), the popup's `{ width, height }` and the window's `{ width, height }`, and returns the popup's
  `{ left, top }`:
  - it starts under the anchor at its left edge, `gap` px below;
  - it moves left so it stays `margin` px inside the window, and never starts left of `margin`;
  - it goes above the anchor when it would cross the window's bottom and there is room above.
- `useFloatBelow(popup, anchor, shown)`: a React hook taking two refs and a flag.
  - While `shown`, it calls `showPopover()` on `popup` (an element with `popover="manual"`, rendered only while shown)
    and places it under `anchor` on every render (its text may change).
  - It places it again when its window is resized or anything in it scrolls (a capture listener), and hides it on
    cleanup.
  - It measures with the element's own window, so it works in a popped-out window.

## Dependencies

React only. No css: the host styles the popup. It needs `position: fixed; inset: auto; margin: 0`, and a `max-width`
that keeps it inside the window (for example `min(20rem, calc(100vw - 2 * <margin>))`). The popup wraps its text.

## Inputs and outputs

Input: the anchor's and the popup's boxes, read from the DOM. Output: the popup's `style.left` and `style.top` in px,
and its popover state.

## State ownership

None. The host decides when it is shown by rendering the popup or not.

## Used by

- `TreeView.tsx`: a rename field's refused reason (`.kit-row-error`).
- In the app, `AutoText`'s `popError`: the reason a library's name is refused in the sidebar.
