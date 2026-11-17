import { describe, expect, it } from 'vitest'
import { emptyLibrary, type Course, type Library } from '../model'
import type { FileRef } from '../storage/fileStorage'
import type { DocRecord } from '../storage/workspaceRecord'
import {
  activeDoc,
  activeTab,
  addDoc,
  activateDoc,
  applyEdit,
  closeDoc,
  docRecord,
  dropDraft,
  emptyWorkspace,
  freeDocName,
  hasChanges,
  makeDoc,
  markSaved,
  paste,
  readLayout,
  readRoute,
  redoEdit,
  reopenFile,
  replaceDoc,
  restore,
  setRoute,
  takeRecord,
  toClipboard,
  undoEdit,
  workspaceRecord,
  type Workspace,
} from './workspace'

const HOME = { name: 'home' } as const
const course = (id: string, name = id): Course => ({ id, name, quizzes: [] })
const lib = (...courses: Course[]): Library => ({ ...emptyLibrary(), courses })
const rename = (doc: string, courseId: string, name: string) => (docs: Record<string, Library>) => ({
  ...docs,
  [doc]: { ...docs[doc], courses: docs[doc].courses.map((c) => (c.id === courseId ? { ...c, name } : c)) },
})

// Two open documents: a (courses a1, a2) and b (course b1); b is active (opened last).
function two(): Workspace {
  let w = emptyWorkspace('g')
  w = addDoc(w, makeDoc('a', lib(course('a1'), course('a2')), 'A'), HOME)
  w = addDoc(w, makeDoc('b', lib(course('b1')), 'B'), HOME)
  return w
}

describe('documents and tabs', () => {
  it('opens each document in a tab of its own, the last one active', () => {
    const w = two()
    expect(w.order).toEqual(['a', 'b'])
    expect(activeDoc(w)).toBe('b')
    expect(activeDoc(activateDoc(w, 'a'))).toBe('a')
  })

  it('keeps the page each tab shows', () => {
    let w = setRoute(two(), { name: 'course', course: 'b1' })
    w = activateDoc(w, 'a')
    expect(activeTab(w)?.data).toEqual({ kind: 'doc', doc: 'a', route: HOME })
    w = activateDoc(w, 'b')
    expect(activeTab(w)?.data).toEqual({ kind: 'doc', doc: 'b', route: { name: 'course', course: 'b1' } })
    expect(setRoute(w, { name: 'course', course: 'b1' })).toBe(w)
  })

  it('names new documents uniquely among the open ones', () => {
    let w = emptyWorkspace('g')
    for (const id of ['x', 'y', 'z']) w = addDoc(w, makeDoc(id, emptyLibrary(), freeDocName(w, 'New library')), HOME)
    expect(w.order.map((id) => w.docs[id].name)).toEqual(['New library', 'New library 2', 'New library 3'])
    w = closeDoc(w, 'y')
    expect(freeDocName(w, 'New library')).toBe('New library 2')
  })
})

describe('apply and the history', () => {
  it('changes only the documents the update changed and marks them unsaved by reference', () => {
    const w = applyEdit(two(), 'Rename course', rename('a', 'a1', 'One'), 1000)
    expect(w.docs.a.library.courses[0].name).toBe('One')
    expect(hasChanges(w.docs.a)).toBe(true)
    expect(hasChanges(w.docs.b)).toBe(false)
    expect(w.history.past).toHaveLength(1)
    expect(Object.keys(w.history.past[0].before)).toEqual(['a'])
  })

  it('records nothing when nothing changed', () => {
    const w = two()
    expect(applyEdit(w, 'Nothing', (docs) => docs, 0)).toBe(w)
  })

  it('merges typing in one field within 1.5 s, and undo goes back to the saved library', () => {
    const start = two()
    let w = applyEdit(start, 'Rename course', rename('a', 'a1', 'O'), 1000, 'course:a1')
    w = applyEdit(w, 'Rename course', rename('a', 'a1', 'On'), 1500, 'course:a1')
    w = applyEdit(w, 'Rename course', rename('a', 'a1', 'One'), 2500, 'course:a1')
    expect(w.history.past).toHaveLength(1)
    const undone = undoEdit(w)!
    expect(undone.entry.label).toBe('Rename course')
    expect(undone.workspace.docs.a.library).toBe(start.docs.a.library)
    expect(hasChanges(undone.workspace.docs.a)).toBe(false)
    const redone = redoEdit(undone.workspace)!
    expect(redone.workspace.docs.a.library.courses[0].name).toBe('One')
    expect(hasChanges(redone.workspace.docs.a)).toBe(true)
  })

  it('does not merge after 1.5 s, nor after an undo', () => {
    let w = applyEdit(two(), 'Rename course', rename('a', 'a1', 'O'), 1000, 'course:a1')
    w = applyEdit(w, 'Rename course', rename('a', 'a1', 'On'), 2600, 'course:a1')
    expect(w.history.past).toHaveLength(2)
    w = undoEdit(w)!.workspace
    w = applyEdit(w, 'Rename course', rename('a', 'a1', 'Ox'), 2700, 'course:a1')
    expect(w.history.past).toHaveLength(2)
    expect(w.history.future).toEqual([])
  })

  it('undoes a change across documents as one step', () => {
    const start = two()
    const both = (docs: Record<string, Library>) => rename('b', 'b1', 'Bee')(rename('a', 'a2', 'Two')(docs))
    const w = applyEdit(start, 'Edit both', both, 0)
    const back = undoEdit(w)!.workspace
    expect(back.docs.a.library).toBe(start.docs.a.library)
    expect(back.docs.b.library).toBe(start.docs.b.library)
  })

  it('a saved document counts its library at save time: an edit during the save keeps the mark', () => {
    let w = applyEdit(two(), 'Rename course', rename('a', 'a1', 'One'), 0)
    const saving = w.docs.a.library
    w = applyEdit(w, 'Rename course', rename('a', 'a2', 'Two'), 5000)
    w = markSaved(w, 'a', saving)
    expect(hasChanges(w.docs.a)).toBe(true)
    w = undoEdit(w)!.workspace
    expect(hasChanges(w.docs.a)).toBe(false)
  })

  it('a document replaced from outside drops its history entries, keeping the others', () => {
    let w = applyEdit(two(), 'A', rename('a', 'a1', 'One'), 0)
    w = applyEdit(w, 'B', rename('b', 'b1', 'Bee'), 5000)
    w = applyEdit(w, 'Both', (docs) => rename('b', 'b1', 'Bea')(rename('a', 'a1', 'Uno')(docs)), 10000)
    const pulled = lib(course('n1'))
    w = replaceDoc(w, 'a', pulled)
    expect(w.docs.a.library).toBe(pulled)
    expect(hasChanges(w.docs.a)).toBe(false)
    expect(w.docs.a.replaced).toBe(1)
    expect(w.history.past.map((e) => [e.label, Object.keys(e.before)])).toEqual([
      ['B', ['b']],
      ['Both', ['b']],
    ])
  })

  it('takes up another tab\'s record, its unsaved mark too', () => {
    const rec: DocRecord = { id: 'a', library: lib(course('t')), dirty: true, drive: null, file: null }
    const w = takeRecord(applyEdit(two(), 'A', rename('a', 'a1', 'One'), 0), rec)
    expect(w.docs.a.library).toBe(rec.library)
    expect(hasChanges(w.docs.a)).toBe(true)
    expect(w.history.past).toEqual([])
  })
})

describe('closing', () => {
  it('removes the document, its tab and its history, and activates another', () => {
    let w = applyEdit(two(), 'B', rename('b', 'b1', 'Bee'), 0)
    w = closeDoc(w, 'b')
    expect(w.order).toEqual(['a'])
    expect(w.docs.b).toBeUndefined()
    expect(Object.values(w.layout.tabs).map((t) => t.data)).toEqual([{ kind: 'doc', doc: 'a', route: HOME }])
    expect(activeDoc(w)).toBe('a')
    expect(w.history.past).toEqual([])
    expect(activeDoc(closeDoc(w, 'a'))).toBeNull()
  })

  it('turns a cut from it into a copy', () => {
    let w = toClipboard(two(), [{ kind: 'course', doc: 'a', course: 'a1' }], 'cut')
    w = closeDoc(w, 'a')
    expect(w.clipboard?.mode).toBe('copy')
    // Pasting it still works: the copy taken at cut time goes in with new ids.
    let n = 0
    w = paste(w, { kind: 'doc', doc: 'b' }, () => `new${++n}`, 0)
    expect(w.docs.b.library.courses.map((c) => c.id)).toEqual(['b1', 'new1'])
  })
})

describe('clipboard', () => {
  it('a cut pasted elsewhere moves its items as one step, then holds a copy', () => {
    let w = toClipboard(two(), [{ kind: 'course', doc: 'a', course: 'a1' }], 'cut')
    w = paste(w, { kind: 'doc', doc: 'b' }, () => 'never', 0)
    expect(w.docs.a.library.courses.map((c) => c.id)).toEqual(['a2'])
    expect(w.docs.b.library.courses.map((c) => c.id)).toEqual(['b1', 'a1'])
    expect(w.history.past.map((e) => e.label)).toEqual(['Move course'])
    expect(w.clipboard).toMatchObject({ mode: 'copy', refs: [{ kind: 'course', doc: 'b', course: 'a1' }] })
    const back = undoEdit(w)!.workspace
    expect(back.docs.a.library.courses.map((c) => c.id)).toEqual(['a1', 'a2'])
    expect(back.docs.b.library.courses.map((c) => c.id)).toEqual(['b1'])
  })

  it('refuses what does not fit, changing nothing', () => {
    const w = toClipboard(two(), [{ kind: 'course', doc: 'a', course: 'a1' }], 'copy')
    expect(() => paste(w, { kind: 'course', doc: 'b', course: 'b1' }, () => 'x', 0)).toThrow('A course can only go in a file.')
    expect(() => paste(two(), { kind: 'doc', doc: 'b' }, () => 'x', 0)).toThrow()
  })
})

describe('drafts', () => {
  it('a draft course left at once is dropped, and the library is the saved one again', () => {
    const start = two()
    const w = applyEdit(start, 'Add course', (docs) => ({ ...docs, a: { ...docs.a, courses: [...docs.a.courses, course('d')] } }), 0)
    const dropped = dropDraft(w, 'a', 'd')
    expect(dropped.docs.a.library).toBe(start.docs.a.library)
    expect(hasChanges(dropped.docs.a)).toBe(false)
    expect(dropped.history.past).toEqual([])
  })
})

describe('opening a file that is already open', () => {
  const file = (modified: number, size = 10): FileRef => ({ name: 'x.shrimp', handle: null, size, modified })

  it('activates its document; changed on disk, it reloads when there is nothing to lose', () => {
    let w = addDoc(two(), makeDoc('f', lib(course('f1')), 'x.shrimp', { file: file(1) }), HOME)
    w = activateDoc(w, 'a')
    const same = reopenFile(w, 'f', lib(course('z')), file(1))
    expect(activeDoc(same.workspace)).toBe('f')
    expect(same.workspace.docs.f.library.courses[0].id).toBe('f1')
    const fresh = lib(course('z'))
    const changed = reopenFile(w, 'f', fresh, file(2))
    expect(changed.ask).toBe(false)
    expect(changed.workspace.docs.f.library).toBe(fresh)
    expect(changed.workspace.docs.f.file?.modified).toBe(2)
  })

  it('asks first when there are unsaved changes', () => {
    let w = addDoc(two(), makeDoc('f', lib(course('f1')), 'x.shrimp', { file: file(1) }), HOME)
    w = applyEdit(w, 'Rename course', rename('f', 'f1', 'Mine'), 0)
    const r = reopenFile(w, 'f', lib(course('z')), file(2))
    expect(r.ask).toBe(true)
    expect(r.workspace.docs.f.library.courses[0].name).toBe('Mine')
  })
})

describe('what the browser keeps', () => {
  it('restores documents (unsaved ones unsaved), names, the layout and the active one', () => {
    let w = two()
    w = applyEdit(w, 'A', rename('a', 'a1', 'One'), 0)
    w = activateDoc(w, 'a')
    w = setRoute(w, { name: 'course', course: 'One' })
    const records = w.order.map((id) => docRecord(w.docs[id]))
    const back = restore({ workspace: JSON.parse(JSON.stringify(workspaceRecord(w))), docs: JSON.parse(JSON.stringify(records)), handles: {} }, 'g2')
    expect(back.order).toEqual(['a', 'b'])
    expect(back.docs.a.name).toBe('A')
    expect(hasChanges(back.docs.a)).toBe(true)
    expect(hasChanges(back.docs.b)).toBe(false)
    expect(activeDoc(back)).toBe('a')
    expect(activeTab(back)?.data).toEqual({ kind: 'doc', doc: 'a', route: { name: 'course', course: 'One' } })
  })

  it('falls back to one tab per document when the layout is malformed, and names unnamed documents', () => {
    const docs: DocRecord[] = ['p', 'q'].map((id) => ({ id, library: emptyLibrary(), dirty: false, drive: null, file: null }))
    const w = restore({ workspace: { version: 1, docs: ['p', 'q'], layout: { tabs: 3 }, explorer: 'x', ui: null }, docs, handles: {} }, 'g')
    expect(w.order.map((id) => w.docs[id].name)).toEqual(['New library', 'New library 2'])
    expect(activeDoc(w)).toBe('p')
    expect(Object.keys(w.layout.tabs)).toHaveLength(2)
    expect(w.explorer).toEqual({ expanded: [], selection: { ids: [], anchor: null, focus: null } })
  })

  it('drops tabs of documents no longer open and adds tabs for the others', () => {
    const l = readLayout(workspaceRecord(two()).layout, ['b', 'c'], 'g')
    expect(Object.values(l.tabs).map((t) => (t.data.kind === 'doc' ? t.data.doc : '')).sort()).toEqual(['b', 'c'])
  })

  it('never keeps a Drive link as a page', () => {
    expect(readRoute({ name: 'drive', id: 'x' })).toBeNull()
    expect(readRoute({ name: 'study', course: 'c', quiz: 'q', format: 'typing' })).toEqual({ name: 'study', course: 'c', quiz: 'q', format: 'typing' })
    expect(readRoute({ name: 'study', course: 'c', quiz: 'q', format: 'nope' })).toBeNull()
  })
})
