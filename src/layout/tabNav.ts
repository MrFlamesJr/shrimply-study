import type { Nav, Route } from '../route'
import { buildTabNav } from '../logic/tabNav'

/** What the host does for a tab: put a route in its TabData, and say whether the tab owns the address bar. */
export type TabNavOps = {
  setRoute(tabId: string, route: Route): void
  /** True for the main window's active tab only: the address bar follows that tab. */
  ownsAddress(tabId: string): boolean
  /** A route of the tab as the address writes it (with its file's part while several files are shown). */
  address(tabId: string, route: Route): string
}

// The id goToNew left for each tab's next screen (kept here, not in the Nav, which is rebuilt on every render).
const created = new Map<string, string>()

/**
 * The navigation of one tab: `route` is the tab's own (from its TabData). `go` and `redirect` update that tab's route
 * and, only when the tab owns the address bar, the hash (a new entry, or replacing it), the entry naming the tab
 * (history.state `{ tab }`) so Back and Forward return to it; `goToNew` and `takeCreated` keep a created id per tab.
 */
export function makeTabNav(tabId: string, route: Route, ops: TabNavOps): Nav {
  return buildTabNav(
    route,
    {
      setRoute: (r) => ops.setRoute(tabId, r),
      syncAddress: (r, mode) => {
        if (!ops.ownsAddress(tabId)) return
        if (mode === 'push') history.pushState({ tab: tabId }, '', ops.address(tabId, r))
        else history.replaceState({ tab: tabId }, '', ops.address(tabId, r))
      },
    },
    { get: () => created.get(tabId), set: (id) => (id === undefined ? created.delete(tabId) : created.set(tabId, id)) },
  )
}
