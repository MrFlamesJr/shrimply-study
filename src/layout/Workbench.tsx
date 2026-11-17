import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BackToTop } from '../components/BackToTop'
import { IconButton } from '../components/IconButton'
import { DockIcon, MoreIcon, OpenIcon, SplitIcon } from '../components/Icons'
import { ownWindow } from '../components/ownWindow'
import { openMenu, type MenuItem } from '../kit/ContextMenu'
import type { DragPayload } from '../kit/dnd'
import { MAIN, allGroups, groupsIn, windowOf, type Group, type Layout, type Node, type Tab, type WindowId } from '../kit/layout'
import { Popout } from '../kit/Popout'
import { isEditable, isMac, matches } from '../kit/shortcuts'
import { DropZones, SplitView } from '../kit/SplitView'
import { TabStrip } from '../kit/TabStrip'
import type { Route } from '../route'
import {
  canSplit, copyPathText, elsewhereText, groupMenu, mountedTabs, poppedOut, tabDescription, tabDirty, tabMenu, tabTitle, tabTooltip,
  type FindPlace, type GroupContext, type MenuAction, type MenuEntry, type TabData, type WorkbenchDoc,
} from '../logic/workbenchActions'
import { PaneHead, type Crumb } from './PaneHead'

export type { TabData, WorkbenchDoc }

const TAB_KIND = 'tab'
const SPLIT_KEY = 'Mod+\\'

export type WorkbenchProps = {
  layout: Layout<TabData>
  docs: Record<string, WorkbenchDoc>
  /** The course and quiz a doc tab shows, found by id while a rename is followed (titles never flicker). */
  findPlace?: FindPlace
  /** WindowId -> its open popup (the host opened it in the click). */
  popups: Record<string, Window>
  /** WindowId -> the address its popup shows (the host's own page for what the window shows; none keeps the popup page's). */
  popupAddresses?: Record<string, string>
  /** Set when the host is a pane-mode page: the top-right group's strip shows Open full app, where a popup has Dock. */
  onOpenFullApp?: () => void
  /** The screen for a tab; called for the shown tab and for kept-alive hidden ones. */
  renderTab(tab: Tab<TabData>, shown: boolean): ReactNode
  /** The pane head's breadcrumbs for a tab. */
  crumbs(tab: Tab<TabData>): Crumb[]
  onCrumb(tabId: string, route: Route): void
  on: {
    activate(tabId: string): void
    activateGroup(groupId: string): void
    close(tabIds: string[]): void
    closeOthers(tabId: string): void
    closeAll(groupId: string): void
    move(tabId: string, toGroup: string, index: number): void
    /**
     * A new group beside `groupId`. `move`: the dragged tab `tabId` moves into it; otherwise it shows a copy of
     * `tabId` (default: the group's active tab).
     */
    split(groupId: string, dir: 'row' | 'column', side: 'before' | 'after', tabId?: string, move?: boolean): void
    join(from: string, into: string): void
    /** A copy of the tab right after it. */
    duplicate(tabId: string): void
    resize(win: string, path: number[], sizes: number[]): void
    /**
     * The group, or only its tab `tabId`, into a new window. The host calls kit/windows openPopup synchronously inside
     * this call (it comes from a click).
     */
    popOut(groupId: string, tabId?: string): void
    dock(win: string): void
    revealInExplorer(tab: Tab<TabData>): void
    copyText(text: string): void
  }
  /** False on touch and below 800px (the host decides). */
  canPopOut: boolean
  /** What an empty group shows (default: "No tab open"). */
  renderEmpty?(groupId: string): ReactNode
}

// Each tab's screen renders into a node of its own (one per tab and window), which its group's slot takes in: a tab
// moved to another group in the same window keeps its screen (its state too: a study round goes on), only the node
// moves. Moved to another window it starts afresh there, as what it measured and listened to belonged to the old one;
// so does a popup's screens once its window was reloaded (`generation`: the popup's new document).
type Slots = Map<string, HTMLElement>
const slotKey = (win: WindowId, tabId: string, generation = 0) => `${win} ${generation} ${tabId}`

/** The main window's groups, and a popup for each other window of the layout. */
export function Workbench(p: WorkbenchProps) {
  const { layout } = p
  const nodes = useRef<Slots>(new Map())
  const [reloads, setReloads] = useState<Record<string, number>>({})
  const nodeFor: NodeFor = (win, tabId) => {
    const key = slotKey(win, tabId, reloads[win])
    let node = nodes.current.get(key)
    if (!node) {
      node = document.createElement('div')
      node.className = 'wb-tab-node'
      nodes.current.set(key, node)
    }
    return node
  }
  // The screens, all here (a stable place, keyed by tab and window), each into its node.
  const screens: ReactNode[] = []
  const live = new Set<string>()
  for (const g of Object.values(layout.groups)) {
    const win = windowOf(layout, g.id)
    if (win === null || (win !== MAIN && !p.popups[win])) continue
    const keep = mountedTabs(g)
    for (const id of g.tabs) {
      const tab = layout.tabs[id]
      if (!tab || !keep.has(id)) continue
      const key = slotKey(win, id, reloads[win])
      live.add(key)
      screens.push(createPortal(p.renderTab(tab, id === g.active), nodeFor(win, id), key))
    }
  }
  // Nodes of tabs no longer shown anywhere are let go.
  useEffect(() => {
    for (const key of [...nodes.current.keys()]) if (!live.has(key)) nodes.current.delete(key)
  })
  const popped = poppedOut(layout, (w) => !!p.popups[w])
  return (
    <>
      <div className="workbench">
        <WindowView p={p} win={MAIN} nodeFor={nodeFor} popped={popped} />
      </div>
      {Object.keys(layout.windows)
        .filter((w) => w !== MAIN && p.popups[w])
        .map((w) => {
          const first = layout.groups[groupsIn(layout, w)[0]]
          const active = first?.active ? layout.tabs[first.active] : undefined
          const title = active ? tabTitle(active, p.docs, p.findPlace) : 'Shrimply Study'
          return (
            // No title row: the browser's own bar names the window, and the tab strip comes right under it.
            <Popout
              key={w}
              win={p.popups[w]}
              title={title}
              address={p.popupAddresses?.[w]}
              onClosed={() => p.on.dock(w)}
              onReload={() => setReloads((r) => ({ ...r, [w]: (r[w] ?? 0) + 1 }))}
            >
              <div className="workbench is-popup">
                <WindowView p={p} win={w} nodeFor={nodeFor} />
              </div>
            </Popout>
          )
        })}
      {/* After the windows, so each slot holds its node before the screen in it measures where it is. */}
      {screens}
    </>
  )
}

// One window's tree. Narrow, only the shown group has room (workbench.css): the others stay mounted, hidden.
type NodeFor = (win: WindowId, tabId: string) => HTMLElement

// The group at a window's top-left corner: the first child all the way down.
const cornerOf = (n: Node): string => (n.kind === 'group' ? n.id : cornerOf(n.children[0]))
// The group at its top-right corner: a row's last child, a column's first.
const topRightOf = (n: Node): string => (n.kind === 'group' ? n.id : topRightOf(n.dir === 'row' ? n.children[n.children.length - 1] : n.children[0]))

type Popped = ReturnType<typeof poppedOut>

function WindowView({ p, win, nodeFor, popped = [] }: { p: WorkbenchProps; win: WindowId; nodeFor: NodeFor; popped?: Popped }) {
  const { layout } = p
  const ids = groupsIn(layout, win)
  const shown = ids.includes(layout.activeGroup) ? layout.activeGroup : ids[0]
  // In the main window that group's tab strip makes room for the app's corner while the sidebar is closed (CSS).
  const corner = win === MAIN ? cornerOf(layout.windows[win].root) : null
  // A popped-out window's way back sits in its top-right group's strip, once per window.
  const dockAt = win === MAIN ? null : topRightOf(layout.windows[win].root)
  // The main window's count of tabs in popped-out windows: in its top-right group's strip, while there are some.
  // A pane-mode page's way to the full app sits in the main window's top-right group's strip, once.
  const fullAppAt = win === MAIN && p.onOpenFullApp ? topRightOf(layout.windows[win].root) : null
  const elsewhereAt = win === MAIN && popped.length > 0 ? topRightOf(layout.windows[win].root) : null
  return (
    <div className="wb-win">
      <SplitView
        root={layout.windows[win].root}
        renderGroup={(id) => (
          <GroupView
            p={p}
            win={win}
            group={layout.groups[id]}
            shown={id === shown}
            corner={id === corner}
            dock={id === dockAt}
            fullApp={id === fullAppAt}
            elsewhere={id === elsewhereAt ? popped : undefined}
            nodeFor={nodeFor}
          />
        )}
        onResize={(path, sizes) => p.on.resize(win, path, sizes)}
      />
    </div>
  )
}

type Size = { width: number; height: number }

type GroupProps = {
  p: WorkbenchProps
  win: WindowId
  group: Group
  shown: boolean
  corner: boolean
  dock: boolean
  /** Open full app (a pane-mode page), in this group's strip. */
  fullApp: boolean
  /** The popped-out windows, for the main window's count of their tabs (one group shows it). */
  elsewhere?: Popped
  nodeFor: NodeFor
}

function GroupView({ p, win, group: g, shown, corner, dock, fullApp, elsewhere, nodeFor }: GroupProps) {
  const { layout, docs, on } = p
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)
  // The pane's scroller, for its back-to-top button (outside it, so the button stays put while the page scrolls).
  const [body, setBody] = useState<HTMLDivElement | null>(null)
  const focused = layout.activeGroup === g.id
  const tabs = g.tabs.map((id) => layout.tabs[id]).filter(Boolean)
  const activeTab = g.active !== null ? layout.tabs[g.active] : undefined
  const keep = mountedTabs(g)
  const order = groupsIn(layout, win)
  const next = order[order.indexOf(g.id) + 1] as string | undefined

  useEffect(() => {
    const el = root.current
    if (!el) return
    const watch = new (ownWindow(el).ResizeObserver)(() => {
      const r = el.getBoundingClientRect()
      setSize({ width: r.width, height: r.height })
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // The new group shows a copy of the active tab (the host decides what a copy is).
  const splitHere = (dir: 'row' | 'column') => {
    if (size && !canSplit(size, dir)) return
    on.split(g.id, dir, 'after')
  }

  const context = (): GroupContext => ({
    tabCount: tabs.length,
    size,
    groupsInWindow: order.length,
    inMain: win === MAIN,
    next: next !== undefined,
    canPopOut: p.canPopOut,
  })

  const items = (entries: MenuEntry[], run: (action: MenuAction) => void): MenuItem[] =>
    entries.map((e) =>
      e === 'separator' ? e : { label: e.label, shortcut: e.shortcut, disabled: e.disabled, reason: e.reason, onSelect: () => run(e.action) },
    )

  const openTabMenu = (id: string, at: { x: number; y: number }) => {
    const tab = layout.tabs[id]
    const el = root.current
    if (!tab || !el) return
    const run = (a: MenuAction) => {
      if (a === 'close') on.close([id])
      else if (a === 'closeOthers') on.closeOthers(id)
      else if (a === 'closeAll') on.closeAll(g.id)
      else if (a === 'splitRight') on.split(g.id, 'row', 'after', id)
      else if (a === 'splitDown') on.split(g.id, 'column', 'after', id)
      else if (a === 'popOutTab') on.popOut(g.id, id)
      else if (a === 'duplicate') on.duplicate(id)
      else if (a === 'reveal') on.revealInExplorer(tab)
      else if (a === 'copyPath') {
        const text = copyPathText(tab, docs, p.findPlace)
        if (text !== null) on.copyText(text)
      }
    }
    const mac = isMac(ownWindow(el).navigator.platform)
    openMenu(items(tabMenu(tab, docs, context(), mac), run), { ...at, doc: el.ownerDocument })
  }

  const openGroupMenu = (anchor: Element) => {
    const run = (a: MenuAction) => {
      if (a === 'splitRight') splitHere('row')
      else if (a === 'splitDown') splitHere('column')
      else if (a === 'join') {
        if (next !== undefined) on.join(g.id, next)
      } else if (a === 'popOut') on.popOut(g.id)
      else if (a === 'duplicate') {
        if (g.active) on.duplicate(g.active)
      } else if (a === 'dock') on.dock(win)
      else if (a === 'closeAll') on.closeAll(g.id)
    }
    openMenu(items(groupMenu(context()), run), { anchor })
  }

  // Each popped-out window by its tabs' titles (choosing one brings it to the front), then Dock all.
  const elsewhereCount = elsewhere?.reduce((n, w) => n + w.tabs.length, 0) ?? 0
  const openElsewhereMenu = (anchor: Element) => {
    if (!elsewhere) return
    const windows: MenuItem[] = elsewhere.map((w) => ({
      label: w.tabs.flatMap((id) => (layout.tabs[id] ? [tabTitle(layout.tabs[id], docs, p.findPlace)] : [])).join(', '),
      onSelect: () => p.popups[w.win]?.focus(),
    }))
    openMenu([...windows, 'separator', { label: 'Dock all', onSelect: () => elsewhere.forEach((w) => on.dock(w.win)) }], { anchor })
  }

  const dropTabs = (payload: DragPayload, index: number) => {
    if (payload.kind !== TAB_KIND) return
    payload.ids.filter((id) => layout.tabs[id]).forEach((id, i) => on.move(id, g.id, index + i))
  }

  const dropOnPane = (payload: DragPayload, zone: 'left' | 'right' | 'top' | 'bottom' | 'center') => {
    if (payload.kind !== TAB_KIND || !layout.tabs[payload.ids[0]]) return
    if (zone === 'center') return dropTabs(payload, g.tabs.length)
    const dir = zone === 'left' || zone === 'right' ? 'row' : 'column'
    if (size && !canSplit(size, dir)) return
    on.split(g.id, dir, zone === 'left' || zone === 'top' ? 'before' : 'after', payload.ids[0], true)
  }

  const keyDown = (e: KeyboardEvent<HTMLElement>) => {
    const el = root.current
    if (!el || isEditable(e.target) || !matches(e.nativeEvent, SPLIT_KEY, isMac(ownWindow(el).navigator.platform))) return
    e.preventDefault()
    splitHere('row')
  }

  const crumbs = activeTab ? p.crumbs(activeTab) : []
  const mac = isMac(navigator.platform)

  return (
    <div
      ref={root}
      data-group={g.id}
      className={`wb-group${shown ? ' is-shown' : ''}${focused ? ' is-focused' : ''}${corner ? ' is-corner' : ''}`}
      onPointerDownCapture={() => !focused && on.activateGroup(g.id)}
      onFocus={() => !focused && on.activateGroup(g.id)}
      onKeyDown={keyDown}
    >
      <TabStrip
        group={`Tab group ${allGroups(layout).indexOf(g.id) + 1}`}
        tabs={tabs.map((t) => ({
          id: t.id,
          title: tabTitle(t, docs, p.findPlace),
          description: tabDescription(t, docs, p.findPlace),
          tooltip: tabTooltip(t, docs, p.findPlace),
          dirty: tabDirty(t, docs),
        }))}
        active={g.active}
        focused={focused}
        dragKind={TAB_KIND}
        onActivate={on.activate}
        onClose={(id) => on.close([id])}
        onMove={(id, index) => on.move(id, g.id, index)}
        onDrop={dropTabs}
        canDrop={(payload) => payload.kind === TAB_KIND}
        onContextMenu={openTabMenu}
        actions={
          <>
            {dock && (
              <IconButton label="Dock" title="Dock: move back to the main window" onClick={() => on.dock(win)}>
                <DockIcon />
              </IconButton>
            )}
            {fullApp && (
              <IconButton
                label="Open full app"
                title="Open full app: show the sidebar and the rest of the app"
                onClick={() => p.onOpenFullApp?.()}
              >
                <DockIcon />
              </IconButton>
            )}
            {elsewhereCount > 0 && (
              <IconButton label={elsewhereText(elsewhereCount)} className="wb-elsewhere" onClick={(e) => openElsewhereMenu(e.currentTarget)}>
                <span className="wb-elsewhere-mark">
                  <OpenIcon />
                </span>
                <span className="wb-elsewhere-count">{elsewhereCount}</span>
              </IconButton>
            )}
            <IconButton
              label="Split right"
              title={`Split right (${mac ? '⌘\\' : 'Ctrl+\\'})`}
              disabled={!!size && !canSplit(size, 'row')}
              onClick={() => splitHere('row')}
            >
              <SplitIcon />
            </IconButton>
            <IconButton label="More" title="More actions for this group" onClick={(e) => openGroupMenu(e.currentTarget)}>
              <MoreIcon />
            </IconButton>
          </>
        }
      />
      <div className="wb-pane">
        {/* The pane's top, above what scrolls (so nothing passes under it). */}
        {activeTab && crumbs.length > 0 && <PaneHead crumbs={crumbs} onCrumb={(route) => p.onCrumb(activeTab.id, route)} />}
        <div className="pane-body" ref={setBody}>
          {tabs
            .filter((t) => keep.has(t.id))
            .map((t) => (
              <div
                key={t.id}
                className="wb-tab"
                hidden={t.id !== g.active}
                ref={(slot) => {
                  const node = nodeFor(win, t.id)
                  if (slot && node.parentNode !== slot) slot.appendChild(node)
                }}
              />
            ))}
          {tabs.length === 0 && (p.renderEmpty ? p.renderEmpty(g.id) : <p className="wb-empty">No tab open</p>)}
        </div>
        {body && <BackToTop scroller={body} />}
        <DropZones
          accept={(payload) => payload.kind === TAB_KIND && !!layout.tabs[payload.ids[0]]}
          acceptZone={(_, z) => z === 'center' || !size || canSplit(size, z === 'left' || z === 'right' ? 'row' : 'column')}
          onDrop={dropOnPane}
        />
      </div>
    </div>
  )
}
