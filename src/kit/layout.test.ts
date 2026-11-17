import { describe, expect, it } from 'vitest'
import {
  MAIN, activate, activateGroup, allGroups, closeAll, closeOthers, closeTabs, dock, emptyLayout, groupOf, groupsIn,
  join, mapTabs, minSize, moveTab, normalize, openTab, popOut, resize, split, updateTab, windowOf, type Layout, type Node,
} from './layout'

type L = Layout<string>
type Split = Extract<Node, { kind: 'split' }>
const t = (id: string) => ({ id, data: id.toUpperCase() })
const base = (): L => emptyLayout<string>('g1')
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const root = (l: L, w = MAIN) => l.windows[w].root
const leaf = (id: string): Node => ({ kind: 'group', id })

describe('layout', () => {
  it('emptyLayout has MAIN with one empty group', () => {
    const l = base()
    expect(l.groups.g1).toEqual({ id: 'g1', tabs: [], active: null, mru: [] })
    expect(root(l)).toEqual(leaf('g1'))
    expect(l.activeGroup).toBe('g1')
  })

  it('openTab adds after the active tab and activates', () => {
    let l = openTab(base(), t('a'))
    l = openTab(l, t('b'))
    l = openTab(l, t('c'), { index: 0 })
    expect(l.groups.g1.tabs).toEqual(['c', 'a', 'b'])
    expect(l.groups.g1.active).toBe('c')
    expect(l.groups.g1.mru).toEqual(['c', 'b', 'a'])
    l = activate(l, 'a')
    l = openTab(l, t('d'))
    expect(l.groups.g1.tabs).toEqual(['c', 'a', 'd', 'b'])
  })

  it('openTab without activate keeps the active tab, and an open id only activates', () => {
    let l = openTab(base(), t('a'))
    l = openTab(l, t('b'), { activate: false })
    expect(l.groups.g1.active).toBe('a')
    expect(l.groups.g1.mru).toEqual(['a', 'b'])
    expect(openTab(l, t('b')).groups.g1.active).toBe('b')
    expect(Object.keys(openTab(l, t('b')).tabs)).toHaveLength(2)
  })

  it('openTab into an empty group without activate still gives it an active tab', () => {
    expect(openTab(base(), t('a'), { activate: false }).groups.g1.active).toBe('a')
  })

  it('openTab targets a given group and makes it active', () => {
    const l = openTab(split(openTab(base(), t('a')), 'g1', 'row', 'after', 'g2'), t('b'), { group: 'g2' })
    expect(l.groups.g2.tabs).toEqual(['b'])
    expect(l.activeGroup).toBe('g2')
  })

  it('activate and activateGroup', () => {
    let l = openTab(openTab(base(), t('a')), t('b'))
    l = activate(l, 'a')
    expect(l.groups.g1.active).toBe('a')
    expect(l.groups.g1.mru).toEqual(['a', 'b'])
    expect(activate(l, 'zzz')).toBe(l)
    l = split(l, 'g1', 'row', 'after', 'g2')
    expect(activateGroup(l, 'g1').activeGroup).toBe('g1')
    expect(activateGroup(l, 'nope')).toBe(l)
  })

  it('updateTab and mapTabs', () => {
    const l = openTab(openTab(base(), t('a')), t('b'))
    expect(updateTab(l, 'a', 'x').tabs.a.data).toBe('x')
    expect(updateTab(l, 'a', 'A')).toBe(l)
    expect(updateTab(l, 'zzz', 'x')).toBe(l)
    expect(mapTabs(l, (tab) => tab.data)).toBe(l)
    const m = mapTabs(l, (tab) => (tab.id === 'a' ? 'new' : tab.data))
    expect(m.tabs.a.data).toBe('new')
    expect(m.tabs.b).toBe(l.tabs.b)
  })

  it('closeTabs activates the previous most-recent tab, else the neighbour', () => {
    let l = ['a', 'b', 'c', 'd'].reduce((x, id) => openTab(x, t(id)), base())
    l = activate(activate(l, 'a'), 'c')
    expect(closeTabs(l, ['c']).groups.g1.active).toBe('a')
    expect(closeTabs(l, ['c']).tabs.c).toBeUndefined()
    const m = openTab(openTab(base(), t('x')), t('y'))
    const z = { ...m, groups: { g1: { ...m.groups.g1, mru: [] } } }
    expect(closeTabs(activate(z, 'x'), ['x']).groups.g1.active).toBe('y')
    expect(closeTabs(l, [])).toBe(l)
    expect(closeTabs(l, ['nope'])).toBe(l)
  })

  it("closing everything keeps MAIN's last group but removes other empty ones", () => {
    let l = openTab(base(), t('a'))
    l = split(l, 'g1', 'row', 'after', 'g2', t('b'))
    l = closeTabs(l, ['b'])
    expect(root(l)).toEqual(leaf('g1'))
    expect(l.groups.g2).toBeUndefined()
    expect(l.activeGroup).toBe('g1')
    l = closeTabs(l, ['a'])
    expect(root(l)).toEqual(leaf('g1'))
    expect(l.groups.g1.active).toBeNull()
  })

  it('closeOthers and closeAll', () => {
    const l = ['a', 'b', 'c'].reduce((x, id) => openTab(x, t(id)), base())
    expect(closeOthers(l, 'b').groups.g1.tabs).toEqual(['b'])
    expect(closeOthers(l, 'nope')).toBe(l)
    const e = closeAll(l, 'g1')
    expect(e.groups.g1.tabs).toEqual([])
    expect(Object.keys(e.tabs)).toEqual([])
    expect(closeAll(l, 'nope')).toBe(l)
  })

  it('moveTab reorders within a group (index counted before the move)', () => {
    const l = ['a', 'b', 'c'].reduce((x, id) => openTab(x, t(id)), base())
    expect(moveTab(l, 'a', 'g1', 3).groups.g1.tabs).toEqual(['b', 'c', 'a'])
    expect(moveTab(l, 'c', 'g1', 0).groups.g1.tabs).toEqual(['c', 'a', 'b'])
    expect(moveTab(l, 'a', 'g1', 1)).toBe(l)
    expect(moveTab(l, 'a', 'g1', 2).groups.g1.tabs).toEqual(['b', 'a', 'c'])
    expect(moveTab(l, 'zzz', 'g1', 0)).toBe(l)
  })

  it('moveTab across groups activates it there; an emptied source goes away', () => {
    let l = openTab(base(), t('a'))
    l = split(l, 'g1', 'row', 'after', 'g2', t('b'))
    l = openTab(l, t('c'), { group: 'g1' })
    const m = moveTab(l, 'c', 'g2', 0)
    expect(m.groups.g2.tabs).toEqual(['c', 'b'])
    expect(m.groups.g2.active).toBe('c')
    expect(m.groups.g1.tabs).toEqual(['a'])
    expect(m.activeGroup).toBe('g2')
    const n = moveTab(moveTab(l, 'c', 'g2', 9), 'a', 'g2', 0)
    expect(n.groups.g1).toBeUndefined()
    expect(root(n)).toEqual(leaf('g2'))
  })

  it('split inserts a sibling sharing half the size, with a new or moved tab', () => {
    let l = openTab(base(), t('a'))
    l = split(l, 'g1', 'row', 'after', 'g2', t('b'))
    expect(root(l)).toEqual({ kind: 'split', dir: 'row', children: [leaf('g1'), leaf('g2')], sizes: [0.5, 0.5] })
    expect(l.activeGroup).toBe('g2')
    expect(l.groups.g2.active).toBe('b')
    l = split(l, 'g2', 'row', 'before', 'g3', t('c'))
    const r = root(l) as Split
    expect(r.children).toEqual([leaf('g1'), leaf('g3'), leaf('g2')])
    expect(r.sizes).toEqual([0.5, 0.25, 0.25])
    l = split(l, 'g3', 'column', 'after', 'g4', t('d'))
    const nested = (root(l) as Split).children[1] as Split
    expect(nested.dir).toBe('column')
    expect(nested.sizes).toEqual([0.5, 0.5])
    expect(sum((root(l) as Split).sizes)).toBeCloseTo(1)
    const moved = split(l, 'g1', 'column', 'before', 'g5', t('a'))
    expect(moved.groups.g5.tabs).toEqual(['a'])
    expect(groupOf(moved, 'a')).toBe('g5')
    expect(moved.groups.g1).toBeUndefined()
    expect(split(l, 'nope', 'row', 'after', 'g9')).toBe(l)
  })

  it('split without a tab makes an empty group that stays', () => {
    const l = split(openTab(base(), t('a')), 'g1', 'column', 'after', 'g2')
    expect(l.groups.g2.tabs).toEqual([])
    expect(groupsIn(l, MAIN)).toEqual(['g1', 'g2'])
  })

  it('join appends tabs and removes the group', () => {
    let l = split(openTab(base(), t('a')), 'g1', 'row', 'after', 'g2', t('b'))
    l = join(l, 'g2', 'g1')
    expect(l.groups.g1.tabs).toEqual(['a', 'b'])
    expect(l.groups.g2).toBeUndefined()
    expect(l.activeGroup).toBe('g1')
    expect(root(l)).toEqual(leaf('g1'))
    expect(join(l, 'g1', 'g1')).toBe(l)
  })

  it('resize renormalizes sizes at a path', () => {
    let l = split(openTab(base(), t('a')), 'g1', 'row', 'after', 'g2', t('b'))
    l = split(l, 'g2', 'column', 'after', 'g3', t('c'))
    expect((root(resize(l, MAIN, [], [1, 3])) as Split).sizes).toEqual([0.25, 0.75])
    const inner = (root(resize(l, MAIN, [1], [3, 1])) as Split).children[1] as Split
    expect(inner.sizes).toEqual([0.75, 0.25])
    expect(resize(l, MAIN, [], [1])).toBe(l)
    expect(resize(l, 'nope', [], [1, 1])).toBe(l)
    expect(resize(l, MAIN, [0], [1, 1])).toBe(l)
  })

  it('popOut and dock keep group ids, tabs and order', () => {
    let l = split(openTab(base(), t('a')), 'g1', 'row', 'after', 'g2', t('b'))
    l = openTab(l, t('c'), { group: 'g2' })
    const p = popOut(l, 'g2', 'w1')
    expect(root(p, 'w1')).toEqual(leaf('g2'))
    expect(root(p)).toEqual(leaf('g1'))
    expect(p.groups.g2.tabs).toEqual(['b', 'c'])
    expect(windowOf(p, 'g2')).toBe('w1')
    expect(allGroups(p)).toEqual(['g1', 'g2'])
    const d = dock(p, 'w1')
    expect(d.windows.w1).toBeUndefined()
    expect(root(d)).toEqual({ kind: 'split', dir: 'row', children: [leaf('g1'), leaf('g2')], sizes: [0.5, 0.5] })
    expect(d.groups.g2.tabs).toEqual(['b', 'c'])
    expect(dock(d, 'w1')).toBe(d)
  })

  it("popOut refuses MAIN's only group, MAIN as a target and a taken window", () => {
    const l = openTab(base(), t('a'))
    expect(popOut(l, 'g1', 'w1')).toBe(l)
    const s = split(l, 'g1', 'row', 'after', 'g2', t('b'))
    expect(popOut(s, 'g2', MAIN)).toBe(s)
    const p = popOut(s, 'g2', 'w1')
    expect(popOut(p, 'g1', 'w1')).toBe(p)
  })

  it('dock flattens into an existing row of MAIN', () => {
    let l = split(openTab(base(), t('a')), 'g1', 'row', 'after', 'g2', t('b'))
    l = split(l, 'g2', 'row', 'after', 'g3', t('c'))
    const r = root(dock(popOut(l, 'g3', 'w'), 'w')) as Split
    expect(r.children).toHaveLength(3)
    expect(sum(r.sizes)).toBeCloseTo(1)
  })

  it('normalize collapses nested splits of the same direction and one-child splits', () => {
    const l: L = {
      tabs: { a: t('a'), b: t('b'), c: t('c') },
      groups: {
        g1: { id: 'g1', tabs: ['a'], active: 'a', mru: ['a'] },
        g2: { id: 'g2', tabs: ['b'], active: 'b', mru: ['b'] },
        g3: { id: 'g3', tabs: ['c'], active: 'c', mru: ['c'] },
        g4: { id: 'g4', tabs: [], active: null, mru: [] },
      },
      windows: {
        [MAIN]: {
          root: {
            kind: 'split', dir: 'row', sizes: [1, 1],
            children: [
              { kind: 'split', dir: 'row', sizes: [1, 3], children: [leaf('g1'), leaf('g2')] },
              { kind: 'split', dir: 'column', sizes: [1, 1], children: [leaf('g3'), leaf('g4')] },
            ],
          },
        },
      },
      activeGroup: 'g4',
    }
    const n = normalize(l)
    const r = root(n) as Split
    expect(r.children).toEqual([leaf('g1'), leaf('g2'), leaf('g3')])
    expect(r.sizes[0]).toBeCloseTo(0.125)
    expect(r.sizes[1]).toBeCloseTo(0.375)
    expect(r.sizes[2]).toBeCloseTo(0.5)
    expect(sum(r.sizes)).toBeCloseTo(1)
    expect(n.groups.g4).toBeUndefined()
    expect(n.activeGroup).toBe('g1')
  })

  it('normalize drops stray tabs, repairs active and mru, removes empty windows', () => {
    const l: L = {
      tabs: { a: t('a'), b: t('b'), stray: t('stray') },
      groups: {
        g1: { id: 'g1', tabs: ['a', 'b', 'gone'], active: 'gone', mru: ['b'] },
        g2: { id: 'g2', tabs: [], active: null, mru: [] },
      },
      windows: { [MAIN]: { root: leaf('g1') }, w: { root: leaf('g2') } },
      activeGroup: 'g1',
    }
    const n = normalize(l)
    expect(n.tabs.stray).toBeUndefined()
    expect(n.groups.g1).toEqual({ id: 'g1', tabs: ['a', 'b'], active: 'b', mru: ['b', 'a'] })
    expect(n.windows.w).toBeUndefined()
    expect(n.groups.g2).toBeUndefined()
  })

  it('never mutates its input', () => {
    const l = split(openTab(openTab(base(), t('a')), t('b')), 'g1', 'row', 'after', 'g2', t('c'))
    const copy = JSON.stringify(l)
    closeTabs(l, ['a', 'c'])
    moveTab(l, 'a', 'g2', 0)
    join(l, 'g2', 'g1')
    resize(l, MAIN, [], [1, 3])
    popOut(l, 'g2', 'w')
    expect(JSON.stringify(l)).toBe(copy)
  })

  it('lookups: groupOf, windowOf, groupsIn, allGroups', () => {
    let l = split(openTab(base(), t('a')), 'g1', 'row', 'after', 'g2', t('b'))
    l = split(l, 'g1', 'column', 'before', 'g0', t('z'))
    expect(groupsIn(l, MAIN)).toEqual(['g0', 'g1', 'g2'])
    expect(groupOf(l, 'b')).toBe('g2')
    expect(groupOf(l, 'zzz')).toBeNull()
    expect(windowOf(l, 'g0')).toBe(MAIN)
    expect(windowOf(l, 'nope')).toBeNull()
    expect(groupsIn(l, 'nope')).toEqual([])
    expect(allGroups(popOut(l, 'g1', 'w'))).toEqual(['g0', 'g2', 'g1'])
  })

  it('minSize adds a row, stacks a column and takes the largest on the other side', () => {
    const min = { width: 320, height: 240 }
    const row: Node = { kind: 'split', dir: 'row', children: [leaf('a'), leaf('b'), leaf('c')], sizes: [1, 1, 1] }
    expect(minSize(leaf('a'), min)).toEqual(min)
    expect(minSize(row, min)).toEqual({ width: 3 * 320 + 8, height: 240 })
    const nested: Node = { kind: 'split', dir: 'column', children: [leaf('a'), { ...row, children: [leaf('b'), leaf('c')], sizes: [1, 1] }], sizes: [1, 1] }
    expect(minSize(nested, min)).toEqual({ width: 2 * 320 + 4, height: 2 * 240 + 4 })
  })
})
