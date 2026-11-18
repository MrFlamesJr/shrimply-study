// A tab's navigation, as decisions: what a go, redirect or goToNew does to the tab's route and to the address bar.
// The host supplies the effects (`makeTabNav` in layout/tabNav.ts); this part holds no state of its own.
import type { Nav, Route } from './routes'

export type TabNavEffects = {
  /** Puts the route in the tab (the host's layout). */
  setRoute(route: Route): void
  /** Writes the route to the address bar, as a new history entry or replacing the current one. The host skips it for a tab that does not own the address (not the main window's active tab). */
  syncAddress(route: Route, mode: 'push' | 'replace'): void
}

/** The id `goToNew` left for the next screen to take once: one per tab. */
export type Created = { get(): string | undefined; set(id: string | undefined): void }

export function buildTabNav(route: Route, fx: TabNavEffects, created: Created): Nav {
  const go = (r: Route) => {
    fx.setRoute(r)
    fx.syncAddress(r, 'push')
  }
  return {
    route,
    go,
    redirect(r) {
      fx.setRoute(r)
      fx.syncAddress(r, 'replace')
    },
    goToNew(id, r) {
      created.set(id)
      go(r)
    },
    takeCreated(id) {
      if (created.get() !== id) return false
      created.set(undefined)
      return true
    },
  }
}
