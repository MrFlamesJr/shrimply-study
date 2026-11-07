import { useEffect, useRef, useState } from 'react'
import { FORMATS, type Course, type Format, type Library, type Quiz } from './model'
import { slug } from './logic/names'

// Hash routes, by name. Each name is written as its slug ("Les vers" > les-vers):
//   #/                                 home (all courses)
//   #/<course>                         one course
//   #/<course>/<quiz>                  quiz page (pick a study mode, see the cards)
//   #/<course>/<quiz>/edit             edit the quiz's cards
//   #/<course>/<quiz>/study/<format>   full-screen study session
//   #/_debug                           test tools (not linked; _debug is never a slug)
//   #/_changelog                       every release's notes, full screen (from What's new on home)
//   #/_drive/<file id>                 a library shared on Google Drive: opens it, then goes home
// `course` and `quiz` hold names, or the slugs read from the address; `resolve` matches both.
export type Route =
  | { name: 'home' }
  | { name: 'debug' }
  | { name: 'changelog' }
  | { name: 'drive'; id: string }
  | { name: 'course'; course: string }
  | { name: 'quiz'; course: string; quiz: string }
  | { name: 'edit'; course: string; quiz: string }
  | { name: 'study'; course: string; quiz: string; format: Format }

export function parseHash(hash: string): Route {
  let parts: string[]
  try {
    parts = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  } catch {
    return { name: 'home' } // a broken %-escape
  }
  const [course, quiz, sub, format] = parts
  if (course === '_debug') return { name: 'debug' }
  if (course === '_changelog') return { name: 'changelog' }
  if (course === '_drive') return quiz ? { name: 'drive', id: quiz } : { name: 'home' }
  if (!course) return { name: 'home' }
  if (!quiz) return { name: 'course', course }
  if (sub === 'edit') return { name: 'edit', course, quiz }
  if (sub === 'study' && (FORMATS as readonly string[]).includes(format)) return { name: 'study', course, quiz, format: format as Format }
  return { name: 'quiz', course, quiz }
}

const part = (name: string) => encodeURIComponent(slug(name))

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'debug':
      return '#/_debug'
    case 'changelog':
      return '#/_changelog'
    case 'drive':
      return `#/_drive/${encodeURIComponent(route.id)}`
    case 'course':
      return `#/${part(route.course)}`
    case 'quiz':
      return `#/${part(route.course)}/${part(route.quiz)}`
    case 'edit':
      return `#/${part(route.course)}/${part(route.quiz)}/edit`
    case 'study':
      return `#/${part(route.course)}/${part(route.quiz)}/study/${route.format}`
  }
}

/**
 * The course and quiz a route names, compared by slug, as far as they exist (a gone quiz still gives its course).
 * `missing` says which one is not in the library: deleted, renamed, or an old link or one from another file.
 */
export function resolve(library: Library, route: Route): { course?: Course; quiz?: Quiz; missing?: 'course' | 'quiz' } {
  if (!('course' in route)) return {}
  const course = library.courses.find((c) => slug(c.name) === slug(route.course))
  if (!course) return { missing: 'course' }
  if (!('quiz' in route)) return { course }
  const quiz = course.quizzes.find((q) => slug(q.name) === slug(route.quiz))
  return quiz ? { course, quiz } : { course, missing: 'quiz' }
}

type Place = ReturnType<typeof resolve>

// The same course and quiz, found again by id (after a rename).
function sameIds(library: Library, { course, quiz }: Place): Place | undefined {
  const c = course && library.courses.find((x) => x.id === course.id)
  const q = quiz && c?.quizzes.find((x) => x.id === quiz.id)
  return c && (!quiz || q) ? { course: c, quiz: q } : undefined
}

// Browsers limit how often a page may change its address (Safari: 100 times in 30 seconds), so after a rename
// the address follows once the typing pauses.
const ADDRESS_DELAY = 300

/**
 * `resolve`, following renames: a rename leaves the address on the old name, so what was found at this address
 * stays found by id, and the address moves to the new name once the typing pauses.
 */
export function usePlace(library: Library, route: Route): Place {
  const last = useRef<{ hash: string; place: Place }>(undefined)
  const hash = location.hash
  const named = resolve(library, route)
  const renamed = named.missing && last.current?.hash === hash ? sameIds(library, last.current.place) : undefined
  useEffect(() => {
    if (!named.missing) last.current = { hash, place: named }
  })
  const target = renamed?.course && href({ ...route, course: renamed.course.name, ...(renamed.quiz && { quiz: renamed.quiz.name }) } as Route)
  useEffect(() => {
    if (!target) return
    const timer = setTimeout(() => location.replace(target), ADDRESS_DELAY)
    return () => clearTimeout(timer)
  }, [target])
  return renamed ?? named
}

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
