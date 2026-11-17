import { describe, expect, it } from 'vitest'
import { emptyLibrary, type Course, type Library } from '../model'
import type { DriveSource } from '../storage/googleDrive'
import type { DocRecord } from '../storage/workspaceRecord'
import { MAIN, groupOf, groupsIn } from '../kit/layout'
import {
  activeDoc,
  activeTab,
  activateTab,
  addDoc,
  addressTab,
  activateDoc,
  closeTabs,
  dockWindow,
  followHistory,
  focusedGroup,
  shownTab,
  duplicateTab,
  explorerView,
  setExplorerView,
  activateGroup,
  showAppPage,
  moveTab,
  openPlace,
  popOutGroup,
  patchDoc,
  popOutTab,
  recentGroup,
  setTabRoute,
  showExplorer,
  splitGroup,
  applyEdit,
  closeDoc,
  forgetClosed,
  openCopy,
  paneLayout,
  reopenClosed,
  setSignedIn,
  settleViewOnly,
  signedOut,
  forAccount,
  unsavedDrive,
  viewOnly,
  docRecord,
  dropDraft,
  emptyWorkspace,
  followRenames,
  freeDocName,
  hasChanges,
  lastStep,
  makeDoc,
  markSaved,
  paste,
  readLayout,
  readRoute,
  readyToClose,
  renameDoc,
  redoEdit,
  replaceDoc,
  restore,
  takeRecord,
  toClipboard,
  undoEdit,
  undoStep,
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

// Fresh ids for what a transition creates (tabs, groups).
const ids = () => {
  let n = 0
  return () => `id${++n}`
}

// Two open documents: a (courses a1, a2) in tab ta and b (course b1) in tab tb; b is active (opened last).
function two(): Workspace {
  let w = emptyWorkspace('g')
  w = addDoc(w, makeDoc('a', lib(course('a1'), course('a2')), 'A'), HOME, 'ta')
  w = addDoc(w, makeDoc('b', lib(course('b1')), 'B'), HOME, 'tb')
  return w
}
const route = (w: Workspace, tab: string) => {
  const d = w.layout.tabs[tab]?.data
  return d?.kind === 'doc' ? d.route : null
}

describe('documents and tabs', () => {
  it('opens each document in a tab of its own, the last one active', () => {
    const w = two()
    expect(w.order).toEqual(['a', 'b'])
    expect(activeDoc(w)).toBe('b')
    expect(activeDoc(activateDoc(w, 'a', 'x'))).toBe('a')
  })

  it('keeps the page each tab shows', () => {
    let w = setTabRoute(two(), 'tb', { name: 'course', course: 'b1' })
    w = activateDoc(w, 'a', 'x')
    expect(activeTab(w)?.data).toEqual({ kind: 'doc', doc: 'a', route: HOME })
    w = activateDoc(w, 'b', 'x')
    expect(activeTab(w)?.data).toEqual({ kind: 'doc', doc: 'b', route: { name: 'course', course: 'b1' } })
    expect(setTabRoute(w, 'tb', { name: 'course', course: 'B1' })).toBe(w)
  })

  it('names new documents uniquely among the open and closed ones', () => {
    let w = emptyWorkspace('g')
    for (const id of ['x', 'y', 'z']) w = addDoc(w, makeDoc(id, emptyLibrary(), freeDocName(w, 'New library')), HOME, `t${id}`)
    expect(w.order.map((id) => w.docs[id].name)).toEqual(['New library', 'New library 2', 'New library 3'])
    w = closeDoc(w, 'y')
    expect(freeDocName(w, 'New library')).toBe('New library 4')
    expect(freeDocName(forgetClosed(w, 'y'), 'New library')).toBe('New library 2')
  })
})

describe('renameDoc', () => {
  it('names a document without touching its history or saved mark', () => {
    const w = addDoc(emptyWorkspace('g'), makeDoc('x', emptyLibrary(), 'New library'), HOME, 'tx')
    const r = renameDoc(w, 'x', 'Biology')
    expect(r.docs.x.name).toBe('Biology')
    expect(r.history).toBe(w.history)
    expect(hasChanges(r.docs.x)).toBe(false)
    expect(renameDoc(r, 'x', 'Biology')).toBe(r)
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
    w = applyEdit(w, 'A again', rename('a', 'a1', 'Uno'), 10000)
    const pulled = lib(course('n1'))
    w = replaceDoc(w, 'a', pulled)
    expect(w.docs.a.library).toBe(pulled)
    expect(hasChanges(w.docs.a)).toBe(false)
    expect(w.docs.a.replaced).toBe(1)
    expect(w.history.past.map((e) => [e.label, Object.keys(e.before)])).toEqual([['B', ['b']]])
  })

  it('a step that also changed the replaced document goes whole, with every step before it', () => {
    let w = applyEdit(two(), 'B', rename('b', 'b1', 'Bee'), 0)
    w = applyEdit(w, 'Both', (docs) => rename('b', 'b1', 'Bea')(rename('a', 'a1', 'Uno')(docs)), 5000)
    w = applyEdit(w, 'B again', rename('b', 'b1', 'Bo'), 10000)
    w = replaceDoc(w, 'a', lib(course('n1')))
    expect(w.history.past.map((e) => e.label)).toEqual(['B again'])
    // Undone, B steps back to what came after the shared step, never past it.
    expect(undoEdit(w)!.workspace.docs.b.library.courses[0].name).toBe('Bea')
  })

  it("takes up another tab's record with its Drive file; that tab's unsaved changes are its own to save", () => {
    const drive: DriveSource = { id: 'x', name: 'A.shrimp', md5: 'new', shared: false, mine: true, trashed: false }
    const rec: DocRecord = { id: 'a', library: lib(course('t')), dirty: true, drive }
    const w = takeRecord(applyEdit(two(), 'A', rename('a', 'a1', 'One'), 0), rec)
    expect(w.docs.a.library).toBe(rec.library)
    expect(w.docs.a.drive).toBe(drive)
    expect(w.history.past).toEqual([])
    // Not to save here, but never counted as saved: they wait in the other tab.
    expect(hasChanges(w.docs.a)).toBe(false)
    expect(w.docs.a.dirtyElsewhere).toBe(true)
    // The record this tab would write says what the one taken says, so it never goes back as an echo that marks the
    // other tab's change saved.
    expect(docRecord(w.docs.a)).toEqual(rec)
    // Taken once that tab saved: nothing waits anywhere.
    const saved = takeRecord(w, { ...rec, dirty: false })
    expect(saved.docs.a.dirtyElsewhere).toBe(false)
    expect(docRecord(saved.docs.a).dirty).toBe(false)
  })

  it("a save from here holds what another tab had not saved: it waits no more", () => {
    const drive: DriveSource = { id: 'x', name: 'A.shrimp', md5: 'm', shared: false, mine: true, trashed: false }
    let w = takeRecord(setSignedIn(two(), true), { id: 'a', library: lib(course('t')), dirty: true, drive })
    w = applyEdit(w, 'A', rename('a', 't', 'Tea'), 0)
    w = markSaved(w, 'a', w.docs.a.library)
    expect(w.docs.a.dirtyElsewhere).toBe(false)
    expect(docRecord(w.docs.a).dirty).toBe(false)
  })

  it('a toast\'s undo undoes its own step only while it is the last one', () => {
    const start = two()
    let w = applyEdit(start, 'Delete', rename('a', 'a1', 'Gone'), 0)
    const step = lastStep(w)
    expect(undoStep(w, step)!.workspace.docs.a.library).toBe(start.docs.a.library)
    w = applyEdit(w, 'Typing', rename('b', 'b1', 'Bee'), 100)
    expect(undoStep(w, step)).toBeNull()
    expect(undoStep(undoEdit(w)!.workspace, step)!.workspace.docs.a.library).toBe(start.docs.a.library)
    expect(undoStep(start, lastStep(start))).toBeNull()
  })
})

describe('closing', () => {
  it('after a move between files, closing one leaves no step that would undo the move in half', () => {
    let w = addDoc(two(), makeDoc('y', lib(course('y1')), 'Y'), HOME, 'ty')
    w = applyEdit(w, 'Y first', rename('y', 'y1', 'Why'), 0)
    w = toClipboard(w, [{ kind: 'course', doc: 'a', course: 'a1' }], 'cut')
    w = paste(w, { kind: 'doc', doc: 'y' }, () => 'x', 5000)
    expect(w.docs.y.library.courses.map((c) => c.id)).toEqual(['y1', 'a1'])
    w = closeDoc(w, 'a')
    expect(w.history.past).toEqual([])
    expect(undoEdit(w)).toBeNull()
    expect(w.docs.y.library.courses.map((c) => c.id)).toEqual(['y1', 'a1'])
  })

  it('asks until there is nothing left to lose: changes made while it saved are asked about again', async () => {
    let dirty: boolean | null = true
    const asked: string[] = []
    const ask = (answer: 'save' | 'discard' | null) => async () => (asked.push(String(answer)), answer)
    let saves = 0
    // The first save lands, but an edit came in meanwhile; the second leaves nothing.
    const save = async () => {
      saves++
      dirty = saves === 1
      return true
    }
    expect(await readyToClose(() => dirty, ask('save'), save)).toBe(true)
    expect(saves).toBe(2)
    expect(asked).toEqual(['save', 'save'])
    dirty = true
    expect(await readyToClose(() => dirty, ask(null), save)).toBe(false)
    expect(await readyToClose(() => dirty, ask('discard'), save)).toBe(true)
    expect(await readyToClose(() => dirty, ask('save'), async () => false)).toBe(false)
    expect(await readyToClose(() => false, ask('save'), save)).toBe(true)
    expect(await readyToClose(() => null, ask('save'), save)).toBe(false)
  })

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

  it('never removes the file: it heads the closed files, one entry per Drive file', () => {
    const drive = (id: string): DriveSource => ({ id, name: `${id}.shrimp`, md5: 'm', shared: true, mine: false, trashed: false })
    let w = closeDoc(two(), 'b')
    expect(w.closed).toEqual([{ id: 'b', name: 'B', drive: null }])
    w = closeDoc(w, 'a')
    expect(w.closed.map((c) => c.id)).toEqual(['a', 'b'])
    // A Drive file opened again (another document) and closed again replaces its older entry.
    w = addDoc(w, makeDoc('d1', lib(), 'D', { drive: drive('x') }), HOME, 't1')
    w = closeDoc(w, 'd1')
    w = addDoc(w, makeDoc('d2', lib(), 'D', { drive: drive('x') }), HOME, 't2')
    w = closeDoc(w, 'd2')
    expect(w.closed.map((c) => [c.id, c.drive?.id ?? null])).toEqual([['d2', 'x'], ['a', null], ['b', null]])
    expect(closeDoc(w, 'nope')).toBe(w)
  })

  it('opens a closed file again in a new tab, its entry gone; removes one from the list', () => {
    let w = closeDoc(two(), 'b')
    const back = makeDoc('b', lib(course('b1')), 'B')
    w = reopenClosed(w, back, { name: 'course', course: 'b1' }, 'tb2')
    expect(w.order).toEqual(['a', 'b'])
    expect(w.closed).toEqual([])
    expect(activeTab(w)?.data).toEqual({ kind: 'doc', doc: 'b', route: { name: 'course', course: 'b1' } })
    // Already open: shown, nothing added.
    expect(Object.keys(reopenClosed(w, back, HOME, 'x').layout.tabs)).not.toContain('x')
    w = closeDoc(closeDoc(w, 'b'), 'a')
    expect(forgetClosed(w, 'b').closed.map((c) => c.id)).toEqual(['a'])
    expect(forgetClosed(w, 'zzz')).toBe(w)
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
  const draft = course('d')
  const added = (start: Workspace) =>
    applyEdit(start, 'Add course', (docs) => ({ ...docs, a: { ...docs.a, courses: [...docs.a.courses, draft] } }), 0)

  it('a draft course left at once is dropped, and the library is the saved one again', () => {
    const start = two()
    const dropped = dropDraft(added(start), 'a', draft)
    expect(dropped.docs.a.library).toBe(start.docs.a.library)
    expect(hasChanges(dropped.docs.a)).toBe(false)
    expect(dropped.history.past).toEqual([])
  })

  it('a draft changed since (renamed in the Explorer, given a quiz, pasted or moved into) stays', () => {
    const renamed = applyEdit(added(two()), 'Rename course', rename('a', 'd', 'Biology'), 100)
    expect(dropDraft(renamed, 'a', draft)).toBe(renamed)
    const withQuiz = applyEdit(added(two()), 'Add quiz', (docs) => ({
      ...docs,
      a: { ...docs.a, courses: docs.a.courses.map((c) => (c.id === 'd' ? { ...c, quizzes: [{ id: 'q', name: 'Q', groups: [], cards: [] }] } : c)) },
    }), 100)
    expect(dropDraft(withQuiz, 'a', draft)).toBe(withQuiz)
  })
})

describe('following renames', () => {
  it('every tab of the file follows a rename of its course or quiz, shown or not', () => {
    const quiz = { id: 'q1', name: 'Quiz one', groups: [], cards: [] }
    let w = addDoc(two(), makeDoc('f', lib({ id: 'c1', name: 'Bio', quizzes: [quiz] }, course('c2', 'Gone')), 'F'), { name: 'quiz', course: 'Bio', quiz: 'Quiz one' }, 'tq')
    w = openPlace(w, 'f', { name: 'course', course: 'bio' }, 'tc', { newTab: true, background: true }).workspace
    w = openPlace(w, 'f', { name: 'course', course: 'Gone' }, 'tg', { newTab: true, background: true }).workspace
    const before = w.docs.f.library
    w = applyEdit(w, 'Rename course', rename('f', 'c1', 'Biology'), 0)
    w = applyEdit(w, 'Delete course', (docs) => ({ ...docs, f: { ...docs.f, courses: docs.f.courses.filter((c) => c.id !== 'c2') } }), 5000)
    const followed = followRenames(w, 'f', before)
    expect(route(followed, 'tq')).toEqual({ name: 'quiz', course: 'Biology', quiz: 'Quiz one' })
    expect(route(followed, 'tc')).toEqual({ name: 'course', course: 'Biology' })
    expect(route(followed, 'tg')).toEqual({ name: 'course', course: 'Gone' })
    expect(route(followed, 'ta')).toEqual(HOME)
    // Nothing renamed: the same workspace.
    expect(followRenames(followed, 'f', followed.docs.f.library)).toBe(followed)
  })
})

describe('view-only libraries', () => {
  const drive = (mine: boolean): DriveSource => ({ id: `x-${mine}`, name: 'A.shrimp', md5: 'm', shared: !mine, mine, trashed: false })
  const withDrive = (w: Workspace, id: string, mine: boolean) => patchDoc(w, id, { drive: drive(mine) })

  it("someone else's Drive file is view only; signed out, every Drive file is", () => {
    const w = setSignedIn(withDrive(withDrive(two(), 'a', true), 'b', false), true)
    expect([viewOnly(w, 'a'), viewOnly(w, 'b')]).toEqual([false, true])
    const out = setSignedIn(w, false)
    expect([viewOnly(out, 'a'), viewOnly(out, 'b')]).toEqual([true, true])
    expect(viewOnly(setSignedIn(two(), false), 'a')).toBe(false)
    expect(setSignedIn(w, true)).toBe(w)
  })

  it('no change, paste or cut ever touches one; copying out works, and a cut from one pastes a copy', () => {
    const w = setSignedIn(withDrive(two(), 'b', false), true)
    expect(() => applyEdit(w, 'Rename', rename('b', 'b1', 'Bee'), 0)).toThrow('This library is view only. Make a copy to change it.')
    expect(() => applyEdit(w, 'Both', (docs) => rename('b', 'b1', 'Bee')(rename('a', 'a1', 'One')(docs)), 0)).toThrow()
    expect(applyEdit(w, 'Rename', rename('a', 'a1', 'One'), 0).docs.a.library.courses[0].name).toBe('One')
    expect(() => toClipboard(w, [{ kind: 'course', doc: 'b', course: 'b1' }], 'cut')).toThrow('view only')
    const copied = toClipboard(w, [{ kind: 'course', doc: 'b', course: 'b1' }], 'copy')
    expect(() => paste(copied, { kind: 'doc', doc: 'b' }, () => 'x', 0)).toThrow('view only')
    const pasted = paste(copied, { kind: 'doc', doc: 'a' }, () => 'n1', 0)
    expect(pasted.docs.a.library.courses.map((c) => c.id)).toEqual(['a1', 'a2', 'n1'])
    expect(pasted.docs.b.library).toBe(w.docs.b.library)
    // A cut taken before its library turned view only pastes a copy, leaving that library as it is.
    const cut = withDrive(toClipboard(setSignedIn(two(), true), [{ kind: 'course', doc: 'a', course: 'a1' }], 'cut'), 'a', false)
    const pastedCopy = paste(cut, { kind: 'doc', doc: 'b' }, () => 'n2', 0)
    expect(pastedCopy.docs.a.library).toBe(cut.docs.a.library)
    expect(pastedCopy.docs.b.library.courses.map((c) => c.id)).toEqual(['b1', 'n2'])
    expect(pastedCopy.clipboard?.mode).toBe('copy')
  })

  it("changes one held from before move to a browser library of their own, and its file is read again", () => {
    let w = applyEdit(two(), 'Rename', rename('b', 'b1', 'Mine'), 0)
    w = toClipboard(w, [{ kind: 'course', doc: 'b', course: 'b1' }], 'cut')
    w = setSignedIn(withDrive(w, 'b', false), true)
    const { workspace, kept } = settleViewOnly(w, () => 'kept')
    expect(kept).toEqual([{ from: 'b', to: 'kept' }])
    expect(workspace.order).toEqual(['a', 'b', 'kept'])
    expect(workspace.docs.kept).toMatchObject({ name: 'A (my changes)', drive: null })
    expect(workspace.docs.kept.library.courses[0].name).toBe('Mine')
    expect(hasChanges(workspace.docs.b)).toBe(false)
    expect(workspace.docs.b.drive?.md5).toBe('')
    expect(workspace.history.past).toEqual([])
    expect(workspace.clipboard?.mode).toBe('copy')
    expect(settleViewOnly(workspace, () => 'again').kept).toEqual([])
    const calm = setSignedIn(withDrive(two(), 'b', false), true)
    expect(settleViewOnly(calm, () => 'x').workspace).toBe(calm)
  })

  it('lists the own Drive files with changes not on Drive yet, waiting or paused (checked again before signing out)', () => {
    let w = setSignedIn(withDrive(withDrive(two(), 'a', true), 'b', false), true)
    expect(unsavedDrive(w)).toEqual([])
    w = applyEdit(w, 'A', rename('a', 'a1', 'One'), 0)
    expect(unsavedDrive(w)).toEqual(['a'])
    w = patchDoc(markSaved(w, 'a', w.docs.a.library), 'a', { problem: 'signIn' })
    expect(unsavedDrive(w)).toEqual(['a'])
    w = patchDoc(w, 'a', { problem: null })
    expect(unsavedDrive(w)).toEqual([])
    // A browser library and a view-only file never wait for Drive.
    const browser = applyEdit(setSignedIn(two(), true), 'B', rename('b', 'b1', 'Bee'), 0)
    expect(unsavedDrive(browser)).toEqual([])
  })

  it('signed out in another tab: changes not on Drive yet stay, as browser libraries, and the Drive files close', () => {
    let w = setSignedIn(withDrive(two(), 'a', true), true)
    w = applyEdit(w, 'A', rename('a', 'a1', 'Mine'), 0)
    const { workspace, kept } = settleViewOnly(setSignedIn(w, false), () => 'kept')
    const out = signedOut(workspace)
    expect(kept).toEqual([{ from: 'a', to: 'kept' }])
    expect(out.order).toEqual(['kept', 'b'])
    expect(out.docs.kept.library.courses[0].name).toBe('Mine')
    expect(out.docs.kept.drive).toBeNull()
  })

  it("another account's own Drive file is view only, and closes for that account", () => {
    const owned = (owner: string) => patchDoc(two(), 'a', { drive: { ...drive(true), owner } })
    const w = setSignedIn(owned('a@x'), true, 'b@x')
    expect(viewOnly(w, 'a')).toBe(true)
    expect(viewOnly(setSignedIn(owned('a@x'), true, 'a@x'), 'a')).toBe(false)
    // An account not known yet judges nothing.
    expect(viewOnly(setSignedIn(owned('a@x'), true), 'a')).toBe(false)
    expect(forAccount(w, 'b@x').order).toEqual(['b'])
    expect(forAccount(w, 'a@x')).toBe(w)
    expect(forAccount(setSignedIn(owned('a@x'), false), null).order).toEqual(['b'])
    expect(forAccount(patchDoc(two(), 'a', { drive: drive(true) }), 'b@x').order).toEqual(['a', 'b'])
  })

  it('signing out closes only the own Drive libraries, and keeps shared and browser ones and the closed entries', () => {
    let w = setSignedIn(addDoc(two(), makeDoc('c', lib(), 'C', { drive: drive(false) }), HOME, 'tc'), true)
    w = withDrive(w, 'a', true)
    w = closeDoc(w, 'c')
    w = addDoc(w, makeDoc('d', lib(), 'D'), HOME, 'td')
    w = closeDoc(w, 'd')
    const out = signedOut(w)
    expect(out.signedIn).toBe(false)
    expect(out.order).toEqual(['b'])
    expect(out.closed.map((c) => c.id)).toEqual(['d', 'c'])
    expect(Object.values(out.layout.tabs).map((t) => (t.data.kind === 'doc' ? t.data.doc : ''))).toEqual(['b'])
    // A shared (not own) Drive file stays.
    expect(signedOut(setSignedIn(withDrive(two(), 'a', false), true)).order).toEqual(['a', 'b'])
  })

  it('a copy opens on the same page in the tab that showed the original, which stays open', () => {
    let w = setTabRoute(two(), 'tb', { name: 'course', course: 'b1' })
    w = setSignedIn(withDrive(w, 'b', false), true)
    const copy = makeDoc('c', w.docs.b.library, 'Copy of A')
    let next = openCopy(w, 'b', copy, 'new')
    expect(next.order).toEqual(['a', 'b', 'c'])
    expect(activeTab(next)?.id).toBe('tb')
    expect(route(next, 'tb')).toEqual({ name: 'course', course: 'b1' })
    expect(activeDoc(next)).toBe('c')
    expect(viewOnly(next, 'c')).toBe(false)
    // Shown in no tab: a new one on its home.
    next = openCopy(closeTabs(w, ['tb']), 'b', copy, 'new')
    expect(next.layout.tabs.new.data).toEqual({ kind: 'doc', doc: 'c', route: HOME })
    expect(openCopy(w, 'zzz', copy, 'new')).toBe(w)
  })
})

describe('what the browser keeps', () => {
  it('restores documents (unsaved ones unsaved), names, the layout and the active one', () => {
    let w = two()
    w = applyEdit(w, 'A', rename('a', 'a1', 'One'), 0)
    w = activateDoc(w, 'a', 'x')
    w = setTabRoute(w, 'ta', { name: 'course', course: 'One' })
    const records = w.order.map((id) => docRecord(w.docs[id]))
    const back = restore({ workspace: JSON.parse(JSON.stringify(workspaceRecord(w))), docs: JSON.parse(JSON.stringify(records)) }, 'g2', ids())
    expect(back.order).toEqual(['a', 'b'])
    expect(back.docs.a.name).toBe('A')
    expect(hasChanges(back.docs.a)).toBe(true)
    expect(hasChanges(back.docs.b)).toBe(false)
    expect(activeDoc(back)).toBe('a')
    expect(activeTab(back)?.data).toEqual({ kind: 'doc', doc: 'a', route: { name: 'course', course: 'One' } })
  })

  it('falls back to one tab per document when the layout is malformed, and names unnamed documents', () => {
    const docs: DocRecord[] = ['p', 'q'].map((id) => ({ id, library: emptyLibrary(), dirty: false, drive: null }))
    const w = restore({ workspace: { version: 1, docs: ['p', 'q'], closed: [], layout: { tabs: 3 }, explorer: 'x', ui: null }, docs }, 'g', ids())
    expect(w.order.map((id) => w.docs[id].name)).toEqual(['New library', 'New library 2'])
    expect(activeDoc(w)).toBe('p')
    expect(Object.keys(w.layout.tabs)).toHaveLength(2)
    expect(w.explorer).toEqual({ expanded: [], selection: { ids: [], anchor: null, focus: null } })
  })

  it('keeps closed files closed, and names a library once tied to a local file after it', () => {
    let w = closeDoc(two(), 'a')
    w = addDoc(w, makeDoc('f', lib(), 'x'), HOME, 'tf')
    const records = [...w.order.map((id) => docRecord(w.docs[id])), { id: 'a', library: lib(), dirty: false, drive: null }]
    const rec = JSON.parse(JSON.stringify(workspaceRecord(w)))
    delete rec.ui.names.f
    const old: DocRecord = { ...records[1], legacyName: 'Biology.shrimp' }
    const back = restore({ workspace: rec, docs: [records[0], old, records[2]] }, 'g2', ids(), true)
    expect(back.order).toEqual(['b', 'f'])
    expect(back.closed).toEqual([{ id: 'a', name: 'A', drive: null }])
    expect(back.docs.f.name).toBe('Biology')
    expect(back.signedIn).toBe(true)
    // The file's name wins over the library's own one, which nobody saw while it was tied to the file.
    const named = restore({ workspace: JSON.parse(JSON.stringify(workspaceRecord(w))), docs: [old] }, 'g3', ids())
    expect(named.docs.f.name).toBe('Biology')
  })

  it('drops tabs of files no longer open; a file may stay open with no tab', () => {
    const l = readLayout(workspaceRecord(two()).layout, ['b', 'c'], 'g', ids())
    expect(Object.values(l.tabs).map((t) => (t.data.kind === 'doc' ? t.data.doc : ''))).toEqual(['b'])
  })

  it('restores splits, each Explorer with its own view and pages, with popped-out groups docked', () => {
    let w = splitGroup(setTabRoute(two(), 'tb', { name: 'course', course: 'b1' }), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = showExplorer(w, 'g2', { split: false, tabId: 'te', groupId: 'g3' })
    w = popOutGroup(w, 'g2', 'pop', 'spare')
    const raw = JSON.parse(JSON.stringify(workspaceRecord(w).layout))
    raw.tabs.te2 = { id: 'te2', data: { kind: 'explorer', view: { expanded: ['d:a'], selection: { ids: [], anchor: null, focus: null } } } }
    raw.groups.g.tabs.push('te2')
    const l = readLayout(raw, ['a', 'b'], 'x', ids())
    expect(Object.keys(l.windows)).toEqual([MAIN])
    expect(Object.values(l.tabs).filter((t) => t.data.kind === 'explorer')).toHaveLength(2)
    expect(l.tabs.te2.data).toEqual({ kind: 'explorer', view: { expanded: ['d:a'], selection: { ids: [], anchor: null, focus: null } } })
    const tb2 = l.tabs.tb2.data
    expect(tb2.kind === 'doc' && tb2.route).toEqual({ name: 'course', course: 'b1' })
    expect(groupsIn(l, MAIN)).toEqual(['g', 'g2'])
  })

  it('never keeps a Drive link as a page, and an app page becomes the file\'s home', () => {
    expect(readRoute({ name: 'drive', id: 'x' })).toBeNull()
    expect(readRoute({ name: 'debug' })).toEqual({ name: 'home' })
    expect(readRoute({ name: 'study', course: 'c', quiz: 'q', format: 'typing' })).toEqual({ name: 'study', course: 'c', quiz: 'q', format: 'typing' })
    expect(readRoute({ name: 'study', course: 'c', quiz: 'q', format: 'nope' })).toBeNull()
  })
})

describe('tabs, groups and windows', () => {
  it('opens a place in the group\'s tab of that file, or in a new tab when asked', () => {
    let w = two()
    const quiz = { name: 'course', course: 'b1' } as const
    let r = openPlace(w, 'b', quiz, 'new')
    expect(r.tab).toBe('tb')
    expect(route(r.workspace, 'tb')).toEqual(quiz)
    w = r.workspace
    r = openPlace(w, 'b', HOME, 'tb3', { newTab: true })
    expect(r.tab).toBe('tb3')
    expect(Object.keys(r.workspace.layout.tabs)).toEqual(['ta', 'tb', 'tb3'])
    expect(route(r.workspace, 'tb')).toEqual(quiz)
    expect(openPlace(w, 'zzz', HOME, 'x').tab).toBeNull()
  })

  it('a background tab opens without being shown', () => {
    const r = openPlace(two(), 'a', { name: 'course', course: 'a2' }, 'bg', { newTab: true, background: true })
    expect(activeTab(r.workspace)?.id).toBe('tb')
    expect(r.workspace.layout.groups.g.tabs).toContain('bg')
  })

  it('splits with a copy of the active tab; two tabs of one file keep their own pages', () => {
    let w = splitGroup(two(), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    expect(groupsIn(w.layout, MAIN)).toEqual(['g', 'g2'])
    expect(w.layout.groups.g2.tabs).toEqual(['tb2'])
    expect(w.layout.groups.g.tabs).toEqual(['ta', 'tb'])
    w = setTabRoute(w, 'tb2', { name: 'course', course: 'b1' })
    expect(route(w, 'tb')).toEqual(HOME)
    expect(activeDoc(w)).toBe('b')
  })

  it('a dragged tab moves into the new group instead', () => {
    const w = splitGroup(two(), 'g', 'row', 'before', 'g2', { tabId: 'unused', move: 'ta' })
    expect(w.layout.groups.g2.tabs).toEqual(['ta'])
    expect(w.layout.groups.g.tabs).toEqual(['tb'])
    expect(w.layout.tabs.unused).toBeUndefined()
  })

  it('closing tabs never closes a file, and the active file follows the tab used last', () => {
    let w = splitGroup(two(), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = activateTab(w, 'ta')
    expect(activeDoc(w)).toBe('a')
    w = closeTabs(w, ['ta', 'tb'])
    expect(w.order).toEqual(['a', 'b'])
    expect(groupsIn(w.layout, MAIN)).toEqual(['g2'])
    expect(activeDoc(w)).toBe('b')
    w = closeTabs(w, ['tb2'])
    expect(activeDoc(w)).toBeNull()
    expect(Object.keys(w.layout.groups)).toHaveLength(1)
  })

  it('moves a tab across groups', () => {
    let w = splitGroup(two(), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = moveTab(w, 'ta', 'g2', 0)
    expect(w.layout.groups.g2.tabs).toEqual(['ta', 'tb2'])
    expect(groupOf(w.layout, 'ta')).toBe('g2')
  })

  it('the address bar follows the main window\'s active tab, not a popped-out one', () => {
    let w = splitGroup(two(), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = activateTab(w, 'ta')
    w = popOutGroup(w, 'g2', 'pop', 'spare')
    w = activateTab(w, 'tb2')
    expect(activeTab(w)?.id).toBe('tb2')
    expect(addressTab(w)?.id).toBe('ta')
  })

  it('popping out the main window\'s only group leaves it an empty group; docking brings the tabs back', () => {
    let w = popOutGroup(two(), 'g', 'pop', 'spare')
    expect(groupsIn(w.layout, MAIN)).toEqual(['spare'])
    expect(groupsIn(w.layout, 'pop')).toEqual(['g'])
    expect(addressTab(w)).toBeNull()
    w = dockWindow(w, 'pop')
    expect(Object.keys(w.layout.windows)).toEqual([MAIN])
    expect(groupsIn(w.layout, MAIN)).toEqual(['g'])
  })

  it('pops out one tab in a group of its own, the rest of its group staying; a lone tab takes its group', () => {
    let w = popOutTab(two(), 'tb', 'pop', 'g2', 'spare')
    expect(w.layout.groups.g.tabs).toEqual(['ta'])
    expect(groupsIn(w.layout, MAIN)).toEqual(['g'])
    expect(groupsIn(w.layout, 'pop')).toEqual(['g2'])
    expect(w.layout.groups.g2.tabs).toEqual(['tb'])
    w = popOutTab(w, 'ta', 'pop2', 'g3', 'spare')
    expect(groupsIn(w.layout, MAIN)).toEqual(['spare'])
    expect(groupsIn(w.layout, 'pop2')).toEqual(['g'])
    expect(popOutTab(w, 'nope', 'pop3', 'g4', 'spare4')).toBe(w)
  })

  it('shows one Explorer: split on the left with room, else a tab; again only activates it', () => {
    let w = showExplorer(two(), 'g', { split: true, tabId: 'te', groupId: 'ge' })
    expect(groupsIn(w.layout, MAIN)).toEqual(['ge', 'g'])
    expect(activeTab(w)?.data).toEqual({ kind: 'explorer' })
    w = activateTab(w, 'tb')
    const again = showExplorer(w, 'g', { split: true, tabId: 'te2', groupId: 'ge2' })
    expect(Object.keys(again.layout.tabs)).not.toContain('te2')
    expect(activeTab(again)?.id).toBe('te')
    const tabbed = showExplorer(two(), 'g', { split: false, tabId: 'te', groupId: 'ge' })
    expect(tabbed.layout.groups.g.tabs).toContain('te')
  })

  it('the Explorer opens things in the group used last besides its own', () => {
    let w = showExplorer(two(), 'g', { split: true, tabId: 'te', groupId: 'ge' })
    expect(recentGroup(w, 'ge')).toBe('g')
    w = closeTabs(w, ['ta', 'tb'])
    expect(recentGroup(w, 'ge')).toBeNull()
  })

  it('a file opened while the Explorer is active opens beside it, never over it', () => {
    let w = showExplorer(two(), 'g', { split: true, tabId: 'te', groupId: 'ge' })
    // Opened (new, from a file, from Drive): in the group used last besides the Explorer's.
    const opened = addDoc(w, makeDoc('c', lib(), 'C'), HOME, 'tc')
    expect(groupOf(opened.layout, 'tc')).toBe('g')
    expect(opened.layout.groups.ge.active).toBe('te')
    expect(activeDoc(opened)).toBe('c')
    // Already open: its tab there; the Explorer stays.
    w = moveTab(w, 'ta', 'ge', 1)
    w = activateTab(w, 'te')
    const shown = activateDoc(w, 'a', 'x')
    expect(shown.layout.groups.ge.active).toBe('te')
    expect(groupOf(shown.layout, activeTab(shown)!.id)).toBe('g')
    expect(activeDoc(shown)).toBe('a')
    // A place named without a group goes there too.
    expect(openPlace(w, 'b', { name: 'course', course: 'b1' }, 'p').tab).toBe('tb')
    // The Explorer as a tab in the only group: a new tab beside it.
    const tabbed = showExplorer(two(), 'g', { split: false, tabId: 'te', groupId: 'ge' })
    const beside = addDoc(tabbed, makeDoc('c', lib(), 'C'), HOME, 'tc')
    expect(groupOf(beside.layout, 'tc')).toBe('g')
    // Without the Explorer active: the active group, as before.
    expect(groupOf(addDoc(activateTab(opened, 'tc'), makeDoc('d', lib(), 'D'), HOME, 'td').layout, 'td')).toBe('g')
  })

  it('closing a file closes all its tabs, in every group', () => {
    let w = splitGroup(two(), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = closeDoc(w, 'b')
    expect(Object.keys(w.layout.tabs)).toEqual(['ta'])
    expect(groupsIn(w.layout, MAIN)).toEqual(['g'])
  })
})

describe('what is already open, and duplicates', () => {
  it('opening a page that a tab shows, anywhere (a popped-out window too), focuses that tab; a new tab only when asked', () => {
    let w = setTabRoute(two(), 'ta', { name: 'course', course: 'a1' })
    w = splitGroup(w, 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = popOutGroup(w, 'g2', 'pop', 'spare')
    w = activateTab(w, 'ta')
    const again = openPlace(w, 'b', HOME, 'new', { group: 'g' })
    expect(again.tab).toBe('tb2')
    expect(activeTab(again.workspace)?.id).toBe('tb2')
    expect(Object.keys(again.workspace.layout.tabs)).not.toContain('new')
    const fresh = openPlace(w, 'b', HOME, 'new', { group: 'g', newTab: true })
    expect(fresh.tab).toBe('new')
  })

  it('with several tabs on the page, focuses the one used last', () => {
    let w = duplicateTab(two(), 'tb', 'tb2')
    w = activateTab(activateTab(w, 'tb'), 'ta')
    expect(openPlace(w, 'b', HOME, 'new').tab).toBe('tb')
    w = activateTab(activateTab(w, 'tb2'), 'ta')
    expect(openPlace(w, 'b', HOME, 'new').tab).toBe('tb2')
  })

  it("duplicates a tab right after it; an Explorer gets its own view, starting from the original's", () => {
    let w = duplicateTab(two(), 'ta', 'ta2')
    expect(w.layout.groups.g.tabs).toEqual(['ta', 'ta2', 'tb'])
    expect(activeTab(w)?.id).toBe('ta2')
    expect(w.layout.tabs.ta2.data).toEqual(w.layout.tabs.ta.data)
    w = showExplorer(w, 'g', { split: false, tabId: 'te', groupId: 'ge' })
    const open = { expanded: ['d:a'], selection: { ids: [], anchor: null, focus: null } }
    w = setExplorerView(w, 'te', open)
    w = duplicateTab(w, 'te', 'te2')
    expect(explorerView(w, 'te2')).toEqual(open)
    w = setExplorerView(w, 'te2', { ...open, expanded: ['d:a', 'd:b'] })
    expect(explorerView(w, 'te').expanded).toEqual(['d:a'])
    expect(explorerView(w, 'te2').expanded).toEqual(['d:a', 'd:b'])
    w = activateTab(w, 'ta')
    expect(activeTab(showExplorer(w, 'g', { split: true, tabId: 'te3', groupId: 'ge3' }))?.id).toBe('te2')
  })
})

describe('pane mode and popped-out windows', () => {
  it("a window's focused group and the tab its address names: the main window's by default", () => {
    let w = splitGroup(two(), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = popOutGroup(w, 'g2', 'pop', 'spare')
    w = activateTab(w, 'tb2')
    expect(focusedGroup(w, 'pop')).toBe('g2')
    expect(shownTab(w, 'pop')?.id).toBe('tb2')
    expect(shownTab(w)?.id).toBe('tb')
    w = activateTab(w, 'ta')
    expect(shownTab(w)?.id).toBe('ta')
    // Not the active group: the popup's group used last.
    expect(shownTab(w, 'pop')?.id).toBe('tb2')
  })

  it("shows just the address's page in one group: a file by its key, an app page, or nothing", () => {
    const o = { groupId: 'pg', tabId: 'pt' }
    const w = setTabRoute(two(), 'ta', { name: 'course', course: 'a1' })
    const pane = paneLayout(w, { name: 'course', course: 'a2' }, 'a', o)
    expect(Object.keys(pane.layout.groups)).toEqual(['pg'])
    expect(pane.layout.tabs).toEqual({ pt: { id: 'pt', data: { kind: 'doc', doc: 'a', route: { name: 'course', course: 'a2' } } } })
    expect(pane.recent).toEqual(['pt'])
    expect(pane.order).toEqual(['a', 'b'])
    // No key: the active file.
    expect(paneLayout(w, HOME, null, o).layout.tabs.pt.data).toEqual({ kind: 'doc', doc: 'b', route: HOME })
    expect(paneLayout(w, { name: 'explorer' }, null, o).layout.tabs.pt.data).toEqual({ kind: 'explorer' })
    expect(paneLayout(w, { name: 'studyTips' }, null, o).layout.tabs.pt.data).toEqual({ kind: 'studyTips' })
    // A file not open here, or no page: an empty group.
    const none = paneLayout(w, HOME, 'zed', o)
    expect(none.layout.tabs).toEqual({})
    expect(Object.keys(none.layout.groups)).toEqual(['pg'])
    expect(paneLayout(w, { name: 'debug' }, null, o).layout.tabs).toEqual({})
  })
})

describe('back and forward', () => {
  // a's tab on course a1 in group g; b's tab on its home, split into g2 and active there.
  const setup = () => {
    let w = setTabRoute(two(), 'ta', { name: 'course', course: 'a1' })
    w = splitGroup(w, 'g', 'row', 'after', 'g2', { tabId: 'unused', move: 'tb' })
    return activateTab(w, 'tb')
  }

  it("the address names the focused group's tab of any kind, and an app page's address shows its tab", () => {
    let w = setup()
    expect(shownTab(w)?.id).toBe('tb')
    w = activateGroup(w, 'g')
    expect(shownTab(w)?.id).toBe('ta')
    w = followHistory(w, null, { name: 'explorer' }, { newTab: 'te' })
    expect(activeTab(w)?.data).toEqual({ kind: 'explorer' })
    expect(groupOf(w.layout, 'te')).toBe('g')
    expect(shownTab(w)?.id).toBe('te')
    w = activateTab(w, 'ta')
    expect(activeTab(followHistory(w, null, { name: 'explorer' }, { newTab: 'te2' }))?.id).toBe('te')
    expect(followHistory(w, null, { name: 'empty' }, { newTab: 'x' })).toBe(w)
  })

  it("an address naming another open file shows it in the focused group; naming none, the focused tab's file", () => {
    const w = activateGroup(setup(), 'g')
    const named = followHistory(w, null, { name: 'course', course: 'b1' }, { doc: 'b', newTab: 'tb2' })
    expect(activeTab(named)?.id).toBe('tb2')
    expect(groupOf(named.layout, 'tb2')).toBe('g')
    expect(route(named, 'tb2')).toEqual({ name: 'course', course: 'b1' })
    expect(followHistory(w, null, { name: 'course', course: 'b1' })).toBe(w)
    expect(route(followHistory(w, null, { name: 'course', course: 'a2' }, { doc: 'a', newTab: 'x' }), 'ta')).toEqual({ name: 'course', course: 'a2' })
  })

  it('an entry goes back to its own tab, wherever it is, on its page; the other tab stays', () => {
    const w = followHistory(setup(), 'ta', HOME)
    expect(activeTab(w)?.id).toBe('ta')
    expect(route(w, 'ta')).toEqual(HOME)
    expect(route(w, 'tb')).toEqual(HOME)
    expect(groupOf(w.layout, 'ta')).toBe('g')
  })

  it("an entry whose tab is gone (or a typed address) goes to the main window's tab only when its file has the page", () => {
    const w = setup()
    expect(route(followHistory(w, 'gone', { name: 'course', course: 'b1' }), 'tb')).toEqual({ name: 'course', course: 'b1' })
    expect(followHistory(w, null, { name: 'course', course: 'a1' })).toBe(w)
    expect(route(followHistory(w, null, HOME), 'tb')).toEqual(HOME)
  })
})

describe("the app's own tabs", () => {
  it("What's new and the welcome page are focused where they show, and come back on reload", () => {
    let w = showAppPage(two(), 'changelog', 'g', 'tc')
    expect(activeTab(w)?.data).toEqual({ kind: 'changelog' })
    w = activateTab(w, 'ta')
    w = showAppPage(w, 'changelog', 'g', 'tc2')
    expect(activeTab(w)?.id).toBe('tc')
    expect(Object.keys(w.layout.tabs)).not.toContain('tc2')
    w = showAppPage(w, 'welcome', 'g', 'tw')
    expect(activeTab(w)?.data).toEqual({ kind: 'welcome' })
    w = activateTab(w, 'ta')
    expect(activeTab(showAppPage(w, 'welcome', 'g', 'tw2'))?.id).toBe('tw')
    const raw = JSON.parse(JSON.stringify(w.layout))
    raw.tabs.tw3 = { id: 'tw3', data: { kind: 'welcome' } }
    raw.groups.g.tabs.push('tw3')
    const l = readLayout(raw, ['a', 'b'], 'x', ids())
    expect(l.tabs.tc?.data).toEqual({ kind: 'changelog' })
    expect(l.tabs.tw?.data).toEqual({ kind: 'welcome' })
    expect(l.tabs.tw3?.data).toEqual({ kind: 'welcome' })
  })

  it('a Ctrl or middle click opens it in the background, and leaves an open one as it is', () => {
    const w = showAppPage(two(), 'changelog', 'g', 'tc', true)
    expect(w.layout.groups.g.tabs).toContain('tc')
    expect(activeTab(w)?.id).toBe('tb')
    expect(showAppPage(w, 'changelog', 'g', 'tc2', true)).toBe(w)
  })
})

