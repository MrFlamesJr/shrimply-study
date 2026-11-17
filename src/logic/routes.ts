// Routes as data: what an address names, how a route is written, and what it finds in a library. Pure (no React,
// no address bar), so logic and state can use it; src/route.ts adds the hooks and the address bar's navigation.
import { FORMATS, type Course, type Format, type Library, type Quiz } from '../model'
import { slug } from './names'

// Hash routes, by name. Each name is written as its slug ("Les vers" > les-vers):
//   #/                                 home (all courses)
//   #/<course>                         one course
//   #/<course>/<quiz>                  quiz page (pick a study mode, see the cards)
//   #/<course>/<quiz>/edit             edit the quiz's cards
//   #/<course>/<quiz>/study/<format>   full-screen study session
//   #/_debug                           test tools (not linked; _debug is never a slug)
//   #/_changelog                       every release's notes, full screen (from What's new on home)
//   #/_workbench                       a demo host of the reusable kit (src/kit/demo/, not linked)
//   #/_drive/<file id>                 a library shared on Google Drive: opens it, then goes home
// `course` and `quiz` hold names, or the slugs read from the address; `resolve` matches both.
export type Route =
  | { name: 'home' }
  | { name: 'debug' }
  | { name: 'changelog' }
  | { name: 'workbench' }
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
  if (course === '_workbench') return { name: 'workbench' }
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
    case 'workbench':
      return '#/_workbench'
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

export type Place = ReturnType<typeof resolve>

// The same course and quiz, found again by id (after a rename).
export function sameIds(library: Library, { course, quiz }: Place): Place | undefined {
  const c = course && library.courses.find((x) => x.id === course.id)
  const q = quiz && c?.quizzes.find((x) => x.id === quiz.id)
  return c && (!quiz || q) ? { course: c, quiz: q } : undefined
}

/** What a screen navigates with: its tab's own route and the ways to leave it (layout/tabNav.ts makes one per tab). */
export type Nav = {
  route: Route
  go(r: Route): void
  redirect(r: Route): void
  goToNew(id: string, r: Extract<Route, { name: 'course' | 'edit' }>): void
  takeCreated(id: string): boolean
}

/** What `followRename` remembers: the address a place was found at, and the place. */
export type Found = { key: string; place: Place }

/**
 * After a rename, the place found again by id and the route that names it now; undefined when the route still
 * resolves, was not found before at this address (`last.key`), or its course or quiz is gone.
 */
export function followRename(library: Library, route: Route, last: Found | undefined): { place: Place; route: Route } | undefined {
  if (!resolve(library, route).missing || last?.key !== href(route)) return undefined
  const place = sameIds(library, last.place)
  if (!place?.course) return undefined
  return { place, route: { ...route, course: place.course.name, ...(place.quiz && { quiz: place.quiz.name }) } as Route }
}
