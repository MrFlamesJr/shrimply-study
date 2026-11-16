import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, type Card, type Library } from '../model'
import type { Docs } from './contentOps'
import { explorerSource, nodeOf, refOf, targetFor, type OpenDoc } from './explorerTree'

const card = (id: string, group?: string): Card => ({ id, term: `T${id}`, definition: 'd', ...(group && { group }) }) as Card
const library: Library = {
  version: FORMAT_VERSION,
  courses: [
    {
      id: 'c1', name: 'Bio',
      quizzes: [
        { id: 'q1', name: 'Cells', groups: [{ id: 'g1', name: 'G', color: 'coral' }], cards: [card('k1'), card('k2', 'g1')] },
        { id: 'q2', name: 'Empty', groups: [], cards: [] },
      ],
    },
    { id: 'c2', name: 'Chem', quizzes: [] },
  ],
}
const open: OpenDoc[] = [
  { id: 'a', name: 'one.shrimp', library },
  { id: 'b', name: 'two.shrimp', library: { version: FORMAT_VERSION, courses: [] } },
]
const docs: Docs = { a: library, b: open[1].library }

describe('explorerSource', () => {
  const src = explorerSource(open)
  it('lists files, courses, quizzes and cards in order with labels', () => {
    expect(src.roots).toEqual(['d:a', 'd:b'])
    expect(src.children('d:a')).toEqual(['c:a:c1', 'c:a:c2'])
    expect(src.children('c:a:c1')).toEqual(['q:a:c1:q1', 'q:a:c1:q2'])
    expect(src.children('q:a:c1:q1')).toEqual(['k:a:c1:q1:k1', 'k:a:c1:q1:k2'])
    expect(src.children('k:a:c1:q1:k1')).toEqual([])
    expect(src.children('d:b')).toEqual([])
    expect(['d:a', 'c:a:c1', 'q:a:c1:q1', 'k:a:c1:q1:k2'].map(src.label)).toEqual(['one.shrimp', 'Bio', 'Cells', 'Tk2'])
  })
})

describe('refOf / nodeOf', () => {
  it('round trip', () => {
    for (const id of ['d:a', 'c:a:c1', 'q:a:c1:q1', 'k:a:c1:q1:k1']) expect(nodeOf(refOf(id))).toBe(id)
    expect(refOf('q:a:c1:q1')).toEqual({ kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1' })
    expect(() => refOf('x:1')).toThrow()
  })
})

describe('targetFor', () => {
  it('inside a quiz is its end, with no group', () => {
    expect(targetFor(docs, 'q:a:c1:q1', 'inside', 'card')).toEqual({ kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: undefined, group: null })
  })
  it('before and after a card use its index and its group', () => {
    expect(targetFor(docs, 'k:a:c1:q1:k2', 'before', 'card')).toMatchObject({ quiz: 'q1', index: 1, group: 'g1' })
    expect(targetFor(docs, 'k:a:c1:q1:k2', 'after', 'card')).toMatchObject({ index: 2, group: 'g1' })
    expect(targetFor(docs, 'k:a:c1:q1:k1', 'after', 'card')).toMatchObject({ index: 1, group: null })
  })
  it('before and after a quiz or course use the place in the parent', () => {
    expect(targetFor(docs, 'q:a:c1:q2', 'before', 'quiz')).toEqual({ kind: 'course', doc: 'a', course: 'c1', index: 1 })
    expect(targetFor(docs, 'c:a:c1', 'after', 'course')).toEqual({ kind: 'doc', doc: 'a', index: 1 })
    expect(targetFor(docs, 'c:a:c1', 'inside', 'quiz')).toEqual({ kind: 'course', doc: 'a', course: 'c1', index: undefined })
  })
  it('on a file is the end of its courses; no node is the last file', () => {
    expect(targetFor(docs, 'd:a', 'inside', 'course')).toEqual({ kind: 'doc', doc: 'a', index: undefined })
    expect(targetFor(docs, 'd:a', 'before', 'course')).toEqual({ kind: 'doc', doc: 'a', index: undefined })
    expect(targetFor(docs, null, 'inside', 'course')).toEqual({ kind: 'doc', doc: 'b', index: undefined })
    expect(targetFor({}, null, 'inside', 'course')).toBeNull()
  })
  it('walks up to the nearest parent that takes the kind, else null', () => {
    expect(targetFor(docs, 'k:a:c1:q1:k1', 'after', 'quiz')).toEqual({ kind: 'course', doc: 'a', course: 'c1', index: 1 })
    expect(targetFor(docs, 'k:a:c1:q1:k1', 'before', 'quiz')).toEqual({ kind: 'course', doc: 'a', course: 'c1', index: 0 })
    expect(targetFor(docs, 'k:a:c1:q1:k1', 'after', 'course')).toEqual({ kind: 'doc', doc: 'a', index: 1 })
    expect(targetFor(docs, 'q:a:c1:q1', 'inside', 'quiz')).toEqual({ kind: 'course', doc: 'a', course: 'c1', index: 1 })
    expect(targetFor(docs, 'd:a', 'inside', 'quiz')).toBeNull()
    expect(targetFor(docs, 'c:a:c1', 'after', 'card')).toBeNull()
    expect(targetFor(docs, 'c:a:zz', 'after', 'course')).toBeNull()
  })
})
