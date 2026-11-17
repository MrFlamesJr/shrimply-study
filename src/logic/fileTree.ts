// The sidebar's tree: open files > courses > quizzes. It reuses the Explorer's node ids and name order.
import type { Library } from '../model'
import type { TreeSource } from '../kit/tree'
import type { DocId } from './contentOps'
import { explorerSource, type OpenDoc } from './explorerTree'
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

/** The lines of a file's hover card. */
export function fileInfo(f: {
  where: string
  fileName: string | null
  driveName: string | null
  shared: boolean
  newer: boolean
  dirty: boolean
  hasHome: boolean
  counts: string
}): string[] {
  const name = f.driveName ?? f.fileName
  return [
    f.where,
    ...(name ? [name] : []),
    ...(f.shared ? ['Shared with a link'] : []),
    ...(f.newer ? ['A newer version is on Google Drive'] : []),
    f.counts,
    ...(f.dirty ? ['Unsaved changes'] : f.hasHome ? ['All changes saved'] : []),
  ]
}
