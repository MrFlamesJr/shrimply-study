import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BackToTop } from '../components/BackToTop'
import { IconButton } from '../components/IconButton'
import { MoreIcon, SplitIcon } from '../components/Icons'
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
  canSplit, copyPathText, groupMenu, mountedTabs, tabDescription, tabDirty, tabMenu, tabTitle, tabTooltip,
  type GroupContext, type MenuAction, type MenuEntry, type TabData, type WorkbenchDoc,
} from '../logic/workbenchActions'
import { PaneHead, type Crumb } from './PaneHead'

export type { TabData, WorkbenchDoc }

const TAB_KIND = 'tab'
const SPLIT_KEY = 'Mod+\\'

export type WorkbenchProps = {
  layout: Layout<TabData>
  docs: Record<string, WorkbenchDoc>
  /** WindowId -> its open popup (the host opened it in the click). */
  popups: Record<string, Window>
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
    resize(win: string, path: number[], sizes: number[]): void
    /** The host calls kit/windows openPopup synchronously inside this call (it comes from a click). */
    popOut(groupId: string): void
    dock(win: string): void
    saveDoc(docId: string): void
    saveAll(): void
    revealInExplorer(tab: Tab<TabData>): void
    copyText(text: string): void
  }
  /** False on touch and below 800px (the host decides). */
  canPopOut: boolean
}

// Each tab's screen renders into a node of its own (one per tab and window), which its group's slot takes in: a tab
// moved to another group in the same window keeps its screen (its state too: a study round goes on), only the node
// moves. Moved to another window it starts afresh there, as what it measured and listened to belonged to the old one.
type Slots = Map<string, HTMLElement>
const slotKey = (win: WindowId, tabId: string) => `${win} ${tabId}`

/** The main window's groups, and a popup for each other window of the layout. */
export function Workbench(p: WorkbenchProps) {
  const { layout } = p
  const nodes = useRef<Slots>(new Map())
  const nodeFor = (key: string) => {
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
      const key = slotKey(win, id)
      live.add(key)
      screens.push(createPortal(p.renderTab(tab, id === g.active), nodeFor(key), key))
    }
  }
  // Nodes of tabs no longer shown anywhere are let go.
  useEffect(() => {
    for (const key of [...nodes.current.keys()]) if (!live.has(key)) nodes.current.delete(key)
  })
  return (
    <>
      <div className="workbench">
        <WindowView p={p} win={MAIN} nodeFor={nodeFor} />
      </div>
      {Object.keys(layout.windows)
        .filter((w) => w !== MAIN && p.popups[w])
        .map((w) => {
          const first = layout.groups[groupsIn(layout, w)[0]]
          const active = first?.active ? layout.tabs[first.active] : undefined
          const title = active ? tabTitle(active, p.docs) : 'Shrimply Study'
          return (
            <Popout key={w} win={p.popups[w]} title={title} onClosed={() => p.on.dock(w)}>
              <div className="workbench is-popup">
                <div className="wb-window-head">
                  <span className="wb-window-title">{title}</span>
                  <button type="button" className="quiet" title="Move this window's tabs back into the main window" onClick={() => p.on.dock(w)}>
                    Dock
                  </button>
                </div>
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
type NodeFor = (key: string) => HTMLElement

// The group at a window's top-left corner: the first child all the way down.
const cornerOf = (n: Node): string => (n.kind === 'group' ? n.id : cornerOf(n.children[0]))

function WindowView({ p, win, nodeFor }: { p: WorkbenchProps; win: WindowId; nodeFor: NodeFor }) {
  const { layout } = p
  const ids = groupsIn(layout, win)
  const shown = ids.includes(layout.activeGroup) ? layout.activeGroup : ids[0]
  // In the main window that group's tab strip makes room for the app's corner while the sidebar is closed (CSS).
  const corner = win === MAIN ? cornerOf(layout.windows[win].root) : null
  return (
    <div className="wb-win">
      <SplitView
        root={layout.windows[win].root}
        renderGroup={(id) => <GroupView p={p} win={win} group={layout.groups[id]} shown={id === shown} corner={id === corner} nodeFor={nodeFor} />}
        onResize={(path, sizes) => p.on.resize(win, path, sizes)}
      />
    </div>
  )
}

type Size = { width: number; height: number }

function GroupView({ p, win, group: g, shown, corner, nodeFor }: { p: WorkbenchProps; win: WindowId; group: Group; shown: boolean; corner: boolean; nodeFor: NodeFor }) {
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
    anyDirty: Object.values(docs).some((d) => d.dirty),
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
      else if (a === 'popOut') on.popOut(g.id)
      else if (a === 'reveal') on.revealInExplorer(tab)
      else if (a === 'copyPath') {
        const text = copyPathText(tab, docs)
        if (text !== null) on.copyText(text)
      } else if (a === 'save') {
        if (tab.data.kind === 'doc') on.saveDoc(tab.data.doc)
      } else if (a === 'saveAll') on.saveAll()
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
      else if (a === 'closeAll') on.closeAll(g.id)
    }
    openMenu(items(groupMenu(context()), run), { anchor })
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
          title: tabTitle(t, docs),
          description: tabDescription(t, docs),
          tooltip: tabTooltip(t, docs),
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
                  const node = nodeFor(slotKey(win, t.id))
                  if (slot && node.parentNode !== slot) slot.appendChild(node)
                }}
              />
            ))}
          {tabs.length === 0 && <p className="wb-empty">No tab open</p>}
        </div>
        {body && <BackToTop scroller={body} />}
        <DropZones accept={(payload) => payload.kind === TAB_KIND} onDrop={dropOnPane} />
      </div>
    </div>
  )
}
