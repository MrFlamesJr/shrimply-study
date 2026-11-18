import { useEffect, useRef, useState } from 'react'
import { followRename, href, parseHash, resolve, type Found, type Place, type Route } from './logic/routes'
import type { Library } from './model'

// The pure parts (Route, parseHash, href, resolve, Nav, followRename) live in logic/routes.ts; this file adds the
// hooks. Screens navigate with their tab's Nav (layout/tabNav.ts), never the address bar directly.
export * from './logic/routes'

// Browsers limit how often a page may change its address (Safari: 100 times in 30 seconds), so after a rename
// the address follows once the typing pauses.
const ADDRESS_DELAY = 300

/**
 * `resolve` for a screen with its own route (a tab), following renames: a rename leaves the route on the old name,
 * so what was found at this route stays found by id, and the new route goes to `onRouteChange` once the typing
 * pauses (browsers limit address changes, and the main window's active tab mirrors its route there).
 */
export function usePlaceFor(library: Library, route: Route, onRouteChange: (route: Route) => void): Place {
  const last = useRef<Found>(undefined)
  const change = useRef(onRouteChange)
  const key = href(route)
  const named = resolve(library, route)
  const renamed = named.missing ? followRename(library, route, last.current) : undefined
  useEffect(() => {
    change.current = onRouteChange
    if (!named.missing) last.current = { key, place: named }
  })
  const target = renamed?.route
  const targetKey = target && href(target)
  useEffect(() => {
    if (!target) return
    const timer = setTimeout(() => change.current(target), ADDRESS_DELAY)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey])
  return renamed?.place ?? named
}

/**
 * The route in the address bar. Read on every render, not kept from the last hashchange, so it always matches the
 * address, also right after a navigation in the same click as an edit (a new course, a delete).
 */
export function useRoute(): Route {
  const [, setHash] = useState(location.hash)
  useEffect(() => {
    const onChange = () => setHash(location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parseHash(location.hash)
}
