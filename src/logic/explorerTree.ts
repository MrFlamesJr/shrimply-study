// The Explorer's tree over the open files. Node ids: "d:<doc>", "c:<doc>:<course>", "q:<doc>:<course>:<quiz>",
// "k:<doc>:<course>:<quiz>:<card>" (ids are UUIDs, so never hold ':').
import type { Library } from '../model'
import { itemName, type DocId, type Docs, type Fragment, type ItemRef, type Target } from './contentOps'

// same shape as kit/tree TreeSource
type TreeSource = { roots: string[]; children(id: string): string[]; label(id: string): string }

export type OpenDoc = { id: DocId; name: string; library: Library }
type DocRef = { kind: 'doc'; doc: DocId }

export function nodeOf(ref: ItemRef | DocRef): string {
  if (ref.kind === 'doc') return `d:${ref.doc}`
  if (ref.kind === 'course') return `c:${ref.doc}:${ref.course}`
  if (ref.kind === 'quiz') return `q:${ref.doc}:${ref.course}:${ref.quiz}`
  return `k:${ref.doc}:${ref.course}:${ref.quiz}:${ref.card}`
}

export function refOf(nodeId: string): ItemRef | DocRef {
  const [tag, doc, course, quiz, card] = nodeId.split(':')
  if (tag === 'd') return { kind: 'doc', doc }
  if (tag === 'c') return { kind: 'course', doc, course }
  if (tag === 'q') return { kind: 'quiz', doc, course, quiz }
  if (tag === 'k') return { kind: 'card', doc, course, quiz, card }
  throw new Error(`Unknown node "${nodeId}"`)
}

/** Files, their courses, quizzes and cards (as stored, so in group order); labels from the names and `itemName`. */
export function explorerSource(open: OpenDoc[]): TreeSource {
  const docs: Docs = Object.fromEntries(open.map((d) => [d.id, d.library]))
  return {
    roots: open.map((d) => nodeOf({ kind: 'doc', doc: d.id })),
    children(id) {
      const r = refOf(id)
      const lib = docs[r.doc]
      if (!lib) return []
      if (r.kind === 'doc') return lib.courses.map((c) => nodeOf({ kind: 'course', doc: r.doc, course: c.id }))
      const course = lib.courses.find((c) => c.id === r.course)
      if (r.kind === 'course') return (course?.quizzes ?? []).map((q) => nodeOf({ kind: 'quiz', doc: r.doc, course: r.course, quiz: q.id }))
      const quiz = course?.quizzes.find((q) => q.id === r.quiz)
      if (r.kind === 'quiz') return (quiz?.cards ?? []).map((k) => nodeOf({ kind: 'card', doc: r.doc, course: r.course, quiz: r.quiz, card: k.id }))
      return []
    },
    label(id) {
      const r = refOf(id)
      return r.kind === 'doc' ? (open.find((d) => d.id === r.doc)?.name ?? '') : itemName(docs, r)
    },
  }
}

const LEVEL = { course: 0, quiz: 1, card: 2 } as const

/**
 * Where a drop or paste of `kind` lands relative to a node. Inside a quiz: its end, no group. Before or after a card:
 * that place in its quiz, in that card's group. Before or after a quiz or course: that place in its parent. On a file
 * (any position) or no node (the last file): the end of its courses. A kind that can not go there walks up to the
 * nearest parent that takes it, after the child it came from (before it, for "before"); null when none does.
 */
export function targetFor(docs: Docs, nodeId: string | null, pos: 'before' | 'inside' | 'after', kind: Fragment['kind']): Target | null {
  const node = nodeId ?? (Object.keys(docs).at(-1) !== undefined ? `d:${Object.keys(docs).at(-1)}` : null)
  if (node === null) return null
  const r = refOf(node)
  const lib = docs[r.doc]
  if (!lib) return null
  // path[0] is the file, then the course, quiz and card ids the node names
  const path = r.kind === 'doc' ? [r.doc] : r.kind === 'course' ? [r.doc, r.course] : r.kind === 'quiz' ? [r.doc, r.course, r.quiz] : [r.doc, r.course, r.quiz, r.card]
  const course = lib.courses.find((c) => c.id === path[1])
  const quiz = course?.quizzes.find((q) => q.id === path[2])
  const lists = [lib.courses, course?.quizzes, quiz?.cards]
  const at = (level: number) => lists[level - 1]?.findIndex((x) => x.id === path[level]) ?? -1
  if (path.slice(1).some((_, i) => at(i + 1) < 0)) return null

  const need = LEVEL[kind]
  let level = path.length - 1
  let index: number | undefined
  let after = pos !== 'before'
  if (level === 0) after = true
  else if (pos !== 'inside' || level === 3) {
    index = at(level) + (pos === 'before' ? 0 : 1)
    level--
  }
  while (level > need) {
    index = at(level) + (after ? 1 : 0)
    level--
  }
  if (level < need) return null
  if (level === 0) return { kind: 'doc', doc: path[0], index }
  if (level === 1) return { kind: 'course', doc: path[0], course: path[1], index }
  const fromCard = r.kind === 'card' && index !== undefined && pos !== 'inside'
  const group = fromCard ? quiz?.cards[at(3)]?.group : undefined
  return {
    kind: 'quiz', doc: path[0], course: path[1], quiz: path[2], index,
    group: group && quiz?.groups.some((g) => g.id === group) ? group : null,
  }
}
