# tabs (`src/kit/TabStrip.tsx`, `src/kit/tabs.css`)

## Purpose

A React component that draws one editor group's tab strip: the tabs, a close button on each, keyboard navigation,
drag to reorder or to receive drops, and a place for action buttons at the right end. It is controlled: it holds no tab
data.

## Public API

- `TabItem = { id: string; title: string; description?: string; tooltip?: string; dirty?: boolean; icon?: ReactNode }`.
  `description` is a muted second line of text after the title, `tooltip` the native `title` of the tab, `dirty` shows a
  dot in the close button's place until it is hovered or focused.
- `TabStrip(p): JSX.Element` with props:
  - `group: string`: the strip's accessible name (`aria-label` of the `tablist`).
  - `tabs: TabItem[]`, `active: string | null`: what to show, and the active tab's id.
  - `focused: boolean`: whether this is the active group (adds the class `is-focused`).
  - `dragKind: string`: the `kind` of the payload its tabs drag with.
  - `onActivate(id)`, `onClose(id)`.
  - `onMove(id, index)`: one of this strip's own tabs was dropped at `index`.
  - `onDrop(payload, index)`: any other accepted payload (another group's tab, a tree item) was dropped at `index`.
  - `canDrop(payload): boolean`: whether a payload may be dropped here.
  - `onContextMenu(id, at: { x, y })`: client coordinates for the menu.
  - `actions?: ReactNode`: buttons at the strip's right end.

## Dependencies

Imports `./dnd` (`startDrag`, `readDrag`, `endDrag`, `DragPayload`), `react`, and `./tabs.css`. The css uses these
variables: `--kit-accent --kit-border-strong --kit-dur --kit-ease --kit-focus --kit-font --kit-line-thick --kit-muted
--kit-radius --kit-space-1 --kit-space-2 --kit-space-3 --kit-surface --kit-tap --kit-text --kit-text-sm --kit-text-xs`.

## Inputs and outputs

Input: the props above. Output: a `div.kit-tabstrip` holding a scrolling `role="tablist"` of `role="tab"` elements
(`data-tab` holds the id) and, when `actions` is given, a `div.kit-tabs-actions`. A drop line `span.kit-tab-drop` shows
where a drag would land. Every change is reported through a callback; the component changes no data.

## State ownership

The host holds the tabs, the active id and the focused flag. The component keeps only transient UI state: where the drop
line is, and the scroll position of the strip. It scrolls the active tab into view when `active` changes.

## Events and callbacks

- Click on a tab: `onActivate`. Close button, middle click, or `Delete` on a focused tab: `onClose`.
- Right click, `ContextMenu` key, or `Shift+F10` on a focused tab: `onContextMenu` (the key opens it at the tab's bottom
  left).
- Keys on a focused tab: `ArrowLeft` and `ArrowRight` move focus (wrapping), `Home` and `End` go to the ends,
  `Enter` and `Space` activate. Focus is roving: only the active tab (or the first when none is active) is in the tab order.
- Dragging a tab starts a drag with payload `{ kind: dragKind, ids: [id] }` and the title as text. On drop, a payload of
  `dragKind` with one id that is in this strip calls `onMove(id, index)`; any other accepted payload calls
  `onDrop(payload, index)`. `index` is counted in the strip's list before the move, the same convention as
  `layout.moveTab`.
- The mouse wheel scrolls the strip sideways when the tabs overflow (vertical wheel only).

## Integration

```tsx
import { TabStrip } from './kit/TabStrip'
import { activate, closeTabs, moveTab, type Layout } from './kit/layout'

type Data = { title: string }
const KIND = 'tab'

export function Strip(p: { layout: Layout<Data>; groupId: string; set(fn: (l: Layout<Data>) => Layout<Data>): void }) {
  const g = p.layout.groups[p.groupId]
  return (
    <TabStrip
      group={`Group ${p.groupId}`}
      tabs={g.tabs.map((id) => ({ id, title: p.layout.tabs[id].data.title }))}
      active={g.active}
      focused={p.layout.activeGroup === p.groupId}
      dragKind={KIND}
      onActivate={(id) => p.set((l) => activate(l, id))}
      onClose={(id) => p.set((l) => closeTabs(l, [id]))}
      onMove={(id, index) => p.set((l) => moveTab(l, id, p.groupId, index))}
      onDrop={(payload, index) => p.set((l) => payload.ids.reduce((acc, id) => (acc.tabs[id] ? moveTab(acc, id, p.groupId, index) : acc), l))}
      canDrop={(payload) => payload.kind === KIND}
      onContextMenu={(id, at) => console.log('menu for', id, at)}
    />
  )
}
```

Import `tabs.css` along with the component (the component does it itself) and map the variables above.

## Limitations and edge cases

- Touch: a long press on a tab (see [longpress.md](longpress.md)) calls `onContextMenu(id, { x, y })`; the click and drag
  that follow the lift are ignored. Under `@media (pointer: coarse)` tabs are `--kit-tap` tall and the close button is
  32 px.
- Same-kind drops from another strip (or window) reach `onDrop`, not `onMove`: the strip only calls `onMove` for a single
  id it already holds.
- A drag is accepted only when `canDrop` returns true; otherwise the strip does not call `preventDefault`, so the browser
  shows a "not allowed" cursor.
- `dropEffect` is always `'move'`. The strip never copies.
- The drop line follows tab midpoints: the pointer past a tab's middle lands after it.
- Key handling only runs when the tab itself has focus, not its close button. The close button has `tabIndex -1`.
- Tab ids are used as React keys and in `data-tab`; they must be unique within the strip.
- The strip asks for no icons: `icon` is any node, drawn before the title.
- Close buttons have the label "Close <title>" in English. There is no prop to change it.
- A tab with `dirty: true` shows the dot, but closing still calls `onClose`; asking to save is the host's job.
- The wheel handler is added once, on mount, and ignores horizontal wheel events so trackpads keep their own scroll.

In this app: each group of the workbench renders a `TabStrip` (`docs/architecture/integration.md`).
