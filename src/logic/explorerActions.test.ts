import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, type Card, type Library } from '../model'
import type { Docs, ItemRef } from './contentOps'
import {
  blankCard, insertCard, reorderTarget, ungroupPlan, addCard, addCourse, addQuiz, ancestorNodes, allowInside, cardDescription, deletePlan, describeNode, fileStatus, removeItems, dragKind, dragLabel, dropPlan, dropRule, itemRefs,
  dragEffect, keyDecision, menuFor, translateRef, moveDestinations, parseNode, pasteTarget, placeItems, renameItem, renameProblem, selectionKind, whereIcon,
  readOnlyOf, type Clip, type ClosedKind, type Item, type MenuContext,
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
const files: MenuContext['files'] = { a: { place: 'drive', readOnly: false }, b: { place: 'browser', readOnly: false } }
const closed: Record<string, ClosedKind> = { abc: 'mine', def: 'link', bro: 'browser' }
const ctx = (clipboard: Clip | null = null, d: Docs = docs, f: MenuContext['files'] = files, driveSetUp = true): MenuContext => ({
  docs: d, names, clipboard, mac: false, files: f, closed, driveSetUp,
})
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
    expect(labels(m)).toEqual(['New file', 'Open a copy from this device', 'Paste'])
    expect(find(m, 'Paste')).toMatchObject({ disabled: true, reason: 'Nothing to paste.' })
  })
  it('empty space pastes courses into the last file, not cards', () => {
    expect(find(menuFor(ctx({ mode: 'copy', refs: [course('c1')] }), [], null), 'Paste').disabled).toBeUndefined()
    expect(find(menuFor(ctx({ mode: 'copy', refs: [k('k1')] }), [], null), 'Paste').reason).toBe('A card can only go in a quiz.')
  })
  it('a Drive file: share, download a copy, close', () => {
    const m = menuFor(ctx(), ['d:a'], 'd:a')
    expect(labels(m)).toEqual(['Open in new tab', 'New course', 'Rename', 'Paste', 'Share…', 'Download a copy', 'Close file'])
    expect(find(m, 'Close file').disabled).toBeUndefined()
    expect(find(menuFor(ctx(), ['d:a', 'd:b'], 'd:a'), 'New course')).toMatchObject({ disabled: true, reason: 'Pick one file.' })
  })
  it('a browser library: upload, share, download a copy, close', () => {
    expect(labels(menuFor(ctx(), ['d:b'], 'd:b'))).toEqual(['Open in new tab', 'New course', 'Rename', 'Paste', 'Upload to Google Drive…', 'Share…', 'Download a copy', 'Close file'])
  })
  it('without Google Drive set up there is nothing to upload or share to', () => {
    expect(labels(menuFor(ctx(null, docs, files, false), ['d:b'], 'd:b'))).toEqual(['Open in new tab', 'New course', 'Rename', 'Paste', 'Download a copy', 'Close file'])
  })
  it('a view-only library: make a copy, share, download a copy, close; nothing goes in', () => {
    const f = { ...files, a: { place: 'drive' as const, readOnly: true } }
    const m = menuFor(ctx({ mode: 'copy', refs: [course('c1')] }, docs, f), ['d:a'], 'd:a')
    expect(labels(m)).toEqual(['Open in new tab', 'New course', 'Rename', 'Paste', 'Make a copy', 'Share…', 'Download a copy', 'Close file'])
    expect(find(m, 'New course')).toMatchObject({ disabled: true, reason: 'This library is view only. Make a copy to change it.' })
    expect(find(m, 'Paste')).toMatchObject({ disabled: true, reason: 'This library is view only. Make a copy to change it.' })
    expect(find(m, 'Rename')).toMatchObject({ disabled: true, reason: "You can't rename someone else's file. Make a copy to change it." })
  })
  it('a library renames with F2 unless it is view only', () => {
    expect(find(menuFor(ctx(), ['d:a'], 'd:a'), 'Rename')).toMatchObject({ shortcut: 'F2' })
    expect(find(menuFor(ctx(), ['d:a', 'd:b'], 'd:a'), 'Rename')).toMatchObject({ disabled: true, reason: 'Pick one file.' })
  })
  it('a course', () => {
    const m = menuFor(ctx(), ['c:a:c1'], 'c:a:c1')
    expect(labels(m)).toEqual(['Open', 'Open in new tab', 'New quiz', 'Rename', 'Copy', 'Cut', 'Paste', 'Move to…', 'Move up', 'Move down', 'Delete'])
    expect(find(m, 'Rename').shortcut).toBe('F2')
    expect(find(m, 'Copy').shortcut).toBe('Ctrl+C')
    expect(find(m, 'Cut').shortcut).toBe('Ctrl+X')
    expect(find(m, 'Paste').shortcut).toBe('Ctrl+V')
    expect(find(m, 'Delete')).toMatchObject({ shortcut: 'Delete', danger: true })
    expect(find(m, 'Move to…').disabled).toBeUndefined()
  })
  it('a quiz and a card', () => {
    expect(labels(menuFor(ctx(), ['q:a:c1:q1'], 'q:a:c1:q1'))).toEqual(['Open', 'Open in new tab', 'Edit cards', 'New card', 'Rename', 'Copy', 'Cut', 'Paste', 'Move to…', 'Move up', 'Move down', 'Delete'])
    expect(labels(menuFor(ctx(), ['k:a:c1:q1:k1'], 'k:a:c1:q1:k1'))).toEqual(['Edit', 'Copy', 'Cut', 'Paste', 'Move to…', 'Move up', 'Move down', 'Delete'])
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
  it('describes cards only: files have a status of icons and chips', () => {
    expect(describeNode(docs, 'k:a:c1:q1:k1')).toBe('Front / Back')
    expect(describeNode(docs, 'c:a:c1')).toBeNull()
    expect(describeNode(docs, 'd:a')).toBeNull()
  })
})

describe('Google Drive rows', () => {
  const file = 'g:f:abc'
  it('a closed library: open, paste refused, download a copy, then the way to remove it', () => {
    const m = menuFor(ctx(), [file], file)
    expect(labels(m)).toEqual(['Open', 'Paste', 'Download a copy', 'Move to bin'])
    expect(find(m, 'Paste')).toMatchObject({ disabled: true, reason: 'Open the library first.' })
    expect(find(m, 'Move to bin').danger).toBe(true)
    expect(find(menuFor(ctx(), [file, 'g:f:def'], file), 'Open')).toMatchObject({ disabled: true, reason: 'Pick one library.' })
  })
  it('removing a closed library is worded by where it is', () => {
    expect(labels(menuFor(ctx(), ['g:f:bro'], 'g:f:bro')).at(-1)).toBe('Delete from this browser')
    expect(labels(menuFor(ctx(), ['g:f:def'], 'g:f:def')).at(-1)).toBe('Remove from list')
    expect(labels(menuFor(ctx(), [file, 'g:f:def'], file)).at(-1)).toBe('Remove')
  })
  it('nothing is pasted or dropped into one, and it can not be dragged', () => {
    expect(pasteTarget(docs, { mode: 'copy', refs: [course('c1')] }, file)).toEqual({ reason: 'Open the library first.' })
    expect(dropRule(docs, ['c:a:c1'], file, 'inside', 'move')).toEqual({ ok: false, reason: 'Open the library first.' })
        expect(dragKind([file])).toBeNull()
    expect(allowInside(file)).toBe(false)
  })
  it('keys: Delete moves to the bin, Ctrl+V is refused, Ctrl+C is left alone', () => {
    expect(keyDecision(ctx(), key('Delete'), [file], file)).toEqual({ action: 'closedRemove' })
    expect(keyDecision(ctx({ mode: 'copy', refs: [course('c1')] }), key('v', { ctrlKey: true }), [file], file)).toEqual({ refuse: 'Open the library first.' })
    expect(keyDecision(ctx(), key('c', { ctrlKey: true }), [file], file)).toBeNull()
  })
  it('a file mixed with items can not be deleted, and the mix is refused for copy', () => {
    const m = menuFor(ctx(), [file, 'c:a:c1'], 'c:a:c1')
    expect(find(m, 'Delete').disabled).toBe(true)
    expect(find(m, 'Copy').reason).toBe('Pick items of one kind.')
    expect(deletePlan(docs, [file, 'c:a:c1'], false)).toEqual({ reason: 'Move a Google Drive library to the bin from its own menu.' })
  })
  it('says whether a file is open, where it is and whether it has unsaved changes, with words for a screen reader', () => {
    const listing = { signedIn: true, loading: false, failed: false, files: [{ id: 'abc', name: 'x.shrimp', modified: '2026-11-01T10:00:00Z' }, { id: 'bro', name: 'y.shrimp', modified: '' }] }
    // The list does not say whose a library is, so it never says "Your".
    expect(fileStatus({}, file, { listing, closed })).toEqual({ open: false, dirty: false, where: 'On Google Drive', line: 'On Google Drive', words: 'Not open, On Google Drive' })
    expect(fileStatus({}, 'g:f:bro', { listing, closed })).toEqual({ open: false, dirty: false, where: 'Only in this browser', line: 'Only in this browser', words: 'Not open, Only in this browser' })
    expect(fileStatus({}, 'g:f:other', { listing })).toBeNull()
    const meta = { a: { where: 'Your Google Drive', line: 'Your Google Drive · Saved', dirty: false }, b: { where: 'Shared on Google Drive', line: 'Shared on Google Drive · View only', dirty: true, readOnly: true } }
    expect(fileStatus(meta, 'd:a')).toEqual({ open: true, dirty: false, where: 'Your Google Drive', line: 'Your Google Drive · Saved', words: 'Open, Your Google Drive' })
    expect(fileStatus(meta, 'd:b')).toEqual({ open: true, dirty: true, where: 'Shared on Google Drive', line: 'Shared on Google Drive · View only', words: 'Open, view only, needs attention, Shared on Google Drive' })
    expect(fileStatus(meta, 'c:a:c1')).toBeNull()
  })
})

describe('inside a library that is not open (read-only)', () => {
  // The peeked library is a document of its own, "p-x", with the same shape as `a`.
  const both: Docs = { ...docs, 'p-x': lib() }
  const pc = (id: string): ItemRef => ({ kind: 'course', doc: 'p-x', course: id })
  const pq = (id: string): ItemRef => ({ kind: 'quiz', doc: 'p-x', course: 'c1', quiz: id })
  const pk = (id: string): ItemRef => ({ kind: 'card', doc: 'p-x', course: 'c1', quiz: 'q1', card: id })
  const c = ctx(null, both)

  it('opens and copies; everything that changes it is off with a reason', () => {
    const course = menuFor(c, ['c:p-x:c1'], 'c:p-x:c1')
    expect(find(course, 'Open').disabled).toBeUndefined()
    expect(find(course, 'Copy').disabled).toBeUndefined()
    for (const label of ['New quiz', 'Rename', 'Cut', 'Move to…', 'Delete']) {
      expect(find(course, label)).toMatchObject({ disabled: true, reason: 'Open the library to change it.' })
    }
    const quiz = menuFor(c, ['q:p-x:c1:q1'], 'q:p-x:c1:q1')
    for (const label of ['Edit cards', 'New card', 'Rename', 'Delete']) expect(find(quiz, label).disabled).toBe(true)
    const card = menuFor(c, ['k:p-x:c1:q1:k1'], 'k:p-x:c1:q1:k1')
    expect(find(card, 'Edit')).toMatchObject({ disabled: true, reason: 'Open the library to change it.' })
    expect(find(card, 'Copy').disabled).toBeUndefined()
  })
  it('nothing is pasted into it, even a copy', () => {
    const clip: Clip = { mode: 'copy', refs: [quiz('q1')] }
    expect(pasteTarget(both, clip, 'c:p-x:c1')).toEqual({ reason: 'Open the library to change it.' })
    expect(find(menuFor(ctx(clip, both), ['c:p-x:c1'], 'c:p-x:c1'), 'Paste').disabled).toBe(true)
  })
  it('a copy out of it goes into an open file', () => {
    const clip: Clip = { mode: 'copy', refs: [pq('q1')] }
    expect(pasteTarget(both, clip, 'c:a:c2')).toMatchObject({ target: { kind: 'course', doc: 'a', course: 'c2' } })
  })
  it('a drag out of it only copies, and a drop into it is refused', () => {
    expect(dragEffect(['q:p-x:c1:q1'], 'move')).toBe('copy')
    expect(dragEffect(['q:a:c1:q1'], 'move')).toBe('move')
    expect(dropRule(both, ['q:p-x:c1:q1'], 'c:a:c2', 'inside', 'move')).toEqual({ ok: true })
    const plan = dropPlan(both, ['q:p-x:c1:q1'], 'c:a:c2', 'inside', 'move', fresh)
    expect(plan).toMatchObject({ ok: true, label: 'Copy 1 quiz' })
    expect(plan.ok && both['p-x'].courses[0].quizzes).toHaveLength(2)
    expect(dropRule(both, ['q:a:c1:q1'], 'c:p-x:c2', 'inside', 'move')).toEqual({ ok: false, reason: 'Open the library to change it.' })
  })
  it('can not be deleted or cut by key', () => {
    expect(deletePlan(both, ['k:p-x:c1:q1:k1'], false)).toEqual({ reason: 'Open the library to change it.' })
    expect(keyDecision(c, key('x', { ctrlKey: true }), ['c:p-x:c1'], 'c:p-x:c1')).toEqual({ refuse: 'Open the library to change it.' })
    expect(keyDecision(c, key('F2'), ['k:p-x:c1:q1:k1'], 'k:p-x:c1:q1:k1')).toEqual({ refuse: 'Open the library to change it.' })
  })
  it('the loading and failure rows: retry only', () => {
    expect(labels(menuFor(c, ['g:x:f1'], 'g:x:f1'))).toEqual(['Retry'])
    expect(menuFor(c, ['g:l:f1'], 'g:l:f1')).toEqual([])
  })
  it('finds the same item in another copy of the library by its places', () => {
    const other = lib()
    other.courses[0].id = 'z1'
    other.courses[0].quizzes[0].id = 'zq1'
    other.courses[0].quizzes[0].cards[1].id = 'zk2'
    expect(translateRef(docs.a, other, pk('k2'), 'new')).toEqual({ kind: 'card', doc: 'new', course: 'z1', quiz: 'zq1', card: 'zk2' })
    expect(translateRef(docs.a, other, pq('q1'), 'new')).toEqual({ kind: 'quiz', doc: 'new', course: 'z1', quiz: 'zq1' })
    expect(translateRef(docs.a, other, pc('c1'), 'new')).toEqual({ kind: 'course', doc: 'new', course: 'z1' })
    expect(translateRef(docs.a, { ...other, courses: [] }, pc('c1'), 'new')).toBeNull()
  })
})

describe('groups in the Explorer', () => {
  const quizWith = (): Library => ({
    version: FORMAT_VERSION,
    courses: [
      {
        id: 'c1',
        name: 'Bio',
        quizzes: [
          { id: 'q1', name: 'Cells', groups: [{ id: 'g1', name: 'G1', color: 'coral' }, { id: 'g2', name: 'G2', color: 'sky' }], cards: [card('k1'), card('k2'), { ...card('k3'), group: 'g1' }, { ...card('k4'), group: 'g1' }, { ...card('k5'), group: 'g2' }] as Card[] },
          { id: 'q2', name: 'Other', groups: [], cards: [] },
        ],
      },
    ],
  })
  const gd: Docs = { a: quizWith(), b: { version: FORMAT_VERSION, courses: [{ id: 'cb', name: 'Chem', quizzes: [{ id: 'qb', name: 'Atoms', groups: [{ id: 'g1', name: 'G1', color: 'rose' }], cards: [] }] }] } }
  const gref = (id: string): ItemRef => ({ kind: 'group', doc: 'a', course: 'c1', quiz: 'q1', group: id })
  const cardsOf = (d: Docs, doc = 'a', q = 0) => d[doc].courses[0].quizzes[q].cards.map((c) => `${c.id}${c.group ? '@' + c.group : ''}`)

  it('a group has its own menu: copy, cut, paste, move, reorder, rename, ungroup, delete', () => {
    const m = menuFor(ctx(null, gd), ['p:a:c1:q1:g1'], 'p:a:c1:q1:g1')
    expect(labels(m)).toEqual(['Open', 'Open in new tab', 'New card', 'Rename', 'Copy', 'Cut', 'Paste', 'Move to…', 'Move up', 'Move down', 'Ungroup', 'Delete'])
    expect(find(m, 'Move up')).toMatchObject({ disabled: true, reason: 'It is already first.' })
    expect(find(m, 'Move down').disabled).toBeUndefined()
    expect(find(menuFor(ctx(null, gd), ['p:a:c1:q1:g2'], 'p:a:c1:q1:g2'), 'Move down')).toMatchObject({ disabled: true, reason: 'It is already last.' })
  })
  it('keeps the one-kind rule', () => {
    const m = menuFor(ctx(null, gd), ['p:a:c1:q1:g1', 'k:a:c1:q1:k1'], 'p:a:c1:q1:g1')
    expect(find(m, 'Copy')).toMatchObject({ disabled: true, reason: 'Pick items of one kind.' })
  })
  it('reorder targets: courses, quizzes, groups, and cards within their section', () => {
    expect(reorderTarget(gd, { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q2' }, 'up')).toEqual({ target: { kind: 'course', doc: 'a', course: 'c1', index: 0 } })
    expect(reorderTarget(gd, { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1' }, 'down')).toEqual({ target: { kind: 'course', doc: 'a', course: 'c1', index: 2 } })
    expect(reorderTarget(gd, gref('g2'), 'up')).toEqual({ target: { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 0 } })
    // k4 is the second card of g1: up goes before k3 (flat place 2); k3 down goes after k4 (flat place 4)
    const card4: ItemRef = { kind: 'card', doc: 'a', course: 'c1', quiz: 'q1', card: 'k4' }
    expect(reorderTarget(gd, card4, 'up')).toEqual({ target: { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 2, group: 'g1' } })
    expect(reorderTarget(gd, card4, 'down')).toEqual({ reason: 'It is already last.' })
    expect(reorderTarget(gd, { ...card4, card: 'k1' }, 'up')).toEqual({ reason: 'It is already first.' })
    expect(reorderTarget(gd, { ...card4, card: 'k1' }, 'down')).toEqual({ target: { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 2, group: null } })
  })
  it('reordering moves one place, the groups keep their cards, and cards never leave their group', () => {
    const up = reorderTarget(gd, gref('g2'), 'up')
    const plan = 'target' in up ? placeItems(gd, [gref('g2')], up.target, 'move', fresh) : null
    expect(plan?.ok && plan.docs.a.courses[0].quizzes[0].groups.map((g) => g.id)).toEqual(['g2', 'g1'])
    expect(plan?.ok && cardsOf(plan.docs)).toEqual(['k1', 'k2', 'k5@g2', 'k3@g1', 'k4@g1'])
    const t = reorderTarget(gd, { kind: 'card', doc: 'a', course: 'c1', quiz: 'q1', card: 'k4' }, 'up')
    const moved = 'target' in t ? placeItems(gd, [{ kind: 'card', doc: 'a', course: 'c1', quiz: 'q1', card: 'k4' }], t.target, 'move', fresh) : null
    expect(moved?.ok && cardsOf(moved.docs)).toEqual(['k1', 'k2', 'k4@g1', 'k3@g1', 'k5@g2'])
  })
  it('dropping a card onto a group adds it to the end of that group', () => {
    const plan = dropPlan(gd, ['k:a:c1:q1:k1'], 'p:a:c1:q1:g2', 'inside', 'move', fresh)
    expect(plan.ok && cardsOf(plan.docs)).toEqual(['k2', 'k3@g1', 'k4@g1', 'k5@g2', 'k1@g2'])
  })
  it('dropping a card before a card of a group takes that group; onto a quiz makes it loose at the end', () => {
    const into = dropPlan(gd, ['k:a:c1:q1:k1'], 'k:a:c1:q1:k4', 'before', 'move', fresh)
    expect(into.ok && cardsOf(into.docs)).toEqual(['k2', 'k3@g1', 'k1@g1', 'k4@g1', 'k5@g2'])
    const out = dropPlan(gd, ['k:a:c1:q1:k5'], 'q:a:c1:q1', 'inside', 'move', fresh)
    expect(out.ok && cardsOf(out.docs)).toEqual(['k1', 'k2', 'k5', 'k3@g1', 'k4@g1'])
  })
  it('a group is copied with its cards, a free name, its color and fresh ids', () => {
    const plan = dropPlan(gd, ['p:a:c1:q1:g1'], 'q:b:cb:qb', 'inside', 'copy', fresh)
    expect(plan).toMatchObject({ ok: true, label: 'Copy 1 group' })
    if (!plan.ok) return
    const target = plan.docs.b.courses[0].quizzes[0]
    expect(target.groups.map((g) => [g.name, g.color])).toEqual([['G1', 'rose'], ['G1 (2)', 'coral']])
    expect(target.cards).toHaveLength(2)
    expect(target.cards.every((c) => c.group === target.groups[1].id && /^n\d+$/.test(c.id))).toBe(true)
    expect(gd.a.courses[0].quizzes[0].groups).toHaveLength(2)
  })
  it('a group moved to another quiz leaves with its cards; a refused drop says why', () => {
    const plan = dropPlan(gd, ['p:a:c1:q1:g1'], 'q:a:c1:q2', 'inside', 'move', fresh)
    expect(plan.ok && plan.docs.a.courses[0].quizzes[0].groups.map((g) => g.id)).toEqual(['g2'])
    expect(plan.ok && plan.docs.a.courses[0].quizzes[1].cards.map((c) => c.id)).toEqual(['k3', 'k4'])
    expect(dropRule(gd, ['q:a:c1:q2'], 'p:a:c1:q1:g1', 'inside', 'move')).toEqual({ ok: false, reason: "A quiz can't go inside a group." })
    expect(dropRule(gd, ['c:a:c1'], 'p:a:c1:q1:g1', 'inside', 'move')).toEqual({ ok: false, reason: "A course can't go inside a group." })
    expect(dropRule(gd, ['p:a:c1:q1:g1'], 'p:a:c1:q1:g2', 'inside', 'move')).toEqual({ ok: false, reason: "A group can't go inside a group." })
    expect(dropRule(gd, ['p:a:c1:q1:g1'], 'k:a:c1:q1:k1', 'after', 'move')).toEqual({ ok: false, reason: "A group can't go inside a card." })
    expect(dropRule(gd, ['k:a:c1:q1:k1'], 'p:a:c1:q1:g2', 'before', 'move')).toEqual({ ok: false, reason: 'Drop a card onto the group to add it to it.' })
    expect(dropRule(gd, ['p:a:c1:q1:g1'], 'c:a:c1', 'inside', 'move')).toEqual({ ok: false, reason: 'A group can only go in a quiz.' })
  })
  it('deleting a group asks and says what goes; its cards are not counted twice', () => {
    expect((deletePlan(gd, ['p:a:c1:q1:g1'], false) as { question: string }).question).toBe('Delete the group "G1" and its 2 cards?\n\nCtrl+Z brings it back.')
    const both = deletePlan(gd, ['p:a:c1:q1:g1', 'k:a:c1:q1:k3', 'k:a:c1:q1:k1'], false) as { label: string }
    expect(both.label).toBe('Delete 2 items')
  })
  it('ungrouping keeps the cards, after the loose ones, and asks as the editor does', () => {
    const plan = ungroupPlan(gd, gref('g1') as Extract<ItemRef, { kind: 'group' }>)
    expect(plan?.question).toBe('Remove the group "G1"? Its cards stay in the quiz.')
    expect(plan && cardsOf(plan.docs)).toEqual(['k1', 'k2', 'k3', 'k4', 'k5@g2'])
    expect(plan?.docs.a.courses[0].quizzes[0].groups.map((g) => g.id)).toEqual(['g2'])
  })
  it('renames a group within its quiz, refusing a taken name', () => {
    expect(renameProblem(gd, gref('g1'), 'g2')).toBe('Another group is already named "G2"')
    expect(renameItem(gd, gref('g1'), ' Mitosis ')?.a.courses[0].quizzes[0].groups[0].name).toBe('Mitosis')
  })
  it('describes a group by its card count, and shows its quiz open to a moved card', () => {
    expect(describeNode(gd, 'p:a:c1:q1:g1')).toBe('2 cards')
    expect(ancestorNodes({ kind: 'card', doc: 'a', course: 'c1', quiz: 'q1', card: 'k3' }, gd)).toEqual(['d:a', 'c:a:c1', 'q:a:c1:q1', 'p:a:c1:q1:g1'])
  })
  it('keys: Alt+Shift+arrows move, refused at the ends', () => {
    expect(keyDecision(ctx(null, gd), key('ArrowDown', { altKey: true, shiftKey: true }), ['p:a:c1:q1:g1'], 'p:a:c1:q1:g1')).toEqual({ action: 'moveDown' })
    expect(keyDecision(ctx(null, gd), key('ArrowUp', { altKey: true, shiftKey: true }), ['p:a:c1:q1:g1'], 'p:a:c1:q1:g1')).toEqual({ refuse: 'It is already first.' })
  })
  it('pastes a group after a group, and cards into one', () => {
    expect(pasteTarget(gd, { mode: 'copy', refs: [gref('g1')] }, 'p:a:c1:q1:g2')).toMatchObject({ target: { kind: 'quiz', quiz: 'q1', index: 2 } })
    expect(pasteTarget(gd, { mode: 'copy', refs: [{ kind: 'card', doc: 'a', course: 'c1', quiz: 'q1', card: 'k1' }] }, 'p:a:c1:q1:g2')).toMatchObject({ target: { kind: 'quiz', group: 'g2' } })
  })
})

describe('New card submenu', () => {
  it('lists every kind, worded as the editor does, in a quiz and a group menu', () => {
    const q = items(menuFor(ctx(), ['q:a:c1:q1'], 'q:a:c1:q1')).find((i) => i.label === 'New card')!
    expect(q.submenu?.map((s) => s.label)).toEqual(['Front and back', 'Fill in the blank', 'True or false', 'Choice question', 'Sequence'])
    expect(q.submenu?.map((s) => s.arg)).toEqual(['term', 'cloze', 'true-false', 'choice', 'sequence'])
    const gd2: Docs = { a: { ...docs.a, courses: [{ ...docs.a.courses[0], quizzes: [{ ...docs.a.courses[0].quizzes[0], groups: [{ id: 'g1', name: 'G', color: 'coral' }] }, docs.a.courses[0].quizzes[1]] }, docs.a.courses[1]] }, b: docs.b }
    const g = items(menuFor(ctx(null, gd2), ['p:a:c1:q1:g1'], 'p:a:c1:q1:g1')).find((i) => i.label === 'New card')!
    expect(g.submenu).toHaveLength(5)
  })
  it('makes each kind as the editor does, in a group when asked', () => {
    const kinds = (['term', 'cloze', 'true-false', 'choice', 'sequence'] as const).map((k) => addCard(docs, 'a', 'c1', 'q2', `n-${k}`, k)!.docs.a.courses[0].quizzes[1].cards[0])
    expect(kinds[1]).toMatchObject({ type: 'cloze', statement: '', explanation: [] })
    expect(kinds[2]).toMatchObject({ type: 'true-false', answer: true })
    expect(kinds[3]).toMatchObject({ type: 'choice', mode: 'one', right: [''], wrong: ['', ''] })
    expect(kinds[4]).toMatchObject({ type: 'sequence', steps: ['', '', ''] })
    const withGroup: Docs = { ...docs, a: { ...docs.a, courses: [{ ...docs.a.courses[0], quizzes: [docs.a.courses[0].quizzes[0], { ...docs.a.courses[0].quizzes[1], groups: [{ id: 'g1', name: 'G', color: 'coral' }] }] }, docs.a.courses[1]] } }
    const made = addCard(withGroup, 'a', 'c1', 'q2', 'x', 'choice', 'g1')!
    expect(made.docs.a.courses[0].quizzes[1].cards[0]).toMatchObject({ id: 'x', group: 'g1' })
    expect(addCard(withGroup, 'a', 'c1', 'q2', 'x', 'term', 'nope')).toBeNull()
  })
})

describe('blankCard and insertCard', () => {
  it('makes an empty card of each kind, as the editor does, keeping the sides of the last term card', () => {
    expect(blankCard('term', 'a', ['Q', 'A'])).toEqual({ id: 'a', term: '', definition: '', sides: ['Q', 'A'] })
    expect(blankCard('choice', 'b', undefined, 'g1')).toEqual({ id: 'b', type: 'choice', question: '', mode: 'one', right: [''], wrong: ['', ''], group: 'g1' })
    expect(blankCard('sequence', 'c')).toEqual({ id: 'c', type: 'sequence', title: '', steps: ['', '', ''] })
  })
  it('inserts a card at the end of its quiz or group, keeping group order, and changes nothing else', () => {
    const grouped: Docs = {
      a: { ...docs.a, courses: [{ ...docs.a.courses[0], quizzes: [{ ...docs.a.courses[0].quizzes[0], groups: [{ id: 'g1', name: 'G', color: 'coral' }, { id: 'g2', name: 'H', color: 'sky' }], cards: [{ ...card('k1') }, { ...card('k2'), group: 'g1' }, { ...card('k3'), group: 'g2' }] as Card[] }, docs.a.courses[0].quizzes[1]] }, docs.a.courses[1]] },
      b: docs.b,
    }
    const loose = insertCard(grouped, 'a', 'c1', 'q1', { id: 'n1', term: 'x', definition: 'y' })!
    expect(loose.docs.a.courses[0].quizzes[0].cards.map((c) => c.id)).toEqual(['k1', 'n1', 'k2', 'k3'])
    const inGroup = insertCard(grouped, 'a', 'c1', 'q1', { id: 'n2', term: 'x', definition: 'y', group: 'g1' })!
    expect(inGroup.docs.a.courses[0].quizzes[0].cards.map((c) => c.id)).toEqual(['k1', 'k2', 'n2', 'k3'])
    expect(inGroup.ref).toEqual({ kind: 'card', doc: 'a', course: 'c1', quiz: 'q1', card: 'n2' })
    expect(insertCard(grouped, 'a', 'c1', 'q1', { id: 'n3', term: '', definition: '', group: 'gone' })).toBeNull()
    expect(insertCard(grouped, 'a', 'c1', 'nope', { id: 'n4', term: '', definition: '' })).toBeNull()
    expect(grouped.a.courses[0].quizzes[0].cards).toHaveLength(3)
  })
})

describe('an open view-only library: copy out, never in', () => {
  const reason = 'This library is view only. Make a copy to change it.'
  const f: MenuContext['files'] = { a: { place: 'drive', readOnly: false }, b: { place: 'drive', readOnly: true } }
  const only = readOnlyOf(f)
  const both: Docs = { a: lib(), b: lib() }
  const c = ctx(null, both, f)

  it('copies, but everything that changes it is off with the reason', () => {
    const course = menuFor(c, ['c:b:c1'], 'c:b:c1')
    expect(find(course, 'Copy').disabled).toBeUndefined()
    for (const label of ['New quiz', 'Rename', 'Cut', 'Move to…', 'Move up', 'Delete']) {
      expect(find(course, label)).toMatchObject({ disabled: true, reason })
    }
    expect(find(menuFor(c, ['k:b:c1:q1:k1'], 'k:b:c1:q1:k1'), 'Edit')).toMatchObject({ disabled: true, reason })
  })
  it('nothing is pasted or dropped into it, a drag out only copies', () => {
    const clip: Clip = { mode: 'copy', refs: [quiz('q1')] }
    expect(pasteTarget(both, clip, 'c:b:c1', only)).toEqual({ reason })
    expect(pasteTarget(both, clip, 'c:a:c2', only)).toMatchObject({ target: { doc: 'a' } })
    expect(dropRule(both, ['q:a:c1:q1'], 'c:b:c2', 'inside', 'move', only)).toEqual({ ok: false, reason })
    expect(dragEffect(['q:b:c1:q1'], 'move', only)).toBe('copy')
    expect(dropRule(both, ['q:b:c1:q1'], 'c:a:c2', 'inside', 'move', only)).toEqual({ ok: true })
    expect(deletePlan(both, ['k:b:c1:q1:k1'], false, only)).toEqual({ reason })
  })
  it('is no place to move things to', () => {
    expect(moveDestinations(both, names, [quiz('q1')], only).every((d) => d.target.doc !== 'b')).toBe(true)
  })
})
