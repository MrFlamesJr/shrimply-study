// What the Explorer lets the user do, decided as data: menus per kind of node, keys, creating, renaming, deleting,
// dragging and moving. All pure (the inputs are never changed); the component only carries the decisions out.
import { comboLabel, matches } from '../kit/shortcuts'
import { KIND_NAME, isTermCard, type Card, type Library, type Sides } from '../model'
import { canPlace, exists, extract, insert, itemName, move, remove, ungroup, type DocId, type Docs, type ItemRef, type Target } from './contentOps'
import { whereLine } from './whereLine'
import { isPeekDoc, nodeOf, parseDriveNode, refOf, targetFor, type DriveListing, type DriveNode } from './explorerTree'
import { inGroupOrder } from './groups'
import { freeName, nameTaken } from './names'
import { plural } from './plural'
import { lastSides, sideNames } from './sides'

export type ItemKind = ItemRef['kind']
export type NodeKind = ItemKind | 'doc' | 'drivefile' | 'drivefailed' | 'driveloading'
export type DocRef = { kind: 'doc'; doc: DocId }
export type Clip = { mode: 'copy' | 'cut'; refs: ItemRef[] }
type Effect = 'move' | 'copy'
type Pos = 'before' | 'inside' | 'after'

const PLACE = { course: 'a file', quiz: 'a course', card: 'a quiz', group: 'a quiz' } as const
const MIXED = 'Pick items of one kind.'
const OPEN_FIRST = 'Open the library first.'
const READ_ONLY = 'Open the library to change it.'
const VIEW_ONLY = 'This library is view only. Make a copy to change it.'
const NONE: ReadonlySet<DocId> = new Set()

/** Whether the item is inside a library that is only looked at (not open): read-only, copy only. */
export const isPeekRef = (r: ItemRef): boolean => isPeekDoc(r.doc)
/**
 * Why nothing can be put into or changed in this file, or undefined. A library only looked at (not open) must be opened
 * first; an open view-only one (`readOnly`) is copy only, out but never in.
 */
const lockReason = (doc: DocId, readOnly: ReadonlySet<DocId>): string | undefined =>
  isPeekDoc(doc) ? READ_ONLY : readOnly.has(doc) ? VIEW_ONLY : undefined
// The list does not say whose a library is (what the app saved, or what the user picked), so no "your" here.
const NOT_OPEN_WHERE = whereLine({ drive: { shared: false, trashed: false }, yours: false, signedIn: false })
const BROWSER_WHERE = whereLine({ drive: null, yours: false, signedIn: false })
const BIN_FROM_MENU = 'Move a Google Drive library to the bin from its own menu.'

/**
 * A library that is closed but still listed: `browser` (kept in this browser), `mine` (in the signed-in user's Drive
 * list: Move to bin) or `link` (a Drive file opened from a link: Remove from list).
 */
export type ClosedKind = 'browser' | 'mine' | 'link'
const CLOSED_REMOVE: Record<ClosedKind, string> = { browser: 'Delete from this browser', mine: 'Move to bin', link: 'Remove from list' }

/** "1 card", "3 quizzes". */
export const kindCount = (kind: ItemKind, n: number): string => (kind === 'quiz' ? plural(n, 'quiz', 'quizzes') : plural(n, kind))

// ---- Nodes and selections

/** The file or item a tree node id names, or null for an id that is not one of ours. */
export function parseNode(id: string): ItemRef | DocRef | null {
  return /^[dcqkp]:/.test(id) ? refOf(id) : null
}

const driveKind = (n: DriveNode | null): NodeKind | null =>
  n === null ? null : n.kind === 'failed' ? 'drivefailed' : n.kind === 'loading' ? 'driveloading' : 'drivefile'

/** What kind the selected nodes are: null for none, 'mixed' for more than one kind. */
export function selectionKind(ids: string[]): NodeKind | 'mixed' | null {
  const kinds = new Set(ids.map((id) => driveKind(parseDriveNode(id)) ?? parseNode(id)?.kind))
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

/** A file row's state: open or not, whether it has unsaved changes, where it lives, and all of it in words. */
export type FileStatus = { open: boolean; dirty: boolean; where: string; words: string }

/**
 * What a file row shows as icons and chips: the place (the icon's tooltip), a dot for unsaved changes, a chip for a
 * library not open; `words` says all of it for a screen reader. Null for a node that is not a file.
 */
export function fileStatus(
  meta: Record<DocId, { where: string; dirty: boolean; readOnly?: boolean }>,
  node: string,
  drive?: { listing: DriveListing; closed?: Record<string, ClosedKind> },
): FileStatus | null {
  const g = parseDriveNode(node)
  if (g) {
    const found = g.kind === 'file' && drive?.listing.files?.some((f) => f.id === g.id)
    if (!found) return null
    const where = drive?.closed?.[g.id] === 'browser' ? BROWSER_WHERE : NOT_OPEN_WHERE
    return { open: false, dirty: false, where, words: `Not open, ${where}` }
  }
  const r = parseNode(node)
  const m = r?.kind === 'doc' ? meta[r.doc] : undefined
  return m ? { open: true, dirty: m.dirty, where: m.where, words: `Open, ${m.readOnly ? 'view only, ' : ''}${m.dirty ? 'needs attention, ' : ''}${m.where}` } : null
}

/** The muted text after a course, quiz or card: a card's sides or kind. Files have chips instead (`fileStatus`). */
export function describeNode(docs: Docs, node: string): string | null {
  const r = parseNode(node)
  if (r?.kind === 'group') {
    const quiz = docs[r.doc]?.courses.find((c) => c.id === r.course)?.quizzes.find((q) => q.id === r.quiz)
    return quiz ? plural(quiz.cards.filter((k) => k.group === r.group).length, 'card') : null
  }
  if (!r || r.kind !== 'card') return null
  const found = docs[r.doc]?.courses.find((c) => c.id === r.course)?.quizzes.find((q) => q.id === r.quiz)?.cards.find((c) => c.id === r.card)
  return found ? cardDescription(found) : null
}

/** Which icon a file's row takes, by where it lives. */
export const whereIcon = (where: string): 'cloud' | 'browser' | 'file' =>
  /drive/i.test(where) ? 'cloud' : /browser/i.test(where) ? 'browser' : 'file'

// ---- Paste

/** Where a paste at a node goes (inside a file, course or quiz; after a card; the last file for no node), or why not. */
export function pasteTarget(docs: Docs, clipboard: Clip | null, node: string | null, readOnly: ReadonlySet<DocId> = NONE): { target: Target } | { reason: string } {
  if (!clipboard || clipboard.refs.length === 0) return { reason: 'Nothing to paste.' }
  if (Object.keys(docs).length === 0) return { reason: 'Open a file first.' }
  if (node !== null && parseDriveNode(node)) return { reason: OPEN_FIRST }
  const kind = clipboard.refs[0].kind
  const at = node === null ? null : parseNode(node)
  // After a card; after a group when a group is pasted (else inside it: cards join it); inside the rest.
  const pos = at?.kind === 'card' || (at?.kind === 'group' && kind === 'group') ? 'after' : 'inside'
  const target = targetFor(docs, node, pos, kind)
  if (!target) return { reason: `A ${kind} can only go in ${PLACE[kind]}.` }
  const lock = lockReason(target.doc, readOnly)
  if (lock) return { reason: lock }
  const reason = canPlace(docs, clipboard.refs, target, clipboard.mode === 'cut' ? 'move' : 'copy')
  return reason ? { reason } : { target }
}

// ---- Menus

export type Action =
  | 'newFile' | 'openFile' | 'newCourse' | 'newQuiz' | 'newCard' | 'open' | 'openNew' | 'edit' | 'rename'
  | 'copy' | 'cut' | 'paste' | 'moveTo' | 'delete' | 'download' | 'close' | 'upload' | 'share' | 'makeCopy'
  | 'closedOpen' | 'closedDownload' | 'closedRemove' | 'driveRetry' | 'ungroup' | 'moveUp' | 'moveDown'
export type Item = {
  action: Action
  label: string
  shortcut?: string
  disabled?: boolean
  reason?: string
  danger?: boolean
  /** What a submenu's entry chooses (the kind of card to add). */
  arg?: NewCardKind
  submenu?: Item[]
}
export type Entry = 'separator' | Item
export type MenuContext = {
  docs: Docs
  names: Record<DocId, string>
  clipboard: Clip | null
  mac: boolean
  /** Each open file: where it lives and whether it is view only (copy only: out but never in). */
  files: Record<DocId, { place: 'drive' | 'browser'; readOnly: boolean }>
  /** The closed libraries listed, by their file node's id. */
  closed: Record<string, ClosedKind>
  /** False when Google Drive is not set up here: nothing to upload or share to. */
  driveSetUp: boolean
}

/** The open files that are view only. */
export const readOnlyOf = (files: MenuContext['files']): ReadonlySet<DocId> =>
  new Set(Object.entries(files).flatMap(([id, f]) => (f.readOnly ? [id] : [])))

/** The menu for the selected nodes `ids` (none: empty space); `at` is the node pointed at, where a paste goes. */
export function menuFor(ctx: MenuContext, ids: string[], at: string | null): Entry[] {
  const sc = (combo: string) => comboLabel(combo, ctx.mac)
  const readOnly = readOnlyOf(ctx.files)
  const kind = selectionKind(ids)
  const item = (action: Action, label: string, extra: Partial<Item> = {}): Item => ({ action, label, ...extra })
  const only = (what: string): Partial<Item> => (ids.length > 1 ? { disabled: true, reason: `Pick one ${what}.` } : {})
  const paste = (): Item => {
    const r = pasteTarget(ctx.docs, ctx.clipboard, at, readOnly)
    return item('paste', 'Paste', { shortcut: sc('Mod+V'), ...('reason' in r && { disabled: true, reason: r.reason }) })
  }

  if (kind === null) return [item('newFile', 'New file'), item('openFile', 'Open a copy from this device'), 'separator', paste()]
  if (kind === 'drivefile') {
    const kinds = new Set(ids.map((id) => ctx.closed[parseDriveNode(id)!.id]))
    return [
      item('closedOpen', 'Open', only('library')),
      item('paste', 'Paste', { shortcut: sc('Mod+V'), disabled: true, reason: OPEN_FIRST }),
      'separator',
      item('closedDownload', 'Download a copy', only('library')),
      'separator',
      item('closedRemove', kinds.size === 1 ? CLOSED_REMOVE[[...kinds][0]] : 'Remove', { shortcut: 'Delete', danger: true }),
    ]
  }
  if (kind === 'drivefailed') return [item('driveRetry', 'Retry')]
  if (kind === 'driveloading') return []
  if (kind === 'doc') {
    const file = ctx.files[docIds(ids)[0]]
    const locked = file?.readOnly ? { disabled: true, reason: VIEW_ONLY } : {}
    return [
      item('openNew', 'Open in new tab', only('file')),
      item('newCourse', 'New course', ids.length > 1 ? only('file') : locked),
      paste(),
      'separator',
      ...(file?.readOnly ? [item('makeCopy', 'Make a copy', only('file'))] : file?.place === 'browser' && ctx.driveSetUp ? [item('upload', 'Upload to Google Drive…', only('file'))] : []),
      ...(ctx.driveSetUp ? [item('share', 'Share…', only('file'))] : []),
      item('download', 'Download a copy'),
      item('close', 'Close file'),
    ]
  }

  const mixed = kind === 'mixed'
  const refs = itemRefs(ids)
  // New card: a submenu of every kind, worded as the editor's Add new card pills.
  const newCard = (extra: Partial<Item>): Item => ({
    ...item('newCard', 'New card', extra),
    submenu: NEW_CARD_KINDS.map((k) => ({ action: 'newCard' as const, label: k.label, arg: k.kind })),
  })
  // Move up and Move down: off with a reason when the item is first or last in its place.
  const reorder = (what: string): Item[] =>
    (['up', 'down'] as const).map((dir) => {
      const label = dir === 'up' ? 'Move up' : 'Move down'
      const shortcut = sc(dir === 'up' ? 'Alt+Shift+ArrowUp' : 'Alt+Shift+ArrowDown')
      if (refs.length !== 1) return item(dir === 'up' ? 'moveUp' : 'moveDown', label, { shortcut, disabled: true, reason: `Pick one ${what}.` })
      const lock = lockReason(refs[0].doc, readOnly)
      if (lock) return item(dir === 'up' ? 'moveUp' : 'moveDown', label, { shortcut, disabled: true, reason: lock })
      const t = reorderTarget(ctx.docs, refs[0], dir)
      return item(dir === 'up' ? 'moveUp' : 'moveDown', label, { shortcut, ...('reason' in t && { disabled: true, reason: t.reason }) })
    })
  // Inside a library that is not open: look and copy only.
  const locked = refs.map((r) => lockReason(r.doc, readOnly)).find((reason) => reason !== undefined)
  const ro: Partial<Item> = locked ? { disabled: true, reason: locked } : {}
  // Its own tab, beside the one that file's pages reuse (asked for: Open reuses the file's tab).
  const openNew = (what: string): Item =>
    item('openNew', 'Open in new tab', refs.some(isPeekRef) ? { disabled: true, reason: OPEN_FIRST } : only(what))
  const oneKind: Partial<Item> = mixed ? { disabled: true, reason: MIXED } : {}
  const destinations = mixed ? [] : moveDestinations(ctx.docs, ctx.names, refs, readOnly)
  const moveTo = item('moveTo', 'Move to…', ro.disabled ? ro : mixed ? oneKind : destinations.length === 0 ? { disabled: true, reason: 'There is nowhere else to move it.' } : {})
  const copy = item('copy', 'Copy', { shortcut: sc('Mod+C'), ...oneKind })
  const cut = item('cut', 'Cut', { shortcut: sc('Mod+X'), ...oneKind, ...ro })
  const del = item('delete', 'Delete', {
    shortcut: 'Delete',
    danger: true,
    ...(docIds(ids).length > 0 && { disabled: true, reason: 'Close a file instead of deleting it.' }),
    ...(ids.some((id) => parseDriveNode(id)) && { disabled: true, reason: BIN_FROM_MENU }),
    ...ro,
  })

  if (kind === 'mixed') return [copy, cut, moveTo, 'separator', del]
  if (kind === 'course') {
    return [
      item('open', 'Open', only('course')),
      openNew('course'),
      item('newQuiz', 'New quiz', { ...only('course'), ...ro }),
      item('rename', 'Rename', { shortcut: sc('F2'), ...only('course'), ...ro }),
      'separator',
      copy, cut, paste(), moveTo, ...reorder('course'),
      'separator',
      del,
    ]
  }
  if (kind === 'quiz') {
    return [
      item('open', 'Open', only('quiz')),
      openNew('quiz'),
      item('edit', 'Edit cards', { ...only('quiz'), ...ro }),
      newCard({ ...only('quiz'), ...ro }),
      item('rename', 'Rename', { shortcut: sc('F2'), ...only('quiz'), ...ro }),
      'separator',
      copy, cut, paste(), moveTo, ...reorder('quiz'),
      'separator',
      del,
    ]
  }
  if (kind === 'group') {
    return [
      item('open', 'Open', only('group')),
      openNew('group'),
      newCard({ ...only('group'), ...ro }),
      item('rename', 'Rename', { shortcut: sc('F2'), ...only('group'), ...ro }),
      'separator',
      copy, cut, paste(), moveTo, ...reorder('group'),
      'separator',
      item('ungroup', 'Ungroup', { ...only('group'), ...ro }),
      del,
    ]
  }
  return [
    item('edit', 'Edit', { shortcut: sc('F2'), ...only('card'), ...ro }),
    'separator',
    copy, cut, paste(), moveTo, ...reorder('card'),
    'separator',
    del,
  ]
}

type KeyEvent = { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }

/** What a tree key means for the selected nodes: null when it is not ours (or does not apply to this kind of node). */
export function keyDecision(ctx: MenuContext, e: KeyEvent, ids: string[], at: string | null): { action: Action } | { refuse: string } | null {
  const kind = selectionKind(ids)
  const action: Action | null = matches(e, 'Mod+C', ctx.mac) ? 'copy'
    : matches(e, 'Mod+X', ctx.mac) ? 'cut'
    : matches(e, 'Mod+V', ctx.mac) ? 'paste'
    : matches(e, 'Delete', ctx.mac) ? (kind === 'drivefile' ? 'closedRemove' : 'delete')
    : matches(e, 'F2', ctx.mac) ? (kind === 'card' ? 'edit' : 'rename')
    : matches(e, 'Alt+Shift+ArrowUp', ctx.mac) ? 'moveUp'
    : matches(e, 'Alt+Shift+ArrowDown', ctx.mac) ? 'moveDown'
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

export type NewCardKind = 'term' | 'cloze' | 'true-false' | 'choice' | 'sequence'
/** The kinds a new card can be, named as the editor's Add new card pills name them. */
export const NEW_CARD_KINDS: { kind: NewCardKind; label: string }[] = [
  { kind: 'term', label: 'Front and back' },
  { kind: 'cloze', label: 'Fill in the blank' },
  { kind: 'true-false', label: 'True or false' },
  { kind: 'choice', label: 'Choice question' },
  { kind: 'sequence', label: 'Sequence' },
]

/** An empty card of a kind, as the editor makes one (a choice question: One answer, 1 correct and 2 wrong boxes). */
export function blankCard(kind: NewCardKind, id: string, sides?: Sides, group?: string): Card {
  const where = group ? { group } : {}
  return kind === 'cloze'
    ? { id, type: 'cloze', statement: '', explanation: [], ...where }
    : kind === 'true-false'
      ? { id, type: 'true-false', statement: '', answer: true, ...where }
      : kind === 'choice'
        ? { id, type: 'choice', question: '', mode: 'one', right: [''], wrong: ['', ''], ...where }
        : kind === 'sequence'
          ? { id, type: 'sequence', title: '', steps: ['', '', ''], ...where }
          : { id, term: '', definition: '', ...(sides && { sides }), ...where }
}

/** Puts a card at the end of the quiz (or of its group). Null when the quiz or the group is gone. */
export function insertCard(docs: Docs, doc: DocId, course: string, quiz: string, card: Card): { docs: Docs; ref: ItemRef } | null {
  const lib = docs[doc]
  const c = lib?.courses.find((x) => x.id === course)
  const q = c?.quizzes.find((x) => x.id === quiz)
  if (!lib || !c || !q) return null
  if (card.group && !q.groups.some((g) => g.id === card.group)) return null
  const nextQuiz = { ...q, cards: inGroupOrder([...q.cards, card], q.groups) }
  const nextCourse = { ...c, quizzes: c.quizzes.map((x) => (x === q ? nextQuiz : x)) }
  return {
    docs: { ...docs, [doc]: { ...lib, courses: lib.courses.map((x) => (x === c ? nextCourse : x)) } },
    ref: { kind: 'card', doc, course, quiz, card: card.id },
  }
}

/** An empty card of a kind at the end of the quiz (or of a group). */
export function addCard(
  docs: Docs,
  doc: DocId,
  course: string,
  quiz: string,
  id: string,
  kind: NewCardKind = 'term',
  group?: string,
): { docs: Docs; ref: ItemRef } | null {
  const q = docs[doc]?.courses.find((x) => x.id === course)?.quizzes.find((x) => x.id === quiz)
  return q ? insertCard(docs, doc, course, quiz, blankCard(kind, id, lastSides(q.cards), group)) : null
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
  if (ref.kind === 'group') {
    const quiz = course?.quizzes.find((q) => q.id === ref.quiz)
    return nameTaken(text, (quiz?.groups ?? []).filter((g) => g.id !== ref.group).map((g) => g.name), 'group')
  }
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
    if (ref.kind === 'group') {
      return { ...c, quizzes: c.quizzes.map((q) => (q.id === ref.quiz ? { ...q, groups: q.groups.map((g) => (g.id === ref.group ? { ...g, name: text } : g)) } : q)) }
    }
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
function topmost(docs: Docs, refs: ItemRef[]): ItemRef[] {
  const has = (f: (r: ItemRef) => boolean) => refs.some(f)
  return refs.filter((r) => {
    if (r.kind !== 'course' && has((o) => o.kind === 'course' && o.doc === r.doc && o.course === r.course)) return false
    if ((r.kind === 'card' || r.kind === 'group') && has((o) => o.kind === 'quiz' && o.doc === r.doc && o.course === r.course && o.quiz === r.quiz)) return false
    // A card of a group that goes too.
    if (r.kind === 'card') {
      const card = docs[r.doc]?.courses.find((c) => c.id === r.course)?.quizzes.find((q) => q.id === r.quiz)?.cards.find((k) => k.id === r.card)
      if (card?.group && has((o) => o.kind === 'group' && o.doc === r.doc && o.course === r.course && o.quiz === r.quiz && o.group === card.group)) return false
    }
    return true
  })
}

export function deletePlan(docs: Docs, ids: string[], mac: boolean, readOnly: ReadonlySet<DocId> = NONE): DeletePlan | { reason: string } {
  if (ids.some((id) => parseDriveNode(id))) return { reason: BIN_FROM_MENU }
  if (docIds(ids).length > 0) return { reason: 'Close a file instead of deleting it.' }
  const refs = itemRefs(ids)
  const lock = refs.map((r) => lockReason(r.doc, readOnly)).find((reason) => reason !== undefined)
  if (lock) return { reason: lock }
  if (refs.length === 0) return { reason: 'Nothing is selected.' }
  const top = topmost(docs, refs)
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
    const quiz = r.kind === 'course' ? undefined : course.quizzes.find((q) => q.id === r.quiz)!
    const count = r.kind === 'course' ? course.quizzes.length : r.kind === 'group' ? quiz!.cards.filter((k) => k.group === r.group).length : quiz!.cards.length
    const inside = r.kind === 'course' ? plural(count, 'quiz', 'quizzes') : plural(count, 'card')
    const what = r.kind === 'group' ? `the group "${name}"` : `"${name}"`
    question = count === 0 ? `Delete ${what}?` : `Delete ${what} and its ${inside}?`
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
  return kind === 'course' || kind === 'quiz' || kind === 'card' || kind === 'group' ? kind : null
}

/** Whether a drop can go inside this node (a card holds nothing). */
export const allowInside = (node: string): boolean => parseNode(node)?.kind !== 'card' && !parseDriveNode(node)

/** Where `ids` dropped at `node` land, or why they can not. */
export function dropTarget(docs: Docs, ids: string[], node: string | null, pos: Pos, readOnly: ReadonlySet<DocId> = NONE): { target: Target } | { reason: string } {
  const g = node === null ? null : parseDriveNode(node)
  if (g) return { reason: OPEN_FIRST }
  const refs = itemRefs(ids)
  if (refs.length === 0 || refs.length !== ids.length) return { reason: 'That can not be dropped here.' }
  const kind = refs[0].kind
  if (refs.some((r) => r.kind !== kind)) return { reason: MIXED }
  const at = node === null ? null : parseNode(node)
  if (at?.kind === 'group') {
    if (kind === 'card' && pos !== 'inside') return { reason: 'Drop a card onto the group to add it to it.' }
    if (kind !== 'card' && pos === 'inside') return { reason: `A ${kind} can't go inside a group.` }
  }
  if (at?.kind === 'card' && kind === 'group') return { reason: "A group can't go inside a card." }
  const target = targetFor(docs, node, pos, kind)
  const lock = target && lockReason(target.doc, readOnly)
  if (lock) return { reason: lock }
  return target ? { target } : { reason: `A ${kind} can only go in ${PLACE[kind]}.` }
}

/** What a drag of these does: from a library that is not open or view only it only copies, whatever the keys say. */
export const dragEffect = (ids: string[], effect: Effect, readOnly: ReadonlySet<DocId> = NONE): Effect =>
  itemRefs(ids).some((r) => isPeekRef(r) || readOnly.has(r.doc)) ? 'copy' : effect

export function dropRule(docs: Docs, ids: string[], node: string | null, pos: Pos, effect: Effect, readOnly: ReadonlySet<DocId> = NONE): { ok: true } | { ok: false; reason: string } {
  const t = dropTarget(docs, ids, node, pos, readOnly)
  if ('reason' in t) return { ok: false, reason: t.reason }
  const reason = canPlace(docs, itemRefs(ids), t.target, dragEffect(ids, effect, readOnly))
  return reason ? { ok: false, reason } : { ok: true }
}

/** Moves or copies the items to the target, checked first: never throws. */
export function placeItems(docs: Docs, refs: ItemRef[], target: Target, effect: Effect, fresh: () => string, name?: string): Plan {
  try {
    const reason = canPlace(docs, refs, target, effect)
    if (reason) return { ok: false, reason }
    const label = name ?? dragLabel(refs[0].kind, refs.length, effect)
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

export function dropPlan(docs: Docs, ids: string[], node: string | null, pos: Pos, effect: Effect, fresh: () => string, readOnly: ReadonlySet<DocId> = NONE): Plan {
  const t = dropTarget(docs, ids, node, pos, readOnly)
  return 'reason' in t ? { ok: false, reason: t.reason } : placeItems(docs, itemRefs(ids), t.target, dragEffect(ids, effect, readOnly), fresh)
}

export type Destination = { label: string; target: Target }

/** Where else the items (of one kind) can be moved: every file, course or quiz that takes them, as a path. */
export function moveDestinations(docs: Docs, names: Record<DocId, string>, refs: ItemRef[], readOnly: ReadonlySet<DocId> = NONE): Destination[] {
  if (refs.length === 0) return []
  const kind = refs[0].kind
  const out: Destination[] = []
  const here = (t: Target) => refs.every((r) => r.doc === t.doc && (t.kind === 'doc' || (r.kind !== 'course' && r.course === t.course && (t.kind === 'course' || ((r.kind === 'card' || r.kind === 'group') && r.quiz === t.quiz)))))
  const add = (label: string, target: Target) => {
    if (!here(target) && canPlace(docs, refs, target, 'move') === null) out.push({ label, target })
  }
  for (const [doc, lib] of Object.entries(docs)) {
    if (readOnly.has(doc)) continue
    const file = names[doc] ?? doc
    if (kind === 'course') add(file, { kind: 'doc', doc })
    for (const course of lib.courses) {
      if (kind === 'quiz') add(`${file} > ${course.name}`, { kind: 'course', doc, course: course.id })
      if (kind === 'card' || kind === 'group') {
        for (const quiz of course.quizzes) add(`${file} > ${course.name} > ${quiz.name}`, { kind: 'quiz', doc, course: course.id, quiz: quiz.id })
      }
    }
  }
  return out
}

/** The tree nodes to open so `ref` shows: its file, course and quiz. */
export function ancestorNodes(ref: ItemRef, docs?: Docs): string[] {
  const nodes = [nodeOf({ kind: 'doc', doc: ref.doc })]
  if (ref.kind !== 'course') nodes.push(nodeOf({ kind: 'course', doc: ref.doc, course: ref.course }))
  if (ref.kind === 'card' || ref.kind === 'group') nodes.push(nodeOf({ kind: 'quiz', doc: ref.doc, course: ref.course, quiz: ref.quiz }))
  if (ref.kind === 'card' && docs) {
    const quiz = docs[ref.doc]?.courses.find((c) => c.id === ref.course)?.quizzes.find((q) => q.id === ref.quiz)
    const group = quiz?.cards.find((k) => k.id === ref.card)?.group
    if (group && quiz?.groups.some((g) => g.id === group)) nodes.push(nodeOf({ kind: 'group', doc: ref.doc, course: ref.course, quiz: ref.quiz, group }))
  }
  return nodes
}

/**
 * The same item in another copy of the same library (a library read for a look, then opened as a document, gets new
 * ids): found by its places in the lists. Null when the other copy has no such place.
 */
export function translateRef(from: Library, to: Library, ref: ItemRef, doc: DocId): ItemRef | null {
  const c = from.courses.findIndex((x) => x.id === ref.course)
  const course = to.courses[c]
  if (!course) return null
  if (ref.kind === 'course') return { kind: 'course', doc, course: course.id }
  const q = from.courses[c].quizzes.findIndex((x) => x.id === ref.quiz)
  const quiz = course.quizzes[q]
  if (!quiz) return null
  if (ref.kind === 'quiz') return { kind: 'quiz', doc, course: course.id, quiz: quiz.id }
  if (ref.kind === 'group') {
    const group = quiz.groups[from.courses[c].quizzes[q].groups.findIndex((x) => x.id === ref.group)]
    return group ? { kind: 'group', doc, course: course.id, quiz: quiz.id, group: group.id } : null
  }
  const k = from.courses[c].quizzes[q].cards.findIndex((x) => x.id === ref.card)
  const card = quiz.cards[k]
  return card ? { kind: 'card', doc, course: course.id, quiz: quiz.id, card: card.id } : null
}

/**
 * Where an item goes to move one place up or down among its siblings (a card only within its group or the ungrouped
 * cards), as a target for `move`, or why it can't.
 */
export function reorderTarget(docs: Docs, ref: ItemRef, dir: 'up' | 'down'): { target: Target } | { reason: string } {
  const lib = docs[ref.doc]
  const course = lib?.courses.find((c) => c.id === ref.course)
  const quiz = course?.quizzes.find((q) => q.id === (ref.kind === 'course' ? '' : ref.quiz))
  const step = (list: { id: string }[], id: string, make: (index: number) => Target) => {
    const at = list.findIndex((x) => x.id === id)
    if (at < 0) return { reason: 'That is no longer there.' }
    if (dir === 'up') return at === 0 ? { reason: 'It is already first.' } : { target: make(at - 1) }
    return at === list.length - 1 ? { reason: 'It is already last.' } : { target: make(at + 2) }
  }
  if (!lib) return { reason: 'That is no longer there.' }
  if (ref.kind === 'course') return step(lib.courses, ref.course, (index) => ({ kind: 'doc', doc: ref.doc, index }))
  if (!course) return { reason: 'That is no longer there.' }
  if (ref.kind === 'quiz') return step(course.quizzes, ref.quiz, (index) => ({ kind: 'course', doc: ref.doc, course: ref.course, index }))
  if (!quiz) return { reason: 'That is no longer there.' }
  if (ref.kind === 'group') return step(quiz.groups, ref.group, (index) => ({ kind: 'quiz', doc: ref.doc, course: ref.course, quiz: ref.quiz, index }))
  const card = quiz.cards.find((k) => k.id === ref.card)
  if (!card) return { reason: 'That is no longer there.' }
  const group = card.group && quiz.groups.some((g) => g.id === card.group) ? card.group : null
  const section = quiz.cards.filter((k) => (group === null ? !(k.group && quiz.groups.some((g) => g.id === k.group)) : k.group === group))
  const at = section.findIndex((k) => k.id === ref.card)
  if (dir === 'up' ? at === 0 : at === section.length - 1) return { reason: dir === 'up' ? 'It is already first.' : 'It is already last.' }
  // The place is counted among all the quiz's cards, before the move.
  const flat = (k: { id: string }) => quiz.cards.findIndex((x) => x.id === k.id)
  const index = dir === 'up' ? flat(section[at - 1]) : flat(section[at + 1]) + 1
  return { target: { kind: 'quiz', doc: ref.doc, course: ref.course, quiz: ref.quiz, index, group } }
}

export type UngroupPlan = { question: string; label: string; docs: Docs }

/** Taking a group apart (its cards stay, ungrouped), asked first as the editor's Ungroup does; null when it is gone. */
export function ungroupPlan(docs: Docs, ref: Extract<ItemRef, { kind: 'group' }>): UngroupPlan | null {
  if (!exists(docs, ref)) return null
  return {
    question: `Remove the group "${itemName(docs, ref)}"? Its cards stay in the quiz.`,
    label: 'Ungroup',
    docs: ungroup(docs, ref),
  }
}
