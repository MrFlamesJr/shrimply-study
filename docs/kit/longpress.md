# longpress (`src/kit/longPress.ts`)

## Purpose

A touch or pen long press as the stand-in for a right click. A mouse right click opens a context menu; a finger has no
right button, so holding a tab or a tree row for half a second does the same.

## Public API

`createLongPress(onPress: (x: number, y: number) => void)` returns an object with:

- `fired: boolean`: true from the moment a press fires until the next pointer goes down. The click and the drag that follow
  the lift are not wanted, so the host ignores them while it is true.
- `down(e)`: call on `pointerdown`. Ignores `pointerType === 'mouse'`. Starts a 500 ms timer on the element's own window.
- `move(e)`: call on `pointermove`. Cancels when the pointer has moved more than 8 px from where it went down.
- `end()`: call on `pointerup`. If the press fired, calls `onPress(x, y)` 80 ms later (after the click that follows the lift).
- `cancel()`: call on `pointercancel` (or to abort).

The event argument is any object with `pointerType`, `clientX`, `clientY` and `currentTarget`. A React `PointerEvent` fits.

## Dependencies

None. No css.

## Inputs and outputs

Input: pointer events and the `onPress` callback. Output: a call of `onPress` with the coordinates where the finger
went down, and the `fired` flag.

## State ownership

The returned object holds the timer, the start point and `fired`. Create it once per component (`useState(() =>
createLongPress(...))`), and keep the latest handler in a ref so the callback is never stale.

## Events and callbacks

`onPress(x, y)`: open the menu there. It runs after the finger lifts, not while it is down, because a popover shown while
a pointer is still down is light-dismissed by that pointer's release.

## Integration

```tsx
import { useRef, useState } from 'react'
import { createLongPress } from './kit/longPress'
import { openMenu } from './kit/ContextMenu'

export function Item(p: { name: string }) {
  const press = useRef((x: number, y: number) => openMenu([{ label: 'Rename' }], { x, y }))
  const [hold] = useState(() => createLongPress((x, y) => press.current(x, y)))
  return (
    <div
      onPointerDown={hold.down}
      onPointerMove={hold.move}
      onPointerUp={hold.end}
      onPointerCancel={hold.cancel}
      onClick={() => !hold.fired && console.log('click')}
      onContextMenu={(e) => e.preventDefault()}
    >
      {p.name}
    </div>
  )
}
```

## Limitations and edge cases

- Mouse input never starts a press; use the right click.
- The press is cancelled by moving over 8 px, by `pointercancel`, and by a new `down`. It also stays cancelled if the finger
  lifts before 500 ms (the lift is then an ordinary click).
- The timer is set on `currentTarget`'s own window, so it works in a popup.
- `fired` stays true after the lift until the next `down`. A host that reads it in `onClick`, `onDoubleClick` and
  `dragstart` (as `TreeView` and `TabStrip` do) skips the click and the drag the lift would cause.
- The browser's own touch callout and text selection can fight a long press; `tabs.css` and `tree.css` set
  `-webkit-touch-callout: none` for that.
- `ContextMenu` ignores the lift that ends the press: it only picks an item whose press began inside the menu.

In this app: `TabStrip` and `TreeView` use it (`docs/architecture/integration.md`).
