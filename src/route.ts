import { useEffect, useRef, useState } from 'react'
import { followRename, href, parseHash, resolve, type Found, type Nav, type Place, type Route } from './logic/routes'
import type { Library } from './model'

// The pure parts (Route, parseHash, href, resolve, Nav, followRename) live in logic/routes.ts; this file adds the
// hooks and the address bar's navigation.
export * from './logic/routes'

// Browsers limit how often a page may change its address (Safari: 100 times in 30 seconds), so after a rename
// the address follows once the typing pauses.
const ADDRESS_DELAY = 300

/** Navigate and add a history entry. */
export function go(route: Route): void {
  location.hash = href(route)
}

let createdId: string | undefined

/** Navigate to a course or quiz that was just created (`id`). Its screen selects the name once (see `takeCreated`). */
export function goToNew(id: string, route: Extract<Route, { name: 'course' | 'edit' }>): void {
  createdId = id
  go(route)
}

/** True only for the first screen that asks about the id `goToNew` just went to, so revisits never select. */
export function takeCreated(id: string): boolean {
  if (createdId !== id) return false
  createdId = undefined
  return true
}

/** Navigate without a history entry (used for redirects and leaving a session). */
export function redirect(route: Route): void {
  location.replace(href(route))
}

/** The address bar's navigation: the global functions above, with the given route as the screen's own. */
export function windowNav(route: Route): Nav {
  return { route, go, redirect, goToNew, takeCreated }
}

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
