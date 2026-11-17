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
//   #/_changelog                       What's new (every release's notes), opened as a tab
//   #/_explorer, #/_welcome            the Explorer and the welcome page, as tabs
//   #/_how-to-study                    How studying works (the tips for every card kind), opened as a tab
//   #/_empty                           no page: the focused group is empty (or shows a hidden file)
//   #/_workbench                       a demo host of the reusable kit (src/kit/demo/, not linked)
//   #/_drive/<file id>                 a library shared on Google Drive: opens it, then goes home
// `course` and `quiz` hold names, or the slugs read from the address; `resolve` matches both. With several files open,
// a file's page also names its file: `#/<course>?file=<file>` (`parseAddress`, `addressOf`, `fileKeys`). `&pane` asks for
// pane mode: just that page in the workbench, no sidebar (a popped-out window's address).
export type Route =
  | { name: 'home' }
  | { name: 'debug' }
  | { name: 'changelog' }
  | { name: 'explorer' }
  | { name: 'welcome' }
  | { name: 'studyTips' }
  | { name: 'empty' }
  | { name: 'workbench' }
  | { name: 'drive'; id: string }
  | { name: 'course'; course: string }
  | { name: 'quiz'; course: string; quiz: string }
  | { name: 'edit'; course: string; quiz: string }
  | { name: 'study'; course: string; quiz: string; format: Format }

export function parseHash(hash: string): Route {
  let parts: string[]
  try {
    parts = hash.replace(/^#\/?/, '').replace(/\?.*$/, '').split('/').map(decodeURIComponent)
  } catch {
    return { name: 'home' } // a broken %-escape
  }
  const [course, quiz, sub, format] = parts
  if (course === '_debug') return { name: 'debug' }
  if (course === '_changelog') return { name: 'changelog' }
  if (course === '_explorer') return { name: 'explorer' }
  if (course === '_welcome') return { name: 'welcome' }
  if (course === '_how-to-study') return { name: 'studyTips' }
  if (course === '_empty') return { name: 'empty' }
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
    case 'explorer':
      return '#/_explorer'
    case 'welcome':
      return '#/_welcome'
    case 'studyTips':
      return '#/_how-to-study'
    case 'empty':
      return '#/_empty'
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
 * An address: its route, the file it names (`?file=`, null when it names none: one file open, or an old link) and
 * whether it asks for pane mode (`pane` in the query).
 */
export function parseAddress(hash: string): { route: Route; file: string | null; pane: boolean } {
  const query = hash.match(/\?(.*)$/)?.[1] ?? ''
  let file: string | null = null
  let pane = false
  try {
    const params = new URLSearchParams(query)
    file = params.get('file') || null
    pane = params.has('pane')
  } catch {
    file = null
  }
  return { route: parseHash(hash), file, pane }
}

/** A route's address, naming its file (`file`, from `fileKeys`) when several files are open, and `pane` for pane mode. */
export function addressOf(route: Route, file: string | null, pane = false): string {
  const query = [file ? `file=${encodeURIComponent(file)}` : '', pane ? 'pane' : ''].filter(Boolean).join('&')
  return query ? `${href(route)}?${query}` : href(route)
}

/**
 * The Google Drive file id a pasted link names, or null: the app's own share link from any origin (`.../#/_drive/<id>`),
 * or a Google Drive address (`/file/d/<id>/...`, `?id=<id>`). Anything else gives null.
 */
export function driveIdFromLink(text: string): string | null {
  const link = text.trim()
  const app = link.match(/#\/_drive\/([^/?#\s]+)/)
  if (app) return decodeURIComponent(app[1])
  if (!URL.canParse(link)) return null
  const url = new URL(link)
  if (!/^(drive|docs)\.google\.com$/.test(url.hostname)) return null
  return url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? url.searchParams.get('id')?.match(/^[\w-]+$/)?.[0] ?? null
}

/**
 * Each open file's part in the address: its name as a slug (without ".shrimp"), made unique among the files given
 * ("biology", "biology-2"), in their order.
 */
export function fileKeys(files: { id: string; name: string }[]): Record<string, string> {
  const keys: Record<string, string> = {}
  const taken = new Set<string>()
  for (const f of files) {
    const base = slug(f.name.replace(/\.shrimp$/i, '')) || 'file'
    let key = base
    for (let n = 2; taken.has(key); n++) key = `${base}-${n}`
    taken.add(key)
    keys[f.id] = key
  }
  return keys
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
