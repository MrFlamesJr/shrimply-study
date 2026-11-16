# windows (`src/kit/windows.ts`, `src/kit/Popout.tsx`, `public/popout.html`)

## Purpose

Lets one React app show part of its UI in extra browser windows. The main window keeps all state and renders the popped-out
part into a popup through a React portal, so the popup needs no script and no syncing of state. `windows.ts` opens, styles,
tracks and closes popups. `Popout.tsx` is the component that renders children into one.

## Public API

`windows.ts`:

- `openPopup(id: string, url: string, o: { width: number; height: number; left?: number; top?: number }): Window | null`:
  `window.open(url, id, 'popup,width=..,height=..[,left=..][,top=..]')`. Returns null when the browser blocks it. Registers
  the window, starts a 500 ms closed-check and notifies subscribers.
- `mountPopup(win: Window, o: { title: string }): Promise<HTMLElement>`: waits until the popup has loaded, copies the
  opener's styles and `<html>` attributes and keeps them in step, sets the title, and returns a new `div` appended to the
  popup's `body` to render into. Rejects with `Error('The popup was closed before it loaded')` if the popup closes first.
- `setPopupTitle(win: Window, title: string): void`.
- `onPopupClosed(win: Window, cb: () => void): () => void`: calls `cb` once when the popup closes or reloads (its
  `pagehide`, with a 500 ms `win.closed` poll as a fallback). Returns a function that cancels it without calling `cb`.
- `appWindows(): Window[]`: the main window, then the open popups.
- `activeWindow(): Window`: the app window that had focus last; the main window when none or when that one is closed.
- `subscribeWindows(cb: () => void): () => void`: `cb` runs when a popup opens or closes, or focus moves between windows.
  Returns the unsubscribe function.
- `closePopups(): void`: closes every popup. It runs automatically when the main window fires `pagehide`.
- `windowOf(el: Element): Window`: `el.ownerDocument.defaultView`.

`Popout.tsx`:

- `Popout(p: { win: Window; title: string; onClosed: () => void; children: ReactNode }): ReactNode`: renders `children`
  into the popup `win` (a window from `openPopup`). Renders nothing until the popup is ready.

## Dependencies

`windows.ts`: none (browser APIs only: `window.open`, `MutationObserver`). `Popout.tsx`: `react`, `react-dom`
(`createPortal`) and `./windows`. No css and no `--kit-*` variables. The popup page is `public/popout.html`: a blank
same-origin HTML page with no script and no styles, served next to the app.

## Inputs and outputs

Input: a popup URL (the app's own `popout.html`, same origin), a size and optional position, a title, and children.
Output: a `Window` for the popup, and the children drawn inside it. The popup's `<head>` holds copies of the opener's
`<style>` elements and stylesheet `<link>`s.

## State ownership

The host holds which panes are popped out and their `Window` objects (for example `useState<Window | null>`). `windows.ts`
holds module-level bookkeeping: the open popups by id, the closed-check timers, the last focused window and the
subscribers. Application state lives only in the main window.

## Events and callbacks

- `onClosed` (of `Popout`): the popup was closed or reloaded by the user, or it closed before it finished loading. The
  host should dock the pane back (stop rendering `Popout`).
- `subscribeWindows` callbacks: windows opened or closed, or focus moved.
- What is mirrored into the popup, and kept up to date by `MutationObserver`s on the opener:
  - every `<style>` and `<link rel~="stylesheet">` in the opener's `<head>` (added, removed, reordered, text or `href`
    changed, so hot reload and a theme stylesheet work);
  - the attributes `data-theme`, `lang`, `class` and `style` of `<html>`;
  - the title, set by you through `Popout`'s `title` prop or `setPopupTitle`.
- Not mirrored: `adoptedStyleSheets`, rules added with `CSSStyleSheet.insertRule` or `replaceSync` (a style element's text
  is copied, but rules inserted afterwards through the CSSOM are not in its text), attributes of `<body>`, `<meta>`
  and `<link>`s other than stylesheets, fonts loaded with `FontFace` objects, and anything in the opener's `<body>`. A
  CSS-in-JS library that uses `insertRule` will not style the popup.

## Integration

```tsx
import { useState } from 'react'
import { Popout } from './kit/Popout'
import { openPopup } from './kit/windows'

export function Pane() {
  const [win, setWin] = useState<Window | null>(null)

  // Must run synchronously inside the click, or browsers block the popup.
  const popOut = () => {
    const w = openPopup('pane', new URL('popout.html', document.baseURI).href, { width: 420, height: 520, left: 120, top: 120 })
    if (w) setWin(w)
    else console.log('The browser blocked the popup')
  }

  const content = <p>Shared state shows here, in either window.</p>

  return win ? (
    <>
      <p>The pane is in its own window.</p>
      <Popout win={win} title="Pane" onClosed={() => setWin(null)}>
        {content}
        <button type="button" onClick={() => setWin(null)}>Dock</button>
      </Popout>
    </>
  ) : (
    <>
      <button type="button" onClick={popOut}>Pop out</button>
      {content}
    </>
  )
}
```

To dock, stop rendering `Popout` (set the window to null). Its cleanup closes the popup.

## Limitations and edge cases

- Rule for any component that may be rendered in a popup: use the element's own window and document, never the globals.
  Take them from `el.ownerDocument` and `el.ownerDocument.defaultView` (or `windowOf(el)`) for measuring, observers,
  timers, `requestAnimationFrame`, listeners on the window, `matchMedia`, creating elements and `showModal` or popovers.
  Never write `el instanceof HTMLElement` (the class belongs to another window and the test fails); check `nodeType` and
  `nodeName`. Use `new win.ResizeObserver(...)` from the element's window. `PopoutDemo` shows this in its `Panel`.
- React events work in a popup: React listens on the portal's container. Focus, text input, dialogs and popovers belong to
  the popup's own document.
- `window.open` only succeeds from a user gesture (a click, a key press), and only if it runs synchronously in the handler.
  An `await` before it loses the gesture. `openPopup` returns null when it is blocked; tell the user.
- The browser keeps its own popup chrome (title bar, and in most browsers an address line); neither can be hidden or
  styled. The `popup` feature only asks for a smaller window; position and size are requests the browser may adjust.
- The popup URL must be same-origin and a real file: `waitLoaded` reads its `document` and waits until its location is not
  `about:blank`. Its readiness is polled every 25 ms.
- `openPopup` uses the id as the window name: calling it again with an id that is still open navigates and reuses that
  window instead of opening a second one.
- Closed by the user: `onClosed` runs. Reloaded by the user (F5): `pagehide` fires, so it counts as closed; the reloaded
  page is blank and nothing renders into it. Closed before it loaded: `mountPopup` rejects and `Popout` calls `onClosed`.
- The main window closing, reloading or navigating away: `pagehide` runs `closePopups`, so the popups close. They cannot
  outlive the main window, because their content is rendered by it.
- `Popout` closes the popup when it unmounts, after a zero-delay timeout, so React Strict Mode's second run of effects does
  not close a popup that stays. If `win` changes, the old popup closes and the new one mounts.
- `activeWindow()` is only as good as focus events: it is the main window until a popup has been focused. Dialog and toast
  code should use it to decide which document to render into.
- Several `Popout`s may exist at once, each with its own `Window`.

In this app: a popped-out pane is a `Popout` of `public/popout.html`, and dialogs, toasts and `useKeydown` use `activeWindow()` (`docs/architecture/overview.md`, `integration.md`).
