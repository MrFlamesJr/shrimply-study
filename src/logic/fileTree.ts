// The sidebar's tree: open files > courses > quizzes. It reuses the Explorer's node ids and name order.
import type { Library } from '../model'
import type { TreeSource } from '../kit/tree'
import type { DocId } from './contentOps'
import { explorerSource, nodeOf, type OpenDoc } from './explorerTree'
import { plural } from './plural'

/** The Explorer's source, without the cards: a quiz is a leaf. */
export function fileTreeSource(open: OpenDoc[]): TreeSource {
  const src = explorerSource(open)
  return { ...src, children: (id) => (id.startsWith('q:') ? [] : src.children(id)) }
}

/** `expanded` with the file and the course open; the same set when they already are. */
export function unfoldFor(expanded: ReadonlySet<string>, doc: DocId | null, course: string | null): ReadonlySet<string> {
  if (doc === null) return expanded
  const ids = [`d:${doc}`, ...(course !== null ? [`c:${doc}:${course}`] : [])]
  if (ids.every((id) => expanded.has(id))) return expanded
  return new Set([...expanded, ...ids])
}

/** How many courses, quizzes and cards a library holds (the hover card's figures). */
export function libraryCounts(lib: Library): { courses: number; quizzes: number; cards: number } {
  const quizzes = lib.courses.flatMap((c) => c.quizzes)
  return { courses: lib.courses.length, quizzes: quizzes.length, cards: quizzes.reduce((n, q) => n + q.cards.length, 0) }
}

/** "3 courses · 12 quizzes · 456 cards". */
export function countLine(lib: Library): string {
  const n = libraryCounts(lib)
  if (n.courses === 0) return 'No courses yet'
  return [plural(n.courses, 'course'), plural(n.quizzes, 'quiz', 'quizzes'), plural(n.cards, 'card')].join(' · ')
}

/**
 * The lines of a file's hover card. `problem` is the save status in words while a save needs attention (null when
 * not); `saved` that everything is saved to Google Drive.
 */
export function fileInfo(f: {
  where: string
  driveName: string | null
  shared: boolean
  problem: string | null
  saved: boolean
  counts: string
}): string[] {
  return [
    f.where,
    ...(f.driveName ? [f.driveName] : []),
    ...(f.shared ? ['Shared with a link'] : []),
    f.counts,
    ...(f.problem ? [f.problem] : f.saved ? ['All changes saved'] : []),
  ]
}

/**
 * The tree node of the page shown (the sidebar's selected row, the Explorer's dashed one): the course or quiz `current`
 * names in the active file, else that file's home; null with no active file.
 */
export function pageNode(doc: DocId | null, lib: Library | null | undefined, current: string | null | undefined): string | null {
  if (!doc || !lib) return null
  const home = nodeOf({ kind: 'doc', doc })
  if (!current) return home
  const course = lib.courses.find((c) => c.id === current)
  if (course) return nodeOf({ kind: 'course', doc, course: course.id })
  const holder = lib.courses.find((c) => c.quizzes.some((q) => q.id === current))
  return holder ? nodeOf({ kind: 'quiz', doc, course: holder.id, quiz: current }) : home
}
