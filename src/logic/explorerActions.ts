// What the Explorer lets the user do, decided as data: menus per kind of node, keys, creating, renaming, deleting,
// dragging and moving. All pure (the inputs are never changed); the component only carries the decisions out.
import { comboLabel, matches } from '../kit/shortcuts'
import { KIND_NAME, isTermCard, type Card } from '../model'
import { canPlace, exists, extract, insert, itemName, move, remove, type DocId, type Docs, type ItemRef, type Target } from './contentOps'
import { nodeOf, refOf, targetFor } from './explorerTree'
import { freeName, nameTaken } from './names'
import { plural } from './plural'
import { sideNames } from './sides'

export type ItemKind = ItemRef['kind']
export type NodeKind = ItemKind | 'doc'
export type DocRef = { kind: 'doc'; doc: DocId }
export type Clip = { mode: 'copy' | 'cut'; refs: ItemRef[] }
type Effect = 'move' | 'copy'
type Pos = 'before' | 'inside' | 'after'

const PLACE = { course: 'a file', quiz: 'a course', card: 'a quiz' } as const
const MIXED = 'Pick items of one kind.'

/** "1 card", "3 quizzes". */
export const kindCount = (kind: ItemKind, n: number): string => (kind === 'quiz' ? plural(n, 'quiz', 'quizzes') : plural(n, kind))

// ---- Nodes and selections

/** The file or item a tree node id names, or null for an id that is not one of ours. */
export function parseNode(id: string): ItemRef | DocRef | null {
  return /^[dcqk]:/.test(id) ? refOf(id) : null
}

/** What kind the selected nodes are: null for none, 'mixed' for more than one kind. */
export function selectionKind(ids: string[]): NodeKind | 'mixed' | null {
  const kinds = new Set(ids.map((id) => parseNode(id)?.kind))
  if (kinds.size === 0) return null
  if (kinds.size > 1 || kinds.has(undefined)) return 'mixed'
  return [...kinds][0]!
}

/** The courses, quizzes and cards among the nodes (files left out), in the order given. */
export const itemRefs = (ids: string[]): ItemRef[] =>
  ids.flatMap((id) => {
    const r = parseNode(id)
    return r && r.kind !== 'doc' ? [r] : []
  })

export const docIds = (ids: string[]): DocId[] =>
  ids.flatMap((id) => {
    const r = parseNode(id)
    return r && r.kind === 'doc' ? [r.doc] : []
  })

/** What a row shows after a card's text: the names of a term card's sides, else its kind. */
export const cardDescription = (card: Card): string => {
  if (isTermCard(card)) {
    const { term, definition } = sideNames(card)
    return `${term} / ${definition}`
  }
  return KIND_NAME[card.type]
}

/** The muted text after a row's name: a file's place (marked when it has unsaved changes), a card's sides or kind. */
export function describeNode(docs: Docs, meta: Record<DocId, { where: string; dirty: boolean }>, node: string): string | null {
  const r = parseNode(node)
  if (!r) return null
  if (r.kind === 'doc') {
    const m = meta[r.doc]
    return m ? (m.dirty ? `Unsaved · ${m.where}` : m.where) : null
  }
  if (r.kind !== 'card') return null
  const found = docs[r.doc]?.courses.find((c) => c.id === r.course)?.quizzes.find((q) => q.id === r.quiz)?.cards.find((c) => c.id === r.card)
  return found ? cardDescription(found) : null
}

/** Which icon a file's row takes, by where it lives. */
export const whereIcon = (where: string): 'cloud' | 'browser' | 'file' =>
  /drive/i.test(where) ? 'cloud' : /browser/i.test(where) ? 'browser' : 'file'

// ---- Paste

/** Where a paste at a node goes (inside a file, course or quiz; after a card; the last file for no node), or why not. */
export function pasteTarget(docs: Docs, clipboard: Clip | null, node: string | null): { target: Target } | { reason: string } {
  if (!clipboard || clipboard.refs.length === 0) return { reason: 'Nothing to paste.' }
  if (Object.keys(docs).length === 0) return { reason: 'Open a file first.' }
  const kind = clipboard.refs[0].kind
  const at = node === null ? null : parseNode(node)
  const target = targetFor(docs, node, at?.kind === 'card' ? 'after' : 'inside', kind)
  if (!target) return { reason: `A ${kind} can only go in ${PLACE[kind]}.` }
  const reason = canPlace(docs, clipboard.refs, target, clipboard.mode === 'cut' ? 'move' : 'copy')
  return reason ? { reason } : { target }
}

// ---- Menus

export type Action =
  | 'newFile' | 'openFile' | 'newCourse' | 'newQuiz' | 'newCard' | 'open' | 'edit' | 'rename'
  | 'copy' | 'cut' | 'paste' | 'moveTo' | 'delete' | 'save' | 'download' | 'close'
export type Item = { action: Action; label: string; shortcut?: string; disabled?: boolean; reason?: string; danger?: boolean }
export type Entry = 'separator' | Item
export type MenuContext = { docs: Docs; names: Record<DocId, string>; clipboard: Clip | null; mac: boolean }

/** The menu for the selected nodes `ids` (none: empty space); `at` is the node pointed at, where a paste goes. */
export function menuFor(ctx: MenuContext, ids: string[], at: string | null): Entry[] {
  const sc = (combo: string) => comboLabel(combo, ctx.mac)
  const kind = selectionKind(ids)
  const item = (action: Action, label: string, extra: Partial<Item> = {}): Item => ({ action, label, ...extra })
  const only = (what: string): Partial<Item> => (ids.length > 1 ? { disabled: true, reason: `Pick one ${what}.` } : {})
  const paste = (): Item => {
    const r = pasteTarget(ctx.docs, ctx.clipboard, at)
    return item('paste', 'Paste', { shortcut: sc('Mod+V'), ...('reason' in r && { disabled: true, reason: r.reason }) })
  }

  if (kind === null) return [item('newFile', 'New file'), item('openFile', 'Open file'), 'separator', paste()]
  if (kind === 'doc') {
    return [
      item('newCourse', 'New course', only('file')),
      paste(),
      'separator',
      item('save', 'Save'),
      item('download', 'Download'),
      item('close', 'Close file'),
    ]
  }

  const mixed = kind === 'mixed'
  const refs = itemRefs(ids)
  const oneKind: Partial<Item> = mixed ? { disabled: true, reason: MIXED } : {}
  const destinations = mixed ? [] : moveDestinations(ctx.docs, ctx.names, refs)
  const moveTo = item('moveTo', 'Move to…', mixed ? oneKind : destinations.length === 0 ? { disabled: true, reason: 'There is nowhere else to move it.' } : {})
  const copy = item('copy', 'Copy', { shortcut: sc('Mod+C'), ...oneKind })
  const cut = item('cut', 'Cut', { shortcut: sc('Mod+X'), ...oneKind })
  const del = item('delete', 'Delete', {
    shortcut: 'Delete',
    danger: true,
    ...(docIds(ids).length > 0 && { disabled: true, reason: 'Close a file instead of deleting it.' }),
  })

  if (kind === 'mixed') return [copy, cut, moveTo, 'separator', del]
  if (kind === 'course') {
    return [
      item('open', 'Open', only('course')),
      item('newQuiz', 'New quiz', only('course')),
      item('rename', 'Rename', { shortcut: sc('F2'), ...only('course') }),
      'separator',
      copy, cut, paste(), moveTo,
      'separator',
      del,
    ]
  }
  if (kind === 'quiz') {
    return [
      item('open', 'Open', only('quiz')),
      item('edit', 'Edit cards', only('quiz')),
      item('newCard', 'New card', only('quiz')),
      item('rename', 'Rename', { shortcut: sc('F2'), ...only('quiz') }),
      'separator',
      copy, cut, paste(), moveTo,
      'separator',
      del,
    ]
  }
  return [item('edit', 'Edit', { shortcut: sc('F2'), ...only('card') }), 'separator', copy, cut, paste(), moveTo, 'separator', del]
}

type KeyEvent = { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }

/** What a tree key means for the selected nodes: null when it is not ours (or does not apply to this kind of node). */
export function keyDecision(ctx: MenuContext, e: KeyEvent, ids: string[], at: string | null): { action: Action } | { refuse: string } | null {
  const kind = selectionKind(ids)
  const action: Action | null = matches(e, 'Mod+C', ctx.mac) ? 'copy'
    : matches(e, 'Mod+X', ctx.mac) ? 'cut'
    : matches(e, 'Mod+V', ctx.mac) ? 'paste'
    : matches(e, 'Delete', ctx.mac) ? 'delete'
    : matches(e, 'F2', ctx.mac) ? (kind === 'card' ? 'edit' : 'rename')
    : null
  if (!action) return null
  if (action === 'delete' && kind === 'doc') return { refuse: 'Close a file instead of deleting it.' }
  const found = menuFor(ctx, ids, at).find((x): x is Item => x !== 'separator' && x.action === action)
  if (!found) return null
  return found.disabled ? { refuse: found.reason ?? 'That can not be done now.' } : { action }
}

// ---- Create

export function addCourse(docs: Docs, doc: DocId, id: string): { docs: Docs; ref: ItemRef } | null {
  const lib = docs[doc]
  if (!lib) return null
  const name = freeName('New course', lib.courses.map((c) => c.name))
  return { docs: { ...docs, [doc]: { ...lib, courses: [...lib.courses, { id, name, quizzes: [] }] } }, ref: { kind: 'course', doc, course: id } }
}

export function addQuiz(docs: Docs, doc: DocId, course: string, id: string): { docs: Docs; ref: ItemRef } | null {
  const lib = docs[doc]
  const found = lib?.courses.find((c) => c.id === course)
  if (!lib || !found) return null
  const name = freeName('New quiz', found.quizzes.map((q) => q.name))
  const next = { ...found, quizzes: [...found.quizzes, { id, name, groups: [], cards: [] }] }
  return {
    docs: { ...docs, [doc]: { ...lib, courses: lib.courses.map((c) => (c === found ? next : c)) } },
    ref: { kind: 'quiz', doc, course, quiz: id },
  }
}

/** An empty term card at the end of the quiz. */
export function addCard(docs: Docs, doc: DocId, course: string, quiz: string, id: string): { docs: Docs; ref: ItemRef } | null {
  const lib = docs[doc]
  const c = lib?.courses.find((x) => x.id === course)
  const q = c?.quizzes.find((x) => x.id === quiz)
  if (!lib || !c || !q) return null
  const nextQuiz = { ...q, cards: [...q.cards, { id, term: '', definition: '' }] }
  const nextCourse = { ...c, quizzes: c.quizzes.map((x) => (x === q ? nextQuiz : x)) }
  return {
    docs: { ...docs, [doc]: { ...lib, courses: lib.courses.map((x) => (x === c ? nextCourse : x)) } },
    ref: { kind: 'card', doc, course, quiz, card: id },
  }
}

// ---- Rename

/** Why a course or quiz can not take `name` (empty, or used by a sibling), or undefined. */
export function renameProblem(docs: Docs, ref: ItemRef, name: string): string | undefined {
  const text = name.trim()
  if (text === '') return 'Type a name'
  const lib = docs[ref.doc]
  if (!lib || ref.kind === 'card') return undefined
  if (ref.kind === 'course') return nameTaken(text, lib.courses.filter((c) => c.id !== ref.course).map((c) => c.name), 'course')
  const course = lib.courses.find((c) => c.id === ref.course)
  return nameTaken(text, (course?.quizzes ?? []).filter((q) => q.id !== ref.quiz).map((q) => q.name), 'quiz')
}

/** The docs with the course or quiz renamed (trimmed); null when it is gone, is a card or the name is refused. */
export function renameItem(docs: Docs, ref: ItemRef, name: string): Docs | null {
  if (ref.kind === 'card' || renameProblem(docs, ref, name) || !exists(docs, ref)) return null
  const text = name.trim()
  const lib = docs[ref.doc]
  const courses = lib.courses.map((c) => {
    if (c.id !== ref.course) return c
    if (ref.kind === 'course') return { ...c, name: text }
    return { ...c, quizzes: c.quizzes.map((q) => (q.id === ref.quiz ? { ...q, name: text } : q)) }
  })
  return { ...docs, [ref.doc]: { ...lib, courses } }
}

// ---- Delete

export type DeletePlan = {
  refs: ItemRef[]
  /** The undo step's name. */
  label: string
  /** The question to ask first; null for cards, which go at once. */
  question: string | null
  /** The toast afterwards. */
  notice: string
}

// Items inside another selected item go with it, so they are not counted twice.
function topmost(refs: ItemRef[]): ItemRef[] {
  const has = (f: (r: ItemRef) => boolean) => refs.some(f)
  return refs.filter((r) => {
    if (r.kind !== 'course' && has((o) => o.kind === 'course' && o.doc === r.doc && o.course === r.course)) return false
    if (r.kind === 'card' && has((o) => o.kind === 'quiz' && o.doc === r.doc && o.course === r.course && o.quiz === r.quiz)) return false
    return true
  })
}

export function deletePlan(docs: Docs, ids: string[], mac: boolean): DeletePlan | { reason: string } {
  if (docIds(ids).length > 0) return { reason: 'Close a file instead of deleting it.' }
  const refs = itemRefs(ids)
  if (refs.length === 0) return { reason: 'Nothing is selected.' }
  const top = topmost(refs)
  const what = top.every((r) => r.kind === top[0].kind) ? kindCount(top[0].kind, top.length) : plural(top.length, 'item')
  const undo = comboLabel('Mod+Z', mac)
  const notice = `Deleted ${what}. ${undo} puts ${top.length === 1 ? 'it' : 'them'} back.`
  const label = `Delete ${what}`
  if (top.every((r) => r.kind === 'card')) return { refs, label, question: null, notice }

  let question: string
  if (top.length === 1 && exists(docs, top[0])) {
    const r = top[0]
    const name = itemName(docs, r)
    const lib = docs[r.doc]
    const course = lib.courses.find((c) => c.id === r.course)!
    const count = r.kind === 'course' ? course.quizzes.length : course.quizzes.find((q) => q.id === r.quiz)!.cards.length
    const inside = r.kind === 'course' ? plural(count, 'quiz', 'quizzes') : plural(count, 'card')
    question = count === 0 ? `Delete "${name}"?` : `Delete "${name}" and its ${inside}?`
  } else {
    question = `Delete ${what} and everything in them?`
  }
  return { refs, label, question: `${question}\n\n${undo} brings it back.`, notice }
}

/** Deletes the items, checked first: never throws. */
export function removeItems(docs: Docs, refs: ItemRef[]): { ok: true; docs: Docs } | { ok: false; reason: string } {
  try {
    return { ok: true, docs: remove(docs, refs) }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'That could not be done.' }
  }
}

// ---- Placing: dragging, pasting, moving

export type Plan = { ok: true; docs: Docs; label: string; created: ItemRef[] } | { ok: false; reason: string }

/** "Move 3 cards", "Copy 1 quiz". */
export const dragLabel = (kind: ItemKind, count: number, effect: Effect): string =>
  `${effect === 'copy' ? 'Copy' : 'Move'} ${kindCount(kind, count)}`

/** What the selected nodes are as a drag: their kind, or null when they can not be dragged (files, mixed kinds). */
export function dragKind(ids: string[]): ItemKind | null {
  const kind = selectionKind(ids)
  return kind === 'course' || kind === 'quiz' || kind === 'card' ? kind : null
}

/** Whether a drop can go inside this node (a card holds nothing). */
export const allowInside = (node: string): boolean => parseNode(node)?.kind !== 'card'

/** Where `ids` dropped at `node` land, or why they can not. */
export function dropTarget(docs: Docs, ids: string[], node: string | null, pos: Pos): { target: Target } | { reason: string } {
  const refs = itemRefs(ids)
  if (refs.length === 0 || refs.length !== ids.length) return { reason: 'That can not be dropped here.' }
  const kind = refs[0].kind
  if (refs.some((r) => r.kind !== kind)) return { reason: MIXED }
  const target = targetFor(docs, node, pos, kind)
  return target ? { target } : { reason: `A ${kind} can only go in ${PLACE[kind]}.` }
}

export function dropRule(docs: Docs, ids: string[], node: string | null, pos: Pos, effect: Effect): { ok: true } | { ok: false; reason: string } {
  const t = dropTarget(docs, ids, node, pos)
  if ('reason' in t) return { ok: false, reason: t.reason }
  const reason = canPlace(docs, itemRefs(ids), t.target, effect)
  return reason ? { ok: false, reason } : { ok: true }
}

/** Moves or copies the items to the target, checked first: never throws. */
export function placeItems(docs: Docs, refs: ItemRef[], target: Target, effect: Effect, fresh: () => string): Plan {
  try {
    const reason = canPlace(docs, refs, target, effect)
    if (reason) return { ok: false, reason }
    const label = dragLabel(refs[0].kind, refs.length, effect)
    if (effect === 'move') {
      const r = move(docs, refs, target)
      return { ok: true, docs: r.docs, label, created: r.moved }
    }
    const r = insert(docs, extract(docs, refs), target, fresh)
    return { ok: true, docs: r.docs, label, created: r.created }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'That could not be done.' }
  }
}

export function dropPlan(docs: Docs, ids: string[], node: string | null, pos: Pos, effect: Effect, fresh: () => string): Plan {
  const t = dropTarget(docs, ids, node, pos)
  return 'reason' in t ? { ok: false, reason: t.reason } : placeItems(docs, itemRefs(ids), t.target, effect, fresh)
}

export type Destination = { label: string; target: Target }

/** Where else the items (of one kind) can be moved: every file, course or quiz that takes them, as a path. */
export function moveDestinations(docs: Docs, names: Record<DocId, string>, refs: ItemRef[]): Destination[] {
  if (refs.length === 0) return []
  const kind = refs[0].kind
  const out: Destination[] = []
  const here = (t: Target) => refs.every((r) => r.doc === t.doc && (t.kind === 'doc' || (r.kind !== 'course' && r.course === t.course && (t.kind === 'course' || (r.kind === 'card' && r.quiz === t.quiz)))))
  const add = (label: string, target: Target) => {
    if (!here(target) && canPlace(docs, refs, target, 'move') === null) out.push({ label, target })
  }
  for (const [doc, lib] of Object.entries(docs)) {
    const file = names[doc] ?? doc
    if (kind === 'course') add(file, { kind: 'doc', doc })
    for (const course of lib.courses) {
      if (kind === 'quiz') add(`${file} > ${course.name}`, { kind: 'course', doc, course: course.id })
      if (kind === 'card') {
        for (const quiz of course.quizzes) add(`${file} > ${course.name} > ${quiz.name}`, { kind: 'quiz', doc, course: course.id, quiz: quiz.id })
      }
    }
  }
  return out
}

/** The tree nodes to open so `ref` shows: its file, course and quiz. */
export function ancestorNodes(ref: ItemRef): string[] {
  const nodes = [nodeOf({ kind: 'doc', doc: ref.doc })]
  if (ref.kind !== 'course') nodes.push(nodeOf({ kind: 'course', doc: ref.doc, course: ref.course }))
  if (ref.kind === 'card') nodes.push(nodeOf({ kind: 'quiz', doc: ref.doc, course: ref.course, quiz: ref.quiz }))
  return nodes
}
