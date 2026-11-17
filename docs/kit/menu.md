# menu (`src/kit/ContextMenu.tsx`, `src/kit/menu.css`)

## Purpose

An imperative context menu: any handler calls `openMenu(items, where)` and a menu appears at a point or under an element,
with submenus, checkmarks, disabled items with a reason, shortcut hints and full keyboard control. One menu is open at a
time.

## Public API

- `MenuItem = 'separator' | { label: string; onSelect?: () => void; shortcut?: string; disabled?: boolean; reason?: string; danger?: boolean; checked?: boolean; submenu?: MenuItem[] }`.
  - `shortcut`: text shown at the right (use `comboLabel` from `shortcuts`); it does not bind a key.
  - `disabled` + `reason`: a greyed item that cannot be chosen; `reason` is its tooltip.
  - `danger`: styled as a destructive item.
  - `checked`: when defined (true or false) the item is a `menuitemcheckbox`; a check mark shows when true.
  - `submenu`: opens a nested menu; such an item's own `onSelect` is never called.
- `openMenu(items: MenuItem[], at: { x: number; y: number; doc?: Document } | { anchor: Element }): void`: closes any open
  menu and opens this one. `x`, `y` are client coordinates. With `anchor`, the menu opens under that element (above it if
  there is no room) in the element's own document. With a point, the document is `at.doc`, else the global `document`.
- `closeMenu(): void`: closes the open menu and returns focus to what had it before, unless the user has focused something else.

## Dependencies

`react`, `react-dom/client` (`createRoot`), and `./menu.css`. The css uses: `--kit-accent-soft --kit-border-strong
--kit-danger --kit-dim --kit-dur --kit-ease --kit-focus --kit-font --kit-line --kit-line-thick --kit-muted --kit-popup
--kit-radius --kit-space-1 --kit-space-2 --kit-space-3 --kit-tap --kit-text --kit-text-sm --kit-text-xs`.

## Inputs and outputs

Input: an item list and a place. Output: a `div.kit-menu[role=menu]` (a popover) appended to the document's `body`
in its own React root, removed on close. Choosing an item closes the menu, then calls its `onSelect`.

## State ownership

The module holds one variable: the menu that is open (its React root, container, the element that had focus, and the
document). The host holds everything else; items are rebuilt by the host each time it calls `openMenu`, and an open menu
does not update if the host's state changes.

## Events and callbacks

- `onSelect` of the chosen item, called after the menu has closed.
- Keyboard (focus is on the first usable item when it opens): `ArrowDown` and `ArrowUp` move (wrapping, skipping
  separators and disabled items), `Home` and `End` go to the first and last usable item, `Enter` and `Space` choose,
  `ArrowRight` opens a submenu, `ArrowLeft` closes a submenu, `Tab` closes the whole menu, `Esc` closes it (native popover).
  Typing letters jumps to the next usable item whose label starts with the typed text (the text resets after 700 ms; one
  letter starts after the current item).
- Mouse: hovering an item focuses it and, for a submenu item, opens the submenu after 200 ms. A click chooses. A click
  outside closes the menu (native popover light dismiss).

## Integration

```tsx
import { openMenu, type MenuItem } from './kit/ContextMenu'

export function Row(p: { name: string; onRename(): void; onDelete(): void }) {
  return (
    <div
      tabIndex={0}
      onContextMenu={(e) => {
        e.preventDefault()
        const items: MenuItem[] = [
          { label: 'Rename', shortcut: 'F2', onSelect: p.onRename },
          { label: 'Share', submenu: [{ label: 'Copy link' }, { label: 'Email' }] },
          'separator',
          { label: 'Delete', danger: true, onSelect: p.onDelete },
        ]
        openMenu(items, { x: e.clientX, y: e.clientY, doc: e.currentTarget.ownerDocument })
      }}
    >
      {p.name}
    </div>
  )
}
```

To open it from a button, pass `{ anchor: buttonElement }`.

## Limitations and edge cases

- Touch: a menu opened by a long press (see [longpress.md](longpress.md)) appears under the finger. The finger that lifts
  next must not pick an item, so an item is chosen by a click only after a pointer went down inside the menu. Under
  `@media (pointer: coarse)` items are at least `--kit-tap` tall. A menu is at most 320 px wide.
- Popup windows: the menu is created in the target document (`anchor.ownerDocument`, or `at.doc`). The popover,
  positioning, timers (`defaultView.setTimeout`) and the viewport size all use that document's window. Without `doc` a
  point opens in the main window, so pass `doc` when the click came from a popup. The css file is loaded for the main
  document only: a popup document needs the kit styles copied into it by the host.
- The menu is placed at the point, shifted left or up when it would leave the viewport (4 px margin); it is never
  larger-than-viewport aware, so a very long menu can run off the bottom.
- An open menu is not re-rendered when the host's state changes; close it and open a new one.
- `onSelect` on a submenu parent is ignored. A `disabled` item is skipped by the keyboard and by type-ahead, and cannot
  be clicked.
- A `checked: false` item has the checkbox role but shows no mark.
- The menu closes on `Tab` rather than moving focus on.
- Focus returns to the element that had it when the menu opened, only if focus is still on the body or inside the menu
  at close time.
- One menu at a time: opening a second closes the first without calling any `onSelect`.

In this app: the tab context menus and the Explorer's menus use `openMenu` (`docs/architecture/integration.md`).
