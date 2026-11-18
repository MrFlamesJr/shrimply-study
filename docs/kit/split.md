# split (`src/kit/SplitView.tsx`, `src/kit/split.css`)

## Purpose

Two React components for an editor workspace. `SplitView` draws one window's tree of splits (the `Node` of
`layout.ts`) with draggable sashes between the panes. `DropZones` is an overlay for a pane that shows which edge, or the
centre, a dragged item would land on.

## Public API

- `SplitView(p): JSX.Element` with props:
  - `root: Node`: the window's root, from `layout.windows[win].root`.
  - `renderGroup(id: GroupId): ReactNode`: draws one group. The result sits in a `div.kit-leaf` that is a flex item; make
    the content fill it (`flex: 1`, `min-height: 0`, or height 100%).
  - `onResize(path: number[], sizes: number[]): void`: new sizes for the split at `path` (child indexes from the root).
    The same arguments `layout.resize` takes after the window id.
  - `minSize?: { width: number; height: number }`: default `{ width: 320, height: 240 }` pixels.
- `DropZones(p): JSX.Element` with props:
  - `accept(payload: DragPayload): boolean`: whether a payload may be dropped on this pane.
  - `acceptZone?(payload, zone): boolean`: whether the payload may land in that zone (default: all). A zone it refuses
    shows no overlay and takes no drop, so the host passes `canSplit` for the edges. The host's `accept` and `onDrop`
    also check that the payload's ids exist in the layout.
  - `onDrop(payload, zone: 'left' | 'right' | 'top' | 'bottom' | 'center'): void`.

## Dependencies

`SplitView.tsx` imports `./dnd` (`edgeZone`, `readDrag`, `DragPayload`), the types `GroupId` and `Node` from `./layout`,
`react` and `./split.css`. The css uses: `--kit-accent-line --kit-accent-soft --kit-dur --kit-ease`.

## Inputs and outputs

`SplitView` input: the tree, a render function and the callbacks. Output: nested `div.kit-split.is-row|is-column`
elements, a `div.kit-leaf` per child (flex size from `sizes`), and between children a focusable `role="separator"`
(`div.kit-sash`, with `aria-orientation` and `aria-valuenow` as a percentage). `DropZones` output: a `div.kit-dropzones`
(`aria-hidden`), holding a `div.kit-dropzone.is-<zone>` while a drag is over the pane.

## State ownership

The host holds the layout. `SplitView` keeps only which sash is being dragged and a pending animation frame.
`DropZones` keeps only the current zone. Sizes are never stored in the components: they come in through `root` and go out
through `onResize`.

## Events and callbacks

- Pointer drag on a sash (left button, pointer capture): `onResize(path, sizes)` at most once per animation frame while
  moving (frames from the pane's own window), and once more on release.
- Arrow keys on a focused sash (`ArrowLeft`/`ArrowRight` in a row split, `ArrowUp`/`ArrowDown` in a column): moves it by
  2% of the split.
- Double click on a sash: `onResize` with equal sizes for all children of that split.
- `DropZones`: while an accepted drag is over its parent element, it shows the zone under the pointer and accepts the
  drop (`dropEffect` `'move'`). On drop it calls `onDrop(payload, zone)`. The zone is cleared when the drag leaves, ends
  or drops.

## Integration

```tsx
import { SplitView, DropZones } from './kit/SplitView'
import { MAIN, resize, split, type Layout } from './kit/layout'

type Data = { title: string }
const KIND = 'tab'

export function Workspace(p: { layout: Layout<Data>; set(fn: (l: Layout<Data>) => Layout<Data>): void }) {
  return (
    <div style={{ height: 460, display: 'flex' }}>
      <SplitView
        root={p.layout.windows[MAIN].root}
        renderGroup={(id) => (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1 }}>Group {id}</div>
            <DropZones
              accept={(payload) => payload.kind === KIND}
              onDrop={(payload, zone) =>
                p.set((l) => {
                  const tab = l.tabs[payload.ids[0]]
                  if (!tab || zone === 'center') return l
                  const dir = zone === 'left' || zone === 'right' ? 'row' : 'column'
                  const side = zone === 'left' || zone === 'top' ? 'before' : 'after'
                  return split(l, id, dir, side, `new-${tab.id}`, tab)
                })
              }
            />
          </div>
        )}
        onResize={(path, sizes) => p.set((l) => resize(l, MAIN, path, sizes))}
        minSize={{ width: 160, height: 120 }}
      />
    </div>
  )
}
```

The container of `SplitView` must have a definite size (a height, and `display: flex` as above); `SplitView` fills it.
`DropZones` positions itself over its parent element, so put it inside the pane's own wrapper, as the last child, and give
that wrapper `position: relative` (`.kit-dropzones` is absolutely positioned; the zones are measured from its parent).

## Limitations and edge cases

- A sash moves only the two panes beside it; the others keep their sizes. Both are kept above `minSize` where the room
  allows; if the two together are under twice the minimum, they split evenly.
- `minSize` is only enforced while resizing. It does not stop a layout from being created with panes smaller than it. The
  host refuses splits that would be too small (this app: 320 by 240 px).
- The sash gap is 4 px, subtracted from the room when sizes are converted to pixels.
- Children are keyed by group id; nested splits by position. Moving a group keeps its React state only when its id and
  its place in the tree allow it.
- `onResize` receives sizes that sum to 1 for the dragged pair's split, but not always normalized to the last bit; the
  host (`layout.resize`) renormalizes.
- Releasing the pointer sends one final `onResize` even when nothing moved.
- `DropZones` ignores drags over a `role="tablist"` element (the tab strip handles its own drops), over a text field and
  drags whose payload `accept` refuses. `Zone` is exported. It reads the payload with `readDrag`, so the drag must have started with `startDrag`.
- `DropZones` uses the latest `accept` and `onDrop` without re-registering, but reads its parent element once, on mount;
  do not move it to another parent.
- A `center` drop means "into this group"; what that does (move the tab, open it) is the host's choice.

In this app: `src/layout/Workbench` renders `SplitView` for the main window and for each popout (`docs/architecture/integration.md`).
