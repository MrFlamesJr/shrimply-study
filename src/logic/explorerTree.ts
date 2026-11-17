// The Explorer's tree over the open files. Node ids: "d:<doc>", "c:<doc>:<course>", "q:<doc>:<course>:<quiz>",
// "k:<doc>:<course>:<quiz>:<card>" (ids are UUIDs, so never hold ':').
import type { Library } from '../model'
import type { TreeSource } from '../kit/tree'
import { itemName, type DocId, type Docs, type Fragment, type ItemRef, type Target } from './contentOps'

export type OpenDoc = { id: DocId; name: string; library: Library; /** The Google Drive file it is (an open library is a root, so the list does not show it again). */ driveId?: string | null }
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

// ---- Google Drive: its libraries that are not open are roots among the open files ("g:" nodes)

export type DriveFileInfo = { id: string; name: string; modified: string }
/** What Drive gives the Explorer: signed in or not, the list (kept while it refreshes), whether it is loading or failed. */
export type DriveListing = { signedIn: boolean; loading: boolean; failed: boolean; files: DriveFileInfo[] | null }
/**
 * A library in the list (`file`), and the one row it can show under it: `wait` (not expanded yet), `loading` while it
 * is read, `failed` when it could not be.
 */
export type DriveNode = { kind: 'file' | 'wait' | 'loading' | 'failed'; id: string }
/** What a closed library holds once looked at: its content, or that it is being read or could not be. */
export type Peek = Library | 'loading' | 'failed'

const TAG = { file: 'f', wait: 'w', loading: 'l', failed: 'x' } as const
export const driveNodeOf = (n: DriveNode): string => `g:${TAG[n.kind]}:${n.id}`

// The libraries peeked at are documents of the tree for the content operations, under these ids (never a real one:
// those are UUIDs).
export const peekDocId = (driveId: string): DocId => `p-${driveId}`
export const isPeekDoc = (doc: DocId): boolean => doc.startsWith('p-')
export const peekDriveId = (doc: DocId): string => doc.slice(2)
/** The peeked libraries as documents. */
export const peekDocs = (peeks: Record<string, Peek> | undefined): Docs =>
  Object.fromEntries(Object.entries(peeks ?? {}).flatMap(([id, p]) => (typeof p === 'string' ? [] : [[peekDocId(id), p]])))

/** The Drive node a tree node id names, or null for any other id. */
export function parseDriveNode(nodeId: string): DriveNode | null {
  const m = /^g:([fwlx]):(.+)$/.exec(nodeId)
  const kind = m && ({ f: 'file', w: 'wait', l: 'loading', x: 'failed' } as const)[m[1] as 'f' | 'w' | 'l' | 'x']
  return m && kind ? { kind, id: m[2] } : null
}

/** The libraries in the list that are not open (an open one is already a root, whose place says it is on Drive). */
export function closedDriveFiles(listing: DriveListing | undefined, open: OpenDoc[]): DriveFileInfo[] {
  if (!listing?.signedIn || listing.files === null) return []
  const taken = new Set(open.map((d) => d.driveId))
  return listing.files.filter((f) => !taken.has(f.id))
}

// Names compare ignoring case and accents, "2" before "10".
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/** Files, their courses, quizzes and cards (as stored, so in group order); labels from the names and `itemName`. */
export function explorerSource(open: OpenDoc[], drive?: DriveListing, peeks?: Record<string, Peek>): TreeSource {
  const docs: Docs = { ...peekDocs(peeks), ...Object.fromEntries(open.map((d) => [d.id, d.library])) }
  return {
    roots: [
      ...open.map((d) => ({ node: nodeOf({ kind: 'doc', doc: d.id }), name: d.name })),
      ...closedDriveFiles(drive, open).map((f) => ({ node: driveNodeOf({ kind: 'file', id: f.id }), name: f.name })),
    ]
      // One list, sorted by name; the sort is stable, so equal names keep the open files first.
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((r) => r.node),
    children(id) {
      const g = parseDriveNode(id)
      if (g) {
        if (g.kind !== 'file') return []
        // A library not open shows what is inside it once looked at; before that one placeholder, so it can be expanded.
        const peek = peeks?.[g.id]
        if (peek === undefined) return [driveNodeOf({ kind: 'wait', id: g.id })]
        if (peek === 'loading' || peek === 'failed') return [driveNodeOf({ kind: peek, id: g.id })]
        return peek.courses.map((c) => nodeOf({ kind: 'course', doc: peekDocId(g.id), course: c.id }))
      }
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
      const g = parseDriveNode(id)
      if (g) {
        if (g.kind === 'file') return drive?.files?.find((f) => f.id === g.id)?.name ?? ''
        return g.kind === 'loading' ? 'Loading…' : g.kind === 'failed' ? "Couldn't read this library" : 'Opening…'
      }
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
