import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, type Card, type Library } from '../model'
import type { Docs, ItemRef } from './contentOps'
import {
  addCard, addCourse, addQuiz, ancestorNodes, allowInside, cardDescription, deletePlan, describeNode, removeItems, dragKind, dragLabel, dropPlan, dropRule, itemRefs,
  keyDecision, menuFor, moveDestinations, parseNode, pasteTarget, placeItems, renameItem, renameProblem, selectionKind, whereIcon,
  type Clip, type Item, type MenuContext,
} from './explorerActions'

const card = (id: string): Card => ({ id, term: `T${id}`, definition: 'd' })
const lib = (): Library => ({
  version: FORMAT_VERSION,
  courses: [
    { id: 'c1', name: 'Bio', quizzes: [{ id: 'q1', name: 'Cells', groups: [], cards: [card('k1'), card('k2'), card('k3')] }, { id: 'q2', name: 'Empty', groups: [], cards: [] }] },
    { id: 'c2', name: 'Chem', quizzes: [] },
  ],
})
const docs: Docs = { a: lib(), b: { version: FORMAT_VERSION, courses: [] } }
const names = { a: 'one.shrimp', b: 'two.shrimp' }
const ctx = (clipboard: Clip | null = null, d: Docs = docs): MenuContext => ({ docs: d, names, clipboard, mac: false })
const course = (id: string): ItemRef => ({ kind: 'course', doc: 'a', course: id })
const quiz = (id: string): ItemRef => ({ kind: 'quiz', doc: 'a', course: 'c1', quiz: id })
const k = (id: string): ItemRef => ({ kind: 'card', doc: 'a', course: 'c1', quiz: 'q1', card: id })
const key = (key: string, extra: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...extra })
const items = (entries: ReturnType<typeof menuFor>) => entries.filter((e): e is Item => e !== 'separator')
const labels = (entries: ReturnType<typeof menuFor>) => items(entries).map((e) => e.label)
const find = (entries: ReturnType<typeof menuFor>, label: string) => items(entries).find((e) => e.label === label)!
let n = 0
const fresh = () => `n${++n}`

describe('nodes and selections', () => {
  it('parses ids and ignores foreign ones', () => {
    expect(parseNode('q:a:c1:q1')).toEqual(quiz('q1'))
    expect(parseNode('tab:3')).toBeNull()
  })
  it('names the kind of a selection', () => {
    expect(selectionKind([])).toBeNull()
    expect(selectionKind(['c:a:c1', 'c:a:c2'])).toBe('course')
    expect(selectionKind(['d:a'])).toBe('doc')
    expect(selectionKind(['c:a:c1', 'q:a:c1:q1'])).toBe('mixed')
    expect(selectionKind(['c:a:c1', 'tab:3'])).toBe('mixed')
  })
  it('keeps only items', () => {
    expect(itemRefs(['d:a', 'c:a:c1', 'k:a:c1:q1:k1'])).toEqual([course('c1'), k('k1')])
  })
  it('describes cards, files', () => {
    expect(cardDescription(card('x'))).toBe('Front / Back')
    expect(cardDescription({ id: 'x', type: 'true-false', statement: 's', answer: true } as Card)).toBe('True or false')
    expect(whereIcon('On Google Drive')).toBe('cloud')
    expect(whereIcon('Only in this browser')).toBe('browser')
    expect(whereIcon('On this device')).toBe('file')
  })
})

describe('menus', () => {
  it('empty space', () => {
    const m = menuFor(ctx(), [], null)
    expect(labels(m)).toEqual(['New file', 'Open file', 'Paste'])
    expect(find(m, 'Paste')).toMatchObject({ disabled: true, reason: 'Nothing to paste.' })
  })
  it('empty space pastes courses into the last file, not cards', () => {
    expect(find(menuFor(ctx({ mode: 'copy', refs: [course('c1')] }), [], null), 'Paste').disabled).toBeUndefined()
    expect(find(menuFor(ctx({ mode: 'copy', refs: [k('k1')] }), [], null), 'Paste').reason).toBe('A card can only go in a quiz.')
  })
  it('a file', () => {
    const m = menuFor(ctx(), ['d:a'], 'd:a')
    expect(labels(m)).toEqual(['New course', 'Paste', 'Save', 'Download', 'Close file'])
    expect(find(m, 'Close file').disabled).toBeUndefined()
    expect(find(menuFor(ctx(), ['d:a', 'd:b'], 'd:a'), 'New course')).toMatchObject({ disabled: true, reason: 'Pick one file.' })
  })
  it('a course', () => {
    const m = menuFor(ctx(), ['c:a:c1'], 'c:a:c1')
    expect(labels(m)).toEqual(['Open', 'New quiz', 'Rename', 'Copy', 'Cut', 'Paste', 'Move to…', 'Delete'])
    expect(find(m, 'Rename').shortcut).toBe('F2')
    expect(find(m, 'Copy').shortcut).toBe('Ctrl+C')
    expect(find(m, 'Cut').shortcut).toBe('Ctrl+X')
    expect(find(m, 'Paste').shortcut).toBe('Ctrl+V')
    expect(find(m, 'Delete')).toMatchObject({ shortcut: 'Delete', danger: true })
    expect(find(m, 'Move to…').disabled).toBeUndefined()
  })
  it('a quiz and a card', () => {
    expect(labels(menuFor(ctx(), ['q:a:c1:q1'], 'q:a:c1:q1'))).toEqual(['Open', 'Edit cards', 'New card', 'Rename', 'Copy', 'Cut', 'Paste', 'Move to…', 'Delete'])
    expect(labels(menuFor(ctx(), ['k:a:c1:q1:k1'], 'k:a:c1:q1:k1'))).toEqual(['Edit', 'Copy', 'Cut', 'Paste', 'Move to…', 'Delete'])
  })
  it('several of one kind: one-item entries are disabled with a reason, the rest work', () => {
    const m = menuFor(ctx(), ['c:a:c1', 'c:a:c2'], 'c:a:c1')
    expect(find(m, 'Rename')).toMatchObject({ disabled: true, reason: 'Pick one course.' })
    expect(find(m, 'Open').disabled).toBe(true)
    expect(find(m, 'Copy').disabled).toBeUndefined()
    expect(find(m, 'Delete').disabled).toBeUndefined()
  })
  it('mixed kinds: copy, cut and move refused, delete allowed', () => {
    const m = menuFor(ctx(), ['c:a:c2', 'q:a:c1:q1'], 'c:a:c2')
    expect(labels(m)).toEqual(['Copy', 'Cut', 'Move to…', 'Delete'])
    expect(find(m, 'Copy')).toMatchObject({ disabled: true, reason: 'Pick items of one kind.' })
    expect(find(m, 'Move to…').disabled).toBe(true)
    expect(find(m, 'Delete').disabled).toBeUndefined()
  })
  it('a file among the items can not be deleted', () => {
    expect(find(menuFor(ctx(), ['d:a', 'c:a:c1'], 'c:a:c1'), 'Delete')).toMatchObject({ disabled: true, reason: 'Close a file instead of deleting it.' })
  })
  it('paste explains itself', () => {
    const quizzes: Clip = { mode: 'copy', refs: [quiz('q1')] }
    expect(find(menuFor(ctx(quizzes), ['d:a'], 'd:a'), 'Paste').reason).toBe('A quiz can only go in a course.')
    expect(find(menuFor(ctx(quizzes), ['c:a:c2'], 'c:a:c2'), 'Paste').disabled).toBeUndefined()
    const cut: Clip = { mode: 'cut', refs: [k('k1')] }
    expect(find(menuFor(ctx(cut), ['k:a:c1:q1:k1'], 'k:a:c1:q1:k1'), 'Paste')).toMatchObject({ disabled: true, reason: 'That is already there.' })
    expect(find(menuFor(ctx(cut), ['k:a:c1:q1:k3'], 'k:a:c1:q1:k3'), 'Paste').disabled).toBeUndefined()
  })
  it('move to is disabled when nowhere else takes the items', () => {
    const one: Docs = { a: { version: FORMAT_VERSION, courses: [{ id: 'c1', name: 'Bio', quizzes: [] }] } }
    expect(find(menuFor(ctx(null, one), ['c:a:c1'], 'c:a:c1'), 'Move to…')).toMatchObject({ disabled: true, reason: 'There is nowhere else to move it.' })
  })
})

describe('pasteTarget', () => {
  it('goes after a card, inside a quiz, at the end of the last file for nothing', () => {
    expect(pasteTarget(docs, { mode: 'copy', refs: [k('k1')] }, 'k:a:c1:q1:k2')).toEqual({ target: { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 2, group: null } })
    expect(pasteTarget(docs, { mode: 'copy', refs: [course('c1')] }, null)).toEqual({ target: { kind: 'doc', doc: 'b', index: undefined } })
  })
  it('refuses with no file open', () => {
    expect(pasteTarget({}, { mode: 'copy', refs: [course('c1')] }, null)).toEqual({ reason: 'Open a file first.' })
  })
})

describe('keys', () => {
  it('maps the clipboard, delete and rename keys', () => {
    const at = 'c:a:c1'
    expect(keyDecision(ctx(), key('c', { ctrlKey: true }), [at], at)).toEqual({ action: 'copy' })
    expect(keyDecision(ctx(), key('x', { ctrlKey: true }), [at], at)).toEqual({ action: 'cut' })
    expect(keyDecision(ctx({ mode: 'copy', refs: [quiz('q1')] }), key('v', { ctrlKey: true }), [at], at)).toEqual({ action: 'paste' })
    expect(keyDecision(ctx(), key('Delete'), [at], at)).toEqual({ action: 'delete' })
    expect(keyDecision(ctx(), key('F2'), [at], at)).toEqual({ action: 'rename' })
  })
  it('F2 on a card edits it', () => {
    expect(keyDecision(ctx(), key('F2'), ['k:a:c1:q1:k1'], 'k:a:c1:q1:k1')).toEqual({ action: 'edit' })
  })
  it('says why a key is refused, and leaves keys that do not apply alone', () => {
    const ids = ['c:a:c2', 'q:a:c1:q1']
    expect(keyDecision(ctx(), key('c', { ctrlKey: true }), ids, ids[0])).toEqual({ refuse: 'Pick items of one kind.' })
    expect(keyDecision(ctx(), key('Delete'), ['d:a'], 'd:a')).toEqual({ refuse: 'Close a file instead of deleting it.' })
    expect(keyDecision(ctx(), key('c', { ctrlKey: true }), ['d:a'], 'd:a')).toBeNull()
    expect(keyDecision(ctx(), key('a'), ['c:a:c1'], 'c:a:c1')).toBeNull()
    expect(keyDecision(ctx(), key('c', { ctrlKey: true, shiftKey: true }), ['c:a:c1'], 'c:a:c1')).toBeNull()
  })
  it('pastes with nothing selected at the focused node', () => {
    expect(keyDecision(ctx(), key('v', { ctrlKey: true }), [], 'd:a')).toEqual({ refuse: 'Nothing to paste.' })
    expect(keyDecision(ctx(), key('v', { ctrlKey: true }), [], null)).toEqual({ refuse: 'Nothing to paste.' })
  })
})

describe('create', () => {
  it('names new courses and quizzes freely and puts a card at the end', () => {
    const c1 = addCourse(docs, 'a', 'x')!
    expect(c1.docs.a.courses.at(-1)).toEqual({ id: 'x', name: 'New course', quizzes: [] })
    const c2 = addCourse(c1.docs, 'a', 'y')!
    expect(c2.docs.a.courses.at(-1)!.name).toBe('New course 2')
    expect(c2.ref).toEqual(course('y'))
    const q = addQuiz(docs, 'a', 'c1', 'z')!
    expect(q.docs.a.courses[0].quizzes.at(-1)).toEqual({ id: 'z', name: 'New quiz', groups: [], cards: [] })
    expect(addQuiz(q.docs, 'a', 'c1', 'w')!.docs.a.courses[0].quizzes.at(-1)!.name).toBe('New quiz 2')
    const c = addCard(docs, 'a', 'c1', 'q1', 'm')!
    expect(c.docs.a.courses[0].quizzes[0].cards.map((x) => x.id)).toEqual(['k1', 'k2', 'k3', 'm'])
    expect(c.docs.a.courses[0].quizzes[0].cards[3]).toEqual({ id: 'm', term: '', definition: '' })
    expect(c.ref).toEqual({ ...k('m') })
  })
  it('does not change the input and returns null for a missing parent', () => {
    addCourse(docs, 'a', 'x')
    expect(docs.a.courses).toHaveLength(2)
    expect(addCourse(docs, 'nope', 'x')).toBeNull()
    expect(addQuiz(docs, 'a', 'nope', 'x')).toBeNull()
    expect(addCard(docs, 'a', 'c1', 'nope', 'x')).toBeNull()
  })
  it('lists the nodes to open to show an item', () => {
    expect(ancestorNodes(k('k1'))).toEqual(['d:a', 'c:a:c1', 'q:a:c1:q1'])
    expect(ancestorNodes(course('c1'))).toEqual(['d:a'])
  })
})

describe('rename', () => {
  it('refuses empty and taken names, allows its own', () => {
    expect(renameProblem(docs, course('c1'), '  ')).toBe('Type a name')
    expect(renameProblem(docs, course('c1'), 'chem')).toBe('Another course is already named "Chem"')
    expect(renameProblem(docs, course('c1'), 'BIO')).toBeUndefined()
    expect(renameProblem(docs, quiz('q1'), 'Empty')).toBe('Another quiz is already named "Empty"')
  })
  it('renames with trimmed text', () => {
    const next = renameItem(docs, quiz('q1'), '  Cell biology ')!
    expect(next.a.courses[0].quizzes[0].name).toBe('Cell biology')
    expect(docs.a.courses[0].quizzes[0].name).toBe('Cells')
    expect(renameItem(docs, course('c1'), 'Chem')).toBeNull()
    expect(renameItem(docs, k('k1'), 'x')).toBeNull()
    expect(renameItem(docs, course('gone'), 'x')).toBeNull()
  })
})

describe('delete', () => {
  it('cards go at once with a notice', () => {
    const plan = deletePlan(docs, ['k:a:c1:q1:k1', 'k:a:c1:q1:k2', 'k:a:c1:q1:k3'], false)
    expect(plan).toEqual({
      refs: [k('k1'), k('k2'), k('k3')], label: 'Delete 3 cards', question: null, notice: 'Deleted 3 cards. Ctrl+Z puts them back.',
    })
    expect(deletePlan(docs, ['k:a:c1:q1:k1'], false)).toMatchObject({ label: 'Delete 1 card', notice: 'Deleted 1 card. Ctrl+Z puts it back.' })
  })
  it('a course or quiz asks first and says what goes', () => {
    expect((deletePlan(docs, ['c:a:c1'], false) as { question: string }).question).toBe('Delete "Bio" and its 2 quizzes?\n\nCtrl+Z brings it back.')
    expect((deletePlan(docs, ['c:a:c2'], false) as { question: string }).question).toBe('Delete "Chem"?\n\nCtrl+Z brings it back.')
    expect((deletePlan(docs, ['q:a:c1:q1'], false) as { question: string }).question).toBe('Delete "Cells" and its 3 cards?\n\nCtrl+Z brings it back.')
    expect((deletePlan(docs, ['c:a:c1', 'c:a:c2'], false) as { question: string }).question).toBe('Delete 2 courses and everything in them?\n\nCtrl+Z brings it back.')
  })
  it('takes any mix and counts nested items once', () => {
    const plan = deletePlan(docs, ['c:a:c1', 'q:a:c1:q1', 'k:a:c1:q1:k1'], false) as { label: string; question: string }
    expect(plan.label).toBe('Delete 1 course')
    expect(plan.question).toContain('"Bio"')
    expect((deletePlan(docs, ['c:a:c2', 'q:a:c1:q1'], true) as { label: string; notice: string }).notice).toBe('Deleted 2 items. ⌘Z puts them back.')
  })
  it('never deletes files', () => {
    expect(deletePlan(docs, ['d:a'], false)).toEqual({ reason: 'Close a file instead of deleting it.' })
    expect(deletePlan(docs, [], false)).toEqual({ reason: 'Nothing is selected.' })
  })
})

describe('drag', () => {
  it('labels and kinds', () => {
    expect(dragLabel('card', 3, 'move')).toBe('Move 3 cards')
    expect(dragLabel('quiz', 1, 'copy')).toBe('Copy 1 quiz')
    expect(dragKind(['k:a:c1:q1:k1', 'k:a:c1:q1:k2'])).toBe('card')
    expect(dragKind(['d:a'])).toBeNull()
    expect(dragKind(['c:a:c1', 'q:a:c1:q1'])).toBeNull()
  })
  it('refuses with a reason', () => {
    expect(dropRule(docs, ['k:a:c1:q1:k1'], 'd:b', 'inside', 'move')).toEqual({ ok: false, reason: 'A card can only go in a quiz.' })
    expect(dropRule(docs, ['c:a:c1', 'q:a:c1:q1'], 'd:b', 'inside', 'move')).toEqual({ ok: false, reason: 'Pick items of one kind.' })
    expect(dropRule(docs, ['tab:1'], 'd:b', 'inside', 'move')).toEqual({ ok: false, reason: 'That can not be dropped here.' })
    expect(dropRule(docs, ['k:a:c1:q1:k1'], 'k:a:c1:q1:k1', 'before', 'move')).toEqual({ ok: false, reason: 'That is already there.' })
  })
  it('allows a course into another file and plans the move or copy', () => {
    expect(dropRule(docs, ['c:a:c1'], 'd:b', 'inside', 'move')).toEqual({ ok: true })
    const moved = dropPlan(docs, ['c:a:c1'], 'd:b', 'inside', 'move', fresh)
    expect(moved).toMatchObject({ ok: true, label: 'Move 1 course' })
    if (moved.ok) {
      expect(moved.docs.a.courses.map((c) => c.id)).toEqual(['c2'])
      expect(moved.docs.b.courses.map((c) => c.id)).toEqual(['c1'])
    }
    const copied = dropPlan(docs, ['k:a:c1:q1:k1'], 'q:a:c1:q2', 'inside', 'copy', fresh)
    expect(copied).toMatchObject({ ok: true, label: 'Copy 1 card' })
    if (copied.ok) {
      expect(copied.docs.a.courses[0].quizzes[1].cards).toHaveLength(1)
      expect(copied.docs.a.courses[0].quizzes[0].cards).toHaveLength(3)
      expect(copied.created).toHaveLength(1)
    }
  })
  it('reorders by dropping before a sibling', () => {
    const plan = dropPlan(docs, ['k:a:c1:q1:k3'], 'k:a:c1:q1:k1', 'before', 'move', fresh)
    expect(plan.ok && plan.docs.a.courses[0].quizzes[0].cards.map((c) => c.id)).toEqual(['k3', 'k1', 'k2'])
  })
  it('never throws for items that are gone', () => {
    expect(placeItems(docs, [course('gone')], { kind: 'doc', doc: 'b' }, 'move', fresh)).toEqual({ ok: false, reason: 'That is no longer there.' })
  })
})

describe('move to', () => {
  it('lists the places that take the items, not where they are', () => {
    expect(moveDestinations(docs, names, [course('c1')]).map((d) => d.label)).toEqual(['two.shrimp'])
    expect(moveDestinations(docs, names, [quiz('q1')]).map((d) => d.label)).toEqual(['one.shrimp > Chem'])
    expect(moveDestinations(docs, names, [k('k1')]).map((d) => d.label)).toEqual(['one.shrimp > Bio > Empty'])
    expect(moveDestinations(docs, names, [])).toEqual([])
  })
})

describe('removeItems and describeNode', () => {
  it('deletes without throwing', () => {
    const r = removeItems(docs, [course('c1')])
    expect(r.ok && r.docs.a.courses.map((c) => c.id)).toEqual(['c2'])
    expect(removeItems(docs, [course('gone')])).toEqual({ ok: false, reason: 'That is no longer there.' })
  })
  it('describes files and cards only', () => {
    const meta = { a: { where: 'On this device', dirty: true }, b: { where: 'On Google Drive', dirty: false } }
    expect(describeNode(docs, meta, 'd:a')).toBe('Open · Unsaved · On this device')
    expect(describeNode(docs, meta, 'd:b')).toBe('Open · On Google Drive')
    expect(describeNode(docs, meta, 'k:a:c1:q1:k1')).toBe('Front / Back')
    expect(describeNode(docs, meta, 'c:a:c1')).toBeNull()
  })
})

describe('Google Drive rows', () => {
  const file = 'g:f:abc'
  it('a closed library: open, paste refused, move to bin', () => {
    const m = menuFor(ctx(), [file], file)
    expect(labels(m)).toEqual(['Open', 'Paste', 'Move to bin'])
    expect(find(m, 'Paste')).toMatchObject({ disabled: true, reason: 'Open the library first.' })
    expect(find(m, 'Move to bin').danger).toBe(true)
    expect(find(menuFor(ctx(), [file, 'g:f:def'], file), 'Open')).toMatchObject({ disabled: true, reason: 'Pick one library.' })
  })
  it('nothing is pasted or dropped into one, and it can not be dragged', () => {
    expect(pasteTarget(docs, { mode: 'copy', refs: [course('c1')] }, file)).toEqual({ reason: 'Open the library first.' })
    expect(dropRule(docs, ['c:a:c1'], file, 'inside', 'move')).toEqual({ ok: false, reason: 'Open the library first.' })
        expect(dragKind([file])).toBeNull()
    expect(allowInside(file)).toBe(false)
  })
  it('keys: Delete moves to the bin, Ctrl+V is refused, Ctrl+C is left alone', () => {
    expect(keyDecision(ctx(), key('Delete'), [file], file)).toEqual({ action: 'driveRemove' })
    expect(keyDecision(ctx({ mode: 'copy', refs: [course('c1')] }), key('v', { ctrlKey: true }), [file], file)).toEqual({ refuse: 'Open the library first.' })
    expect(keyDecision(ctx(), key('c', { ctrlKey: true }), [file], file)).toBeNull()
  })
  it('a file mixed with items can not be deleted, and the mix is refused for copy', () => {
    const m = menuFor(ctx(), [file, 'c:a:c1'], 'c:a:c1')
    expect(find(m, 'Delete').disabled).toBe(true)
    expect(find(m, 'Copy').reason).toBe('Pick items of one kind.')
    expect(deletePlan(docs, [file, 'c:a:c1'], false)).toEqual({ reason: 'Move a Google Drive library to the bin from its own menu.' })
  })
  it('says whether a file is open, and where it is', () => {
    const listing = { signedIn: true, loading: false, failed: false, files: [{ id: 'abc', name: 'x.shrimp', modified: '2026-11-01T10:00:00Z' }] }
    expect(describeNode(docs, {}, file, { listing })).toBe('Not open · Your Google Drive')
    expect(describeNode(docs, {}, 'g:f:other', { listing })).toBeNull()
    const meta = { a: { where: 'On this device', dirty: false }, b: { where: 'Your Google Drive', dirty: true } }
    expect(describeNode(docs, meta, 'd:a')).toBe('Open · On this device')
    expect(describeNode(docs, meta, 'd:b')).toBe('Open · Unsaved · Your Google Drive')
  })
})
