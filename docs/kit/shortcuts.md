# shortcuts (`src/kit/shortcuts.ts`)

## Purpose

Describe keyboard shortcuts as strings (`"Mod+S"`), test a key event against one, show it as a label for the user's
platform, and tell whether a key event comes from a text field (where shortcuts usually must not fire).

## Public API

- `Combo = string`: modifiers and a key joined with `+`, for example `"Mod+S"`, `"Ctrl+Shift+E"`,
  `"Alt+Shift+ArrowUp"`, `"F2"`, `"Delete"`, `"Space"`. Modifier names: `Mod`, `Ctrl`, `Meta`, `Alt`, `Shift` (case
  does not matter). `Mod` is Cmd on a Mac and Ctrl elsewhere. The key is `KeyboardEvent.key`, with `Space` for the
  space bar.
- `matches(e: { key; ctrlKey; shiftKey; altKey; metaKey }, combo: Combo, mac: boolean): boolean`: does the event press
  the combo? The four modifier flags must match the combo exactly (an extra modifier fails). Letters ignore case.
- `isEditable(target: EventTarget | null): boolean`: true for a text-like `input`, a `textarea`, a `select` or a
  content-editable element.
- `comboLabel(combo: Combo, mac: boolean): string`: the label to show. Off a Mac: `"Ctrl+Shift+E"` (`Mod` becomes
  `Ctrl`, words capitalized, a single-letter key upper-cased). On a Mac: symbols joined without separator, `"⌘⇧E"`
  (`⌘ ⌃ ⌥ ⇧`, arrows as `↑ ↓ ← →`).
- `isMac(platform: string): boolean`: true for a `navigator.platform` string containing mac, iphone, ipad or ipod
  (any case).

## Dependencies

None. No imports.

## Inputs and outputs

Input: a key event (or any object with the five fields), a combo string, the `mac` flag, an event target. Output:
booleans and a label string.

## State ownership

The module is pure and holds nothing. The host owns its table of combos and actions, and the `mac` flag.

## Events and callbacks

None. The host adds the `keydown` listener and calls `matches` for each combo it handles.

## Integration

```ts
import { matches, isEditable, comboLabel, isMac, type Combo } from './kit/shortcuts'

const mac = isMac(navigator.platform)

const shortcuts: { combo: Combo; run: () => void }[] = [
  { combo: 'Mod+S', run: () => console.log('save') },
  { combo: 'F2', run: () => console.log('rename') },
]

window.addEventListener('keydown', (e) => {
  // Mod+S should work everywhere; F2 should not fire while typing.
  const hit = shortcuts.find((s) => matches(e, s.combo, mac))
  if (!hit) return
  if (isEditable(e.target) && !hit.combo.startsWith('Mod+')) return
  e.preventDefault()
  hit.run()
})

const hint = comboLabel('Mod+S', mac) // "Ctrl+S" or "⌘S", for a tooltip or menu
```

## Limitations and edge cases

- `matches` compares all four modifiers. `"Mod+S"` does not match when Shift is also held; list `"Mod+Shift+S"` separately.
- On a Mac, `Mod` requires `metaKey` and no `ctrlKey`; off a Mac, `Mod` requires `ctrlKey` and no `metaKey`.
- A combo is split on `+`, so the `+` key itself cannot be written. The last part is the key.
- Key names are compared lower-cased, with a space character equal to `Space`. There are no aliases (`Esc` does not
  match `Escape`, `Del` does not match `Delete`).
- An unknown modifier name (anything but `mod`, `ctrl`, `meta`, `alt`, `shift`) is ignored when matching. In
  `comboLabel` on a Mac it prints nothing for it.
- `isEditable` does not use `instanceof`, so it works for events from a popup window. It reads `nodeType` (must be 1),
  `nodeName`, `type` and `isContentEditable`. An `input` with no `type` counts as text. It refuses `button`, `checkbox`,
  `radio`, `range`, `color`, `file`, `image`, `reset` and `submit` inputs, text nodes, other elements and null.
- `comboLabel` on a Mac does not map `Enter`, `Delete` or `Escape` to symbols; they print as written.
- `isMac` takes the platform string as an argument so it can be tested; the host passes `navigator.platform` (of the
  right window).

In this app: the app's keyboard handlers use `matches` and `isEditable` (undo and redo only fire outside text fields).
