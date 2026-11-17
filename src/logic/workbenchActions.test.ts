import { describe, expect, it } from 'vitest'
import type { Group, Tab } from '../kit/layout'
import type { Library } from '../model'
import {
  canSplit, copyPathText, groupMenu, mountedTabs, tabDescription, tabMenu, tabTitle, tabTooltip,
  type Docs, type GroupContext, type MenuEntry, type TabData,
} from './workbenchActions'

const library: Library = {
  version: 3,
  courses: [{ id: 'c', name: 'Cell Biology', quizzes: [{ id: 'q', name: 'Quiz 1', groups: [], cards: [] }] }],
}
const docs: Docs = {
  d: { name: 'Biology.shrimp', dirty: false, library },
  e: { name: 'Other.shrimp', dirty: true, library: { version: 3, courses: [] } },
}
const tab = (data: TabData, id = 't'): Tab<TabData> => ({ id, data })
const home = tab({ kind: 'doc', doc: 'd', route: { name: 'home' } })
const course = tab({ kind: 'doc', doc: 'd', route: { name: 'course', course: 'cell-biology' } })
const quiz = tab({ kind: 'doc', doc: 'd', route: { name: 'quiz', course: 'Cell Biology', quiz: 'quiz-1' } })
const gone = tab({ kind: 'doc', doc: 'd', route: { name: 'quiz', course: 'Cell Biology', quiz: 'nope' } })
const ctx: GroupContext = { tabCount: 3, size: { width: 900, height: 700 }, groupsInWindow: 2, inMain: true, next: true, canPopOut: true, anyDirty: true }
const find = (m: MenuEntry[], action: string) => m.find((x) => x !== 'separator' && x.action === action) as Exclude<MenuEntry, 'separator'>

describe('titles', () => {
  it('names a document tab by its page', () => {
    expect(tabTitle(home, docs)).toBe('Biology.shrimp')
    expect(tabTitle(course, docs)).toBe('Cell Biology')
    expect(tabTitle(quiz, docs)).toBe('Quiz 1')
    expect(tabTitle(tab({ kind: 'doc', doc: 'd', route: { name: 'edit', course: 'Cell Biology', quiz: 'Quiz 1' } }), docs)).toBe('Quiz 1')
  })
  it('falls back to the course when the quiz is gone, and says when the file is gone', () => {
    expect(tabTitle(gone, docs)).toBe('Cell Biology')
    expect(tabTitle(tab({ kind: 'doc', doc: 'x', route: { name: 'home' } }), docs)).toBe('Missing file')
  })
  it('names the other kinds', () => {
    expect(tabTitle(tab({ kind: 'explorer' }), docs)).toBe('Explorer')
    expect(tabTitle(tab({ kind: 'welcome' }), docs)).toBe('Welcome')
  })
  it('describes with the file name only away from its home', () => {
    expect(tabDescription(home, docs)).toBeUndefined()
    expect(tabDescription(quiz, docs)).toBe('Biology.shrimp')
    expect(tabDescription(tab({ kind: 'explorer' }), docs)).toBeUndefined()
  })
})

describe('paths and tooltips', () => {
  it('writes the path', () => {
    expect(copyPathText(home, docs)).toBe('Biology.shrimp')
    expect(copyPathText(course, docs)).toBe('Biology.shrimp/Cell Biology')
    expect(copyPathText(quiz, docs)).toBe('Biology.shrimp/Cell Biology/Quiz 1')
    expect(copyPathText(tab({ kind: 'welcome' }), docs)).toBeNull()
  })
  it('marks unsaved changes in the tooltip', () => {
    expect(tabTooltip(quiz, docs)).toBe('Biology.shrimp/Cell Biology/Quiz 1')
    expect(tabTooltip(tab({ kind: 'doc', doc: 'e', route: { name: 'home' } }), docs)).toBe('Other.shrimp (unsaved changes)')
    expect(tabTooltip(tab({ kind: 'explorer' }), docs)).toBe('Explorer')
  })
})

describe('menus', () => {
  it('enables everything that makes sense for a document tab with other tabs', () => {
    const m = tabMenu(quiz, docs, ctx, false)
    expect(m.filter((x) => x !== 'separator' && x.disabled).map((x) => (x as { action: string }).action)).toEqual(['save'])
    expect(find(m, 'save').reason).toBe('No unsaved changes.')
  })
  it('gives a reason for what is refused', () => {
    const m = tabMenu(tab({ kind: 'explorer' }), docs, { ...ctx, tabCount: 1, groupsInWindow: 1 }, false)
    expect(find(m, 'closeOthers').reason).toMatch(/No other tabs/)
    expect(find(m, 'splitRight').reason).toMatch(/only tab/)
    expect(find(m, 'popOut').reason).toMatch(/last group/)
    expect(find(m, 'reveal').disabled).toBe(true)
    expect(find(m, 'copyPath').disabled).toBe(true)
    expect(find(m, 'save').reason).toBe('Nothing to save here.')
  })
  it('refuses a split of a small pane and a window on touch', () => {
    const m = tabMenu(quiz, docs, { ...ctx, size: { width: 500, height: 700 }, canPopOut: false }, false)
    expect(find(m, 'splitRight').disabled).toBe(true)
    expect(find(m, 'splitDown').disabled).toBeUndefined()
    expect(find(m, 'popOut').reason).toMatch(/wider screen/)
  })
  it('names the group move and shows the shortcut for the platform', () => {
    expect(find(tabMenu(quiz, docs, ctx, false), 'popOut').label).toBe('Move group to new window')
    expect(find(tabMenu(quiz, docs, { ...ctx, tabCount: 1 }, true), 'popOut').label).toBe('Move to new window')
    expect(find(tabMenu(quiz, docs, ctx, true), 'splitRight').shortcut).toBe('⌘\\')
  })
  it('disables Save all with nothing unsaved', () => {
    expect(find(tabMenu(quiz, docs, { ...ctx, anyDirty: false }, false), 'saveAll').disabled).toBe(true)
  })
  it('builds the group menu', () => {
    const m = groupMenu({ ...ctx, next: false, tabCount: 0, groupsInWindow: 1, inMain: false })
    expect(find(m, 'join').reason).toMatch(/no group after/)
    expect(find(m, 'closeAll').reason).toBe('No tabs to close.')
    expect(find(m, 'popOut').reason).toMatch(/alone in its window/)
    expect(find(groupMenu(ctx), 'join').disabled).toBeUndefined()
  })
})

describe('mounted tabs', () => {
  const g = (n: number, active: string | null, mru: string[]): Group => ({
    id: 'g', tabs: Array.from({ length: n }, (_, i) => `t${i}`), active, mru,
  })
  it('keeps the shown tab and the 7 most recent', () => {
    const keep = mountedTabs(g(12, 't5', ['t5', 't9', 't1', 't2', 't3', 't4', 't6', 't7', 't8', 't0']))
    expect(keep.size).toBe(8)
    expect([...keep]).toEqual(['t5', 't9', 't1', 't2', 't3', 't4', 't6', 't7'])
  })
  it('keeps all of a small group, and none of an empty one', () => {
    expect(mountedTabs(g(3, 't1', ['t1', 't0', 't2'])).size).toBe(3)
    expect(mountedTabs(g(0, null, [])).size).toBe(0)
  })
})

describe('canSplit', () => {
  it('needs both halves at least 320 by 240', () => {
    expect(canSplit({ width: 644, height: 240 }, 'row')).toBe(true)
    expect(canSplit({ width: 643, height: 240 }, 'row')).toBe(false)
    expect(canSplit({ width: 700, height: 239 }, 'row')).toBe(false)
    expect(canSplit({ width: 320, height: 484 }, 'column')).toBe(true)
    expect(canSplit({ width: 319, height: 800 }, 'column')).toBe(false)
  })
})
