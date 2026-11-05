import { useEffect, useState } from 'react'
import type { Format } from './model'

// Hash routes:
//   #/                         home (all courses)
//   #/course/<id>              one course
//   #/quiz/<id>                quiz page (pick a study mode, see the cards)
//   #/quiz/<id>/edit           edit the quiz's cards
//   #/quiz/<id>/study/<format> full-screen study session
//   #/debug                    test tools (not linked)
export type Route =
  | { name: 'home' }
  | { name: 'debug' }
  | { name: 'course'; id: string }
  | { name: 'quiz'; id: string }
  | { name: 'edit'; id: string }
  | { name: 'study'; id: string; format: Format }

const FORMATS: readonly string[] = ['flashcards', 'choice', 'typing'] satisfies Format[]

export function parseHash(hash: string): Route {
  const [, kind, id, sub, format] = hash.replace(/^#/, '').split('/')
  if (kind === 'debug') return { name: 'debug' }
  if (kind === 'course' && id) return { name: 'course', id }
  if (kind === 'quiz' && id) {
    if (sub === 'edit') return { name: 'edit', id }
    if (sub === 'study' && FORMATS.includes(format)) return { name: 'study', id, format: format as Format }
    return { name: 'quiz', id }
  }
  return { name: 'home' }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'debug':
      return '#/debug'
    case 'course':
      return `#/course/${route.id}`
    case 'quiz':
      return `#/quiz/${route.id}`
    case 'edit':
      return `#/quiz/${route.id}/edit`
    case 'study':
      return `#/quiz/${route.id}/study/${route.format}`
  }
}

/** Navigate and add a history entry. */
export function go(route: Route): void {
  location.hash = href(route)
}

let createdId: string | undefined

/** Navigate to a course or quiz that was just created. Its screen selects the name once (see `takeCreated`). */
export function goToNew(route: Extract<Route, { name: 'course' | 'edit' }>): void {
  createdId = route.id
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

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
