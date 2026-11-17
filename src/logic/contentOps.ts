// Copying, moving and deleting courses, quizzes and cards across open files. All pure: the inputs are never changed,
// and a refused operation throws before anything is built (all or nothing).
import { isTermCard, newId, type Card, type Course, type Group, type Library, type Quiz, type Sides } from '../model'
import { parseCloze } from './cloze'
import { inGroupOrder } from './groups'
import { copyName } from './names'
import { addSideType, isPreset } from './sides'

export type DocId = string
export type Docs = Record<DocId, Library>
export type ItemRef =
  | { kind: 'course'; doc: DocId; course: string }
  | { kind: 'quiz'; doc: DocId; course: string; quiz: string }
  | { kind: 'card'; doc: DocId; course: string; quiz: string; card: string }
export type Target =
  | { kind: 'doc'; doc: DocId; index?: number }
  | { kind: 'course'; doc: DocId; course: string; index?: number }
  | { kind: 'quiz'; doc: DocId; course: string; quiz: string; index?: number; group?: string | null }
export type Fragment =
  | { kind: 'course'; courses: Course[]; sideTypes: Sides[] }
  | { kind: 'quiz'; quizzes: Quiz[]; sideTypes: Sides[] }
  | { kind: 'card'; cards: { card: Card; group: Group | null }[]; sideTypes: Sides[] }

const GONE = 'That is no longer there.'
const WHERE = { course: 'a file', quiz: 'a course', card: 'a quiz' } as const
const TARGET_KIND = { course: 'doc', quiz: 'course', card: 'quiz' } as const

// Where an item is: its places in the lists (-1 when the level does not apply).
type Loc = { ref: ItemRef; doc: number; c: number; q: number; k: number }

function locate(docs: Docs, ref: ItemRef): Loc | null {
  const doc = Object.keys(docs).indexOf(ref.doc)
  if (doc < 0) return null
  const c = docs[ref.doc].courses.findIndex((x) => x.id === ref.course)
  if (c < 0) return null
  if (ref.kind === 'course') return { ref, doc, c, q: -1, k: -1 }
  const quiz = docs[ref.doc].courses[c].quizzes
  const q = quiz.findIndex((x) => x.id === ref.quiz)
  if (q < 0) return null
  if (ref.kind === 'quiz') return { ref, doc, c, q, k: -1 }
  const k = quiz[q].cards.findIndex((x) => x.id === ref.card)
  return k < 0 ? null : { ref, doc, c, q, k }
}

// The items in document order, each once. Throws when one is missing.
function locateAll(docs: Docs, refs: ItemRef[]): Loc[] {
  const locs = refs.map((r) => locate(docs, r) ?? fail(GONE))
  locs.sort((a, b) => a.doc - b.doc || a.c - b.c || a.q - b.q || a.k - b.k)
  return locs.filter((l, i) => i === 0 || l.doc !== locs[i - 1].doc || l.c !== locs[i - 1].c || l.q !== locs[i - 1].q || l.k !== locs[i - 1].k)
}

function fail(reason: string): never {
  throw new Error(reason)
}

// The key of the list an item sits in, and of the list a target holds.
const itemParent = (r: ItemRef): string =>
  r.kind === 'course' ? r.doc : r.kind === 'quiz' ? `${r.doc}:${r.course}` : `${r.doc}:${r.course}:${r.quiz}`
const targetList = (t: Target): string =>
  t.kind === 'doc' ? t.doc : t.kind === 'course' ? `${t.doc}:${t.course}` : `${t.doc}:${t.course}:${t.quiz}`

const ownPairs = (cards: Card[], into: Sides[]): Sides[] =>
  cards.reduce((types, c) => (isTermCard(c) && c.sides && !isPreset(c.sides) ? addSideType(types, c.sides) : types), into)

const clone = <T>(x: T): T => structuredClone(x)

/** Deep copies of the items, in document order whatever the order of `refs`. Throws on mixed kinds or a missing item. */
export function extract(docs: Docs, refs: ItemRef[]): Fragment {
  if (refs.length === 0) fail('Nothing is selected.')
  if (refs.some((r) => r.kind !== refs[0].kind)) fail('Pick items of one kind.')
  const locs = locateAll(docs, refs)
  const kind = refs[0].kind
  if (kind === 'course') {
    const courses = locs.map((l) => clone(docs[l.ref.doc].courses[l.c]))
    return { kind, courses, sideTypes: courses.reduce((t, c) => c.quizzes.reduce((u, q) => ownPairs(q.cards, u), t), [] as Sides[]) }
  }
  if (kind === 'quiz') {
    const quizzes = locs.map((l) => clone(docs[l.ref.doc].courses[l.c].quizzes[l.q]))
    return { kind, quizzes, sideTypes: quizzes.reduce((t, q) => ownPairs(q.cards, t), [] as Sides[]) }
  }
  const cards = locs.map((l) => {
    const quiz = docs[l.ref.doc].courses[l.c].quizzes[l.q]
    const card = clone(quiz.cards[l.k])
    const group = quiz.groups.find((g) => g.id === card.group)
    return { card, group: group ? clone(group) : null }
  })
  return { kind, cards, sideTypes: ownPairs(cards.map((e) => e.card), []) }
}

// Why a target does not take items of `kind`, or null.
function targetProblem(docs: Docs, kind: Fragment['kind'], target: Target): string | null {
  if (target.kind !== TARGET_KIND[kind]) return `A ${kind} can only go in ${WHERE[kind]}.`
  const lib = docs[target.doc]
  if (!lib) return GONE
  if (target.kind === 'doc') return null
  const course = lib.courses.find((c) => c.id === target.course)
  if (!course) return GONE
  if (target.kind === 'course') return null
  const quiz = course.quizzes.find((q) => q.id === target.quiz)
  if (!quiz) return GONE
  if (typeof target.group === 'string' && !quiz.groups.some((g) => g.id === target.group)) return 'That group is no longer there.'
  return null
}

const insertAt = <T>(list: T[], index: number | undefined, items: T[]): T[] => {
  const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length))
  return [...list.slice(0, at), ...items, ...list.slice(at)]
}

// The list a target holds, for comparing before and after.
function listOf(docs: Docs, t: Target): { id: string; group?: string }[] {
  const lib = docs[t.doc]
  if (t.kind === 'doc') return lib.courses
  const course = lib.courses.find((c) => c.id === t.course)!
  if (t.kind === 'course') return course.quizzes
  return course.quizzes.find((q) => q.id === t.quiz)!.cards
}

/** null when allowed, else a plain reason. */
export function canPlace(docs: Docs, refs: ItemRef[], target: Target, effect: 'move' | 'copy'): string | null {
  if (refs.length === 0) return 'Nothing is selected.'
  const kind = refs[0].kind
  if (refs.some((r) => r.kind !== kind)) return 'Pick items of one kind.'
  const wrong = targetProblem(docs, kind, target)
  if (wrong) return wrong
  if (refs.some((r) => !locate(docs, r))) return GONE
  if (effect === 'move' && refs.every((r) => itemParent(r) === targetList(target))) {
    const before = listOf(docs, target)
    const after = listOf(moveCore(docs, locateAll(docs, refs), target).docs, target)
    if (before.length === after.length && before.every((x, i) => x.id === after[i].id && x.group === after[i].group)) {
      return 'That is already there.'
    }
  }
  return null
}

function withTypes(lib: Library, pairs: Sides[]): Library {
  const types = pairs.reduce((t, p) => addSideType(t, p), lib.sideTypes ?? [])
  return types === (lib.sideTypes ?? []) ? lib : { ...lib, sideTypes: types }
}

// The id an item takes from the old one.
type IdFor = (id: string) => string

const withIds = (q: Quiz, idFor: IdFor): Quiz => {
  const ids = new Map(q.groups.map((g) => [g.id, idFor(g.id)]))
  return {
    ...q,
    id: idFor(q.id),
    groups: q.groups.map((g) => ({ ...g, id: ids.get(g.id)! })),
    cards: q.cards.map(({ group, ...card }) => ({ ...card, id: idFor(card.id), ...(group !== undefined && ids.has(group) && { group: ids.get(group) }) }) as Card),
  }
}

// Every id in a library: courses, quizzes, groups and cards.
const libraryIds = (lib: Library): Set<string> =>
  new Set(lib.courses.flatMap((c) => [c.id, ...c.quizzes.flatMap((q) => [q.id, ...q.groups.map((g) => g.id), ...q.cards.map((k) => k.id)])]))

// Puts the fragment into the target without checking whether the operation is sensible. `fresh` gives new ids,
// null keeps them, except an id the target file already uses (a move from a file with the same ids, such as two copies
// of one backup), which gets a new one: ids never repeat within a file.
function place(docs: Docs, fragment: Fragment, target: Target, fresh: (() => string) | null): { docs: Docs; created: ItemRef[] } {
  const wrong = targetProblem(docs, fragment.kind, target)
  if (wrong) fail(wrong)
  const lib = withTypes(docs[target.doc], fragment.sideTypes)
  const set = (next: Library) => ({ ...docs, [target.doc]: next })
  const taken = libraryIds(lib)
  const idFor: IdFor = (id) => {
    const out = fresh ? fresh() : taken.has(id) ? newId() : id
    taken.add(out)
    return out
  }

  if (fragment.kind === 'course' && target.kind === 'doc') {
    const names = lib.courses.map((c) => c.name)
    const courses = fragment.courses.map((c) => {
      const name = copyName(c.name, names)
      names.push(name)
      return { ...c, id: idFor(c.id), quizzes: c.quizzes.map((q) => withIds(q, idFor)), name }
    })
    return {
      docs: set({ ...lib, courses: insertAt(lib.courses, target.index, courses) }),
      created: courses.map((c) => ({ kind: 'course', doc: target.doc, course: c.id })),
    }
  }

  if (fragment.kind === 'quiz' && target.kind === 'course') {
    const course = lib.courses.find((c) => c.id === target.course)!
    const names = course.quizzes.map((q) => q.name)
    const quizzes = fragment.quizzes.map((q) => {
      const name = copyName(q.name, names)
      names.push(name)
      return { ...withIds(q, idFor), name }
    })
    const next = { ...course, quizzes: insertAt(course.quizzes, target.index, quizzes) }
    return {
      docs: set({ ...lib, courses: lib.courses.map((c) => (c === course ? next : c)) }),
      created: quizzes.map((q) => ({ kind: 'quiz', doc: target.doc, course: course.id, quiz: q.id })),
    }
  }

  if (fragment.kind === 'card' && target.kind === 'quiz') {
    const course = lib.courses.find((c) => c.id === target.course)!
    const quiz = course.quizzes.find((q) => q.id === target.quiz)!
    const groups = [...quiz.groups]
    const groupFor = (g: Group | null): string | undefined => {
      if (target.group === null) return undefined
      if (typeof target.group === 'string') return target.group
      if (!g) return undefined
      const found = groups.find((x) => x.id === g.id && x.name === g.name) ?? groups.find((x) => x.name === g.name)
      if (found) return found.id
      // A group of another quiz: its own id, never one that quiz's group keeps.
      const id = fresh ? fresh() : newId()
      taken.add(id)
      groups.push({ id, name: g.name, color: g.color })
      return id
    }
    const cards = fragment.cards.map(({ card, group }) => {
      const { group: _old, ...rest } = card
      const gid = groupFor(group)
      return { ...rest, id: idFor(card.id), ...(gid && { group: gid }) } as Card
    })
    const next = { ...quiz, groups, cards: inGroupOrder(insertAt(quiz.cards, target.index, cards), groups) }
    return {
      docs: set({
        ...lib,
        courses: lib.courses.map((c) => (c === course ? { ...course, quizzes: course.quizzes.map((q) => (q === quiz ? next : q)) } : c)),
      }),
      created: cards.map((c) => ({ kind: 'card', doc: target.doc, course: course.id, quiz: quiz.id, card: c.id })),
    }
  }
  return fail(`A ${fragment.kind} can only go in ${WHERE[fragment.kind]}.`)
}

/** Copies the fragment into the target with fresh ids. Throws (nothing changed) when the target does not take it. */
export function insert(docs: Docs, fragment: Fragment, target: Target, newIdFn: () => string): { docs: Docs; created: ItemRef[] } {
  const count = fragment.kind === 'course' ? fragment.courses.length : fragment.kind === 'quiz' ? fragment.quizzes.length : fragment.cards.length
  if (count === 0) fail('Nothing is selected.')
  return place(docs, clone(fragment), target, newIdFn)
}

/** Deletes the items (and what is inside them). Throws when one is missing. */
export function remove(docs: Docs, refs: ItemRef[]): Docs {
  if (refs.some((r) => !locate(docs, r))) fail(GONE)
  const gone = new Set(refs.map((r) => itemKey(r)))
  const next = { ...docs }
  for (const doc of new Set(refs.map((r) => r.doc))) {
    const lib = docs[doc]
    next[doc] = {
      ...lib,
      courses: lib.courses
        .filter((c) => !gone.has(itemKey({ kind: 'course', doc, course: c.id })))
        .map((c) => {
          const course = c.quizzes
            .filter((q) => !gone.has(itemKey({ kind: 'quiz', doc, course: c.id, quiz: q.id })))
            .map((q) => {
              const cards = q.cards.filter((k) => !gone.has(itemKey({ kind: 'card', doc, course: c.id, quiz: q.id, card: k.id })))
              return cards.length === q.cards.length ? q : { ...q, cards }
            })
          return course.length === c.quizzes.length && course.every((q, i) => q === c.quizzes[i]) ? c : { ...c, quizzes: course }
        }),
    }
  }
  return next
}

const itemKey = (r: ItemRef): string => `${r.kind}:${itemParent(r)}:${r.kind === 'course' ? r.course : r.kind === 'quiz' ? r.quiz : r.card}`

// A move that has been checked: take the items out, then put them in, the index counted before the move.
function moveCore(docs: Docs, locs: Loc[], target: Target): { docs: Docs; moved: ItemRef[] } {
  const refs = locs.map((l) => l.ref)
  const fragment = extract(docs, refs)
  const here = locs.filter((l) => itemParent(l.ref) === targetList(target))
  const position = (l: Loc) => (l.ref.kind === 'course' ? l.c : l.ref.kind === 'quiz' ? l.q : l.k)
  const index = target.index === undefined ? undefined : target.index - here.filter((l) => position(l) < target.index!).length
  const placed = place(remove(docs, refs), fragment, { ...target, index }, null)
  return { docs: placed.docs, moved: placed.created }
}

/** Moves the items, keeping their ids. Within one parent it is a reorder (no rename). Throws when canPlace refuses. */
export function move(docs: Docs, refs: ItemRef[], target: Target): { docs: Docs; moved: ItemRef[] } {
  const reason = canPlace(docs, refs, target, 'move')
  if (reason) fail(reason)
  return moveCore(docs, locateAll(docs, refs), target)
}

export function exists(docs: Docs, ref: ItemRef): boolean {
  return locate(docs, ref) !== null
}

const firstText = (card: Card): string => {
  if (isTermCard(card)) return card.term
  if (card.type === 'cloze') return parseCloze(card.statement).text
  if (card.type === 'true-false') return card.statement
  if (card.type === 'choice') return card.question
  return card.title
}

/** A course or quiz name, or a card's first text (trimmed); "Empty card" when it has none. */
export function itemName(docs: Docs, ref: ItemRef): string {
  const l = locate(docs, ref) ?? fail(GONE)
  const course = docs[ref.doc].courses[l.c]
  if (ref.kind === 'course') return course.name
  const quiz = course.quizzes[l.q]
  if (ref.kind === 'quiz') return quiz.name
  return firstText(quiz.cards[l.k]).trim() || 'Empty card'
}
