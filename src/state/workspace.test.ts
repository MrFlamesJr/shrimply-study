import { describe, expect, it } from 'vitest'
import { emptyLibrary, type Course, type Library } from '../model'
import type { FileRef } from '../storage/fileStorage'
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
  showChangelog,
  moveTab,
  openPlace,
  popOutGroup,
  recentGroup,
  setTabRoute,
  showExplorer,
  splitGroup,
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

  it('names new documents uniquely among the open ones', () => {
    let w = emptyWorkspace('g')
    for (const id of ['x', 'y', 'z']) w = addDoc(w, makeDoc(id, emptyLibrary(), freeDocName(w, 'New library')), HOME, `t${id}`)
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
    let w = addDoc(two(), makeDoc('f', lib(course('f1')), 'x.shrimp', { file: file(1) }), HOME, 'tf')
    w = activateDoc(w, 'a', 'x')
    const same = reopenFile(w, 'f', lib(course('z')), file(1), 'x')
    expect(activeDoc(same.workspace)).toBe('f')
    expect(same.workspace.docs.f.library.courses[0].id).toBe('f1')
    const fresh = lib(course('z'))
    const changed = reopenFile(w, 'f', fresh, file(2), 'x')
    expect(changed.ask).toBe(false)
    expect(changed.workspace.docs.f.library).toBe(fresh)
    expect(changed.workspace.docs.f.file?.modified).toBe(2)
  })

  it('asks first when there are unsaved changes', () => {
    let w = addDoc(two(), makeDoc('f', lib(course('f1')), 'x.shrimp', { file: file(1) }), HOME, 'tf')
    w = applyEdit(w, 'Rename course', rename('f', 'f1', 'Mine'), 0)
    const r = reopenFile(w, 'f', lib(course('z')), file(2), 'x')
    expect(r.ask).toBe(true)
    expect(r.workspace.docs.f.library.courses[0].name).toBe('Mine')
  })
})

describe('what the browser keeps', () => {
  it('restores documents (unsaved ones unsaved), names, the layout and the active one', () => {
    let w = two()
    w = applyEdit(w, 'A', rename('a', 'a1', 'One'), 0)
    w = activateDoc(w, 'a', 'x')
    w = setTabRoute(w, 'ta', { name: 'course', course: 'One' })
    const records = w.order.map((id) => docRecord(w.docs[id]))
    const back = restore({ workspace: JSON.parse(JSON.stringify(workspaceRecord(w))), docs: JSON.parse(JSON.stringify(records)), handles: {} }, 'g2', ids())
    expect(back.order).toEqual(['a', 'b'])
    expect(back.docs.a.name).toBe('A')
    expect(hasChanges(back.docs.a)).toBe(true)
    expect(hasChanges(back.docs.b)).toBe(false)
    expect(activeDoc(back)).toBe('a')
    expect(activeTab(back)?.data).toEqual({ kind: 'doc', doc: 'a', route: { name: 'course', course: 'One' } })
  })

  it('falls back to one tab per document when the layout is malformed, and names unnamed documents', () => {
    const docs: DocRecord[] = ['p', 'q'].map((id) => ({ id, library: emptyLibrary(), dirty: false, drive: null, file: null }))
    const w = restore({ workspace: { version: 1, docs: ['p', 'q'], layout: { tabs: 3 }, explorer: 'x', ui: null }, docs, handles: {} }, 'g', ids())
    expect(w.order.map((id) => w.docs[id].name)).toEqual(['New library', 'New library 2'])
    expect(activeDoc(w)).toBe('p')
    expect(Object.keys(w.layout.tabs)).toHaveLength(2)
    expect(w.explorer).toEqual({ expanded: [], selection: { ids: [], anchor: null, focus: null } })
  })

  it('drops tabs of files no longer open; a file may stay open with no tab', () => {
    const l = readLayout(workspaceRecord(two()).layout, ['b', 'c'], 'g', ids())
    expect(Object.values(l.tabs).map((t) => (t.data.kind === 'doc' ? t.data.doc : ''))).toEqual(['b'])
  })

  it('restores splits, the Explorer (once) and pages, with popped-out groups docked', () => {
    let w = splitGroup(setTabRoute(two(), 'tb', { name: 'course', course: 'b1' }), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = showExplorer(w, 'g2', { split: false, tabId: 'te', groupId: 'g3' })
    w = popOutGroup(w, 'g2', 'pop', 'spare')
    const raw = JSON.parse(JSON.stringify(workspaceRecord(w).layout))
    raw.tabs.te2 = { id: 'te2', data: { kind: 'explorer' } }
    raw.groups.g.tabs.push('te2')
    const l = readLayout(raw, ['a', 'b'], 'x', ids())
    expect(Object.keys(l.windows)).toEqual([MAIN])
    expect(Object.values(l.tabs).filter((t) => t.data.kind === 'explorer')).toHaveLength(1)
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

  it('closing a file closes all its tabs, in every group', () => {
    let w = splitGroup(two(), 'g', 'row', 'after', 'g2', { tabId: 'tb2' })
    w = closeDoc(w, 'b')
    expect(Object.keys(w.layout.tabs)).toEqual(['ta'])
    expect(groupsIn(w.layout, MAIN)).toEqual(['g'])
  })
})

describe('back and forward', () => {
  // a's tab on course a1 in group g; b's tab on its home, split into g2 and active there.
  const setup = () => {
    let w = setTabRoute(two(), 'ta', { name: 'course', course: 'a1' })
    w = splitGroup(w, 'g', 'row', 'after', 'g2', { tabId: 'unused', move: 'tb' })
    return activateTab(w, 'tb')
  }

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
  it("every release's notes open in one tab at most", () => {
    let w = showChangelog(two(), 'g', 'tc')
    expect(activeTab(w)?.data).toEqual({ kind: 'changelog' })
    w = activateTab(w, 'ta')
    w = showChangelog(w, 'g', 'tc2')
    expect(activeTab(w)?.id).toBe('tc')
    expect(Object.keys(w.layout.tabs)).not.toContain('tc2')
    const l = readLayout(JSON.parse(JSON.stringify(w.layout)), ['a', 'b'], 'x', ids())
    expect(l.tabs.tc?.data).toEqual({ kind: 'changelog' })
  })
})

