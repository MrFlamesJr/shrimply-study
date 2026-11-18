import { describe, expect, it } from 'vitest'
import { flatten, keyNav, pathTo, typeahead, type TreeSource } from './tree'

const kids: Record<string, string[]> = { r1: ['a', 'b'], a: ['a1', 'a2'], r2: ['c'], a1: [], a2: [], b: [], c: [] }
const labels: Record<string, string> = { r1: 'Root one', r2: 'Root two', a: 'Alpha', b: 'Bravo', a1: 'Élan vital', a2: 'Apple', c: 'Charlie' }
const src: TreeSource = { roots: ['r1', 'r2'], children: (id) => kids[id], label: (id) => labels[id] }
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe('flatten', () => {
  it('shows only expanded children, with depth, parent and sets', () => {
    expect(ids(flatten(src, new Set()))).toEqual(['r1', 'r2'])
    const rows = flatten(src, new Set(['r1', 'a']))
    expect(ids(rows)).toEqual(['r1', 'a', 'a1', 'a2', 'b', 'r2'])
    expect(rows[2]).toMatchObject({ depth: 2, parent: 'a', expandable: false, expanded: false, posInSet: 1, setSize: 2, match: null })
    expect(rows[0]).toMatchObject({ expandable: true, expanded: true, posInSet: 1, setSize: 2 })
    expect(rows[5]).toMatchObject({ expandable: true, expanded: false, posInSet: 2 })
  })

  it('an expanded id without children is not expandable', () => {
    expect(flatten(src, new Set(['b']))[0].expanded).toBe(false)
  })

  it('filters ignoring case and accents, showing ancestors expanded and the match range', () => {
    const rows = flatten(src, new Set(), 'ELAN')
    expect(ids(rows)).toEqual(['r1', 'a', 'a1'])
    expect(rows[0].expanded && rows[1].expanded).toBe(true)
    expect(rows[2].match).toEqual([0, 4])
    expect(rows[0].match).toBeNull()
    expect(rows[2].posInSet).toBe(1)
    expect(rows[2].setSize).toBe(1)
  })

  it('a match inside a word, and a matching parent hides non-matching children', () => {
    expect(flatten(src, new Set(), 'ppl')[2].match).toEqual([1, 4])
    const rows = flatten(src, new Set(), 'alpha')
    expect(ids(rows)).toEqual(['r1', 'a'])
    expect(rows[1].expandable).toBe(false)
    expect(flatten(src, new Set(), 'zzz')).toEqual([])
  })

  it('an empty filter is no filter', () => {
    expect(ids(flatten(src, new Set(), ''))).toEqual(['r1', 'r2'])
  })
})

describe('keyNav', () => {
  const rows = flatten(src, new Set(['r1', 'a']))

  it('moves with arrows, Home, End and pages, clamped', () => {
    expect(keyNav(rows, 'r1', 'ArrowDown')).toEqual({ focus: 'a' })
    expect(keyNav(rows, 'r1', 'ArrowUp')).toEqual({ focus: 'r1' })
    expect(keyNav(rows, 'r2', 'ArrowDown')).toEqual({ focus: 'r2' })
    expect(keyNav(rows, 'b', 'Home')).toEqual({ focus: 'r1' })
    expect(keyNav(rows, 'b', 'End')).toEqual({ focus: 'r2' })
    expect(keyNav(rows, 'r1', 'PageDown', 2)).toEqual({ focus: 'a1' })
    expect(keyNav(rows, 'r1', 'PageDown')).toEqual({ focus: 'r2' })
    expect(keyNav(rows, 'a2', 'PageUp', 2)).toEqual({ focus: 'a' })
    expect(keyNav(rows, 'a2', 'PageUp')).toEqual({ focus: 'r1' })
  })

  it('starts at the first row without a focus', () => {
    expect(keyNav(rows, null, 'ArrowDown')).toEqual({ focus: 'r1' })
    expect(keyNav(rows, null, 'ArrowRight')).toEqual({ focus: 'r1' })
  })

  it('ArrowRight expands, else goes to the first child, else nothing', () => {
    expect(keyNav(rows, 'r2', 'ArrowRight')).toEqual({ expand: 'r2' })
    expect(keyNav(rows, 'r1', 'ArrowRight')).toEqual({ focus: 'a' })
    expect(keyNav(rows, 'b', 'ArrowRight')).toEqual({})
  })

  it('ArrowLeft collapses, else goes to the parent, else nothing', () => {
    expect(keyNav(rows, 'a', 'ArrowLeft')).toEqual({ collapse: 'a' })
    expect(keyNav(rows, 'a1', 'ArrowLeft')).toEqual({ focus: 'a' })
    expect(keyNav(rows, 'r2', 'ArrowLeft')).toEqual({})
  })

  it('Enter activates; other keys are null', () => {
    expect(keyNav(rows, 'b', 'Enter')).toEqual({ activate: 'b' })
    expect(keyNav(rows, 'b', 'x')).toBeNull()
    expect(keyNav([], null, 'ArrowDown')).toBeNull()
  })
})

describe('pathTo and typeahead', () => {
  it('pathTo gives ancestors root first', () => {
    expect(pathTo(src, 'a2')).toEqual(['r1', 'a'])
    expect(pathTo(src, 'r1')).toEqual([])
    expect(pathTo(src, 'zz')).toBeNull()
  })

  const rows = flatten(src, new Set(['r1', 'a']))
  const label = (id: string) => labels[id]
  it('typeahead finds the next label starting with the text, wrapping, ignoring case and accents', () => {
    expect(typeahead(rows, null, 'b', label)).toBe('b')
    expect(typeahead(rows, 'r1', 'a', label)).toBe('a')
    expect(typeahead(rows, 'a', 'a', label)).toBe('a2')
    expect(typeahead(rows, 'a', 'al', label)).toBe('a')
    expect(typeahead(rows, 'r2', 'r', label)).toBe('r1')
    expect(typeahead(rows, null, 'elan', label)).toBe('a1')
    expect(typeahead(rows, null, 'zz', label)).toBeNull()
    expect(typeahead(rows, null, '', label)).toBeNull()
  })
})
