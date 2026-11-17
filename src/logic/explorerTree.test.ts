import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, type Card, type Library } from '../model'
import type { Docs } from './contentOps'
import { closedDriveFiles, driveNodeOf, explorerSource, isPeekDoc, peekDocId, peekDocs, peekDriveId, nodeOf, parseDriveNode, refOf, targetFor, type DriveListing, type OpenDoc } from './explorerTree'

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
    // a quiz shows its ungrouped cards, then its groups, each with its cards
    expect(src.children('q:a:c1:q1')).toEqual(['k:a:c1:q1:k1', 'p:a:c1:q1:g1'])
    expect(src.children('p:a:c1:q1:g1')).toEqual(['k:a:c1:q1:k2'])
    expect(src.label('p:a:c1:q1:g1')).toBe('G')
    expect(src.children('k:a:c1:q1:k1')).toEqual([])
    expect(src.children('d:b')).toEqual([])
    expect(['d:a', 'c:a:c1', 'q:a:c1:q1', 'k:a:c1:q1:k2'].map(src.label)).toEqual(['one.shrimp', 'Bio', 'Cells', 'Tk2'])
  })
})

describe('refOf / nodeOf', () => {
  it('round trip', () => {
    for (const id of ['d:a', 'c:a:c1', 'q:a:c1:q1', 'k:a:c1:q1:k1', 'p:a:c1:q1:g1']) expect(nodeOf(refOf(id))).toBe(id)
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

describe('Google Drive libraries among the files', () => {
  const files = [
    { id: 'f1', name: 'one.shrimp', modified: '2026-11-01T10:00:00Z' },
    { id: 'f2', name: 'Zed.shrimp', modified: '2026-11-02T10:00:00Z' },
    { id: 'f3', name: 'élan.shrimp', modified: '2026-11-02T10:00:00Z' },
  ]
  const listing = (more: Partial<DriveListing> = {}): DriveListing => ({ signedIn: true, loading: false, failed: false, files, ...more })

  it('parses its node ids and leaves the others alone', () => {
    expect(parseDriveNode('g:f:abc-1')).toEqual({ kind: 'file', id: 'abc-1' })
    expect(parseDriveNode(driveNodeOf({ kind: 'wait', id: 'x' }))).toEqual({ kind: 'wait', id: 'x' })
    expect(parseDriveNode('d:a')).toBeNull()
    expect(parseDriveNode('g:root')).toBeNull()
  })
  it('without a list the roots are the open files', () => {
    expect(explorerSource(open).roots).toEqual(['d:a', 'd:b'])
    expect(explorerSource(open, listing({ signedIn: false, files: null })).roots).toEqual(['d:a', 'd:b'])
    expect(explorerSource(open, listing({ files: null, loading: true })).roots).toEqual(['d:a', 'd:b'])
  })
  it('open and not open files are one list sorted by name, ignoring case and accents', () => {
    const src = explorerSource(open, listing())
    // open: one.shrimp, two.shrimp; not open: one.shrimp, Zed.shrimp, élan.shrimp
    expect(src.roots.map(src.label)).toEqual(['élan.shrimp', 'one.shrimp', 'one.shrimp', 'two.shrimp', 'Zed.shrimp'])
    expect(src.roots[1]).toBe('d:a')
  })
  it('a library that is open is not listed twice', () => {
    const docs: OpenDoc[] = [{ ...open[0], driveId: 'f1' }, open[1]]
    expect(closedDriveFiles(listing(), docs).map((f) => f.id)).toEqual(['f2', 'f3'])
    expect(explorerSource(docs, listing()).roots.filter((r) => r.startsWith('g:'))).toEqual(['g:f:f3', 'g:f:f2'])
  })
  it('a closed library has one placeholder so it can be expanded to open it', () => {
    const src = explorerSource(open, listing())
    expect(src.children('g:f:f1')).toEqual(['g:w:f1'])
    expect(src.label('g:f:f1')).toBe('one.shrimp')
    expect(src.label('g:w:f1')).toBe('Opening…')
  })
  it('the list is kept while it refreshes', () => {
    expect(closedDriveFiles(listing({ loading: true }), open)).toHaveLength(3)
    expect(closedDriveFiles(undefined, open)).toEqual([])
  })
  describe('a library that is not open, looked at', () => {
    it('shows what is inside once read, under ids of its own', () => {
      const src = explorerSource(open, listing(), { f1: library })
      const doc = peekDocId('f1')
      expect(src.children('g:f:f1')).toEqual([`c:${doc}:c1`, `c:${doc}:c2`])
      expect(src.children(`c:${doc}:c1`)).toEqual([`q:${doc}:c1:q1`, `q:${doc}:c1:q2`])
      expect(src.label(`k:${doc}:c1:q1:k2`)).toBe('Tk2')
      expect(src.label('g:f:f1')).toBe('one.shrimp')
    })
    it('shows a loading row, then a failure row, and the placeholder before any look', () => {
      expect(explorerSource(open, listing(), { f1: 'loading' }).children('g:f:f1')).toEqual(['g:l:f1'])
      expect(explorerSource(open, listing(), { f1: 'failed' }).children('g:f:f1')).toEqual(['g:x:f1'])
      expect(explorerSource(open, listing(), {}).children('g:f:f1')).toEqual(['g:w:f1'])
      const src = explorerSource(open, listing(), { f1: 'loading' })
      expect(src.label('g:l:f1')).toBe('Loading…')
      expect(explorerSource(open, listing(), { f1: 'failed' }).label('g:x:f1')).toBe("Couldn't read this library")
      expect(parseDriveNode('g:x:f1')).toEqual({ kind: 'failed', id: 'f1' })
    })
    it('the peeked libraries are documents for content operations, under ids no real document has', () => {
      expect(peekDocs({ f1: library, f2: 'loading', f3: 'failed' })).toEqual({ [peekDocId('f1')]: library })
      expect(isPeekDoc(peekDocId('f1'))).toBe(true)
      expect(isPeekDoc('a')).toBe(false)
      expect(peekDriveId(peekDocId('f1'))).toBe('f1')
    })
  })
})

describe('targetFor with groups', () => {
  it('a card dropped on a group joins it; before or after a group is no place for it', () => {
    expect(targetFor(docs, 'p:a:c1:q1:g1', 'inside', 'card')).toEqual({ kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', group: 'g1' })
    expect(targetFor(docs, 'p:a:c1:q1:g1', 'before', 'card')).toBeNull()
  })
  it('a group goes in a quiz: its end, or before and after another group by its place among the groups', () => {
    expect(targetFor(docs, 'q:a:c1:q1', 'inside', 'group')).toEqual({ kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: undefined, group: null })
    expect(targetFor(docs, 'p:a:c1:q1:g1', 'before', 'group')).toMatchObject({ kind: 'quiz', quiz: 'q1', index: 0 })
    expect(targetFor(docs, 'p:a:c1:q1:g1', 'after', 'group')).toMatchObject({ kind: 'quiz', quiz: 'q1', index: 1 })
  })
  it('a group has no place beside a card, in a course or in a file', () => {
    expect(targetFor(docs, 'k:a:c1:q1:k1', 'after', 'group')).toBeNull()
    expect(targetFor(docs, 'c:a:c1', 'inside', 'group')).toBeNull()
    expect(targetFor(docs, 'd:a', 'inside', 'group')).toBeNull()
    expect(targetFor(docs, 'q:a:c1:q1', 'after', 'group')).toBeNull()
  })
  it('a quiz or a course walks up from a group to its place in the parent', () => {
    expect(targetFor(docs, 'p:a:c1:q1:g1', 'after', 'quiz')).toEqual({ kind: 'course', doc: 'a', course: 'c1', index: 1 })
    expect(targetFor(docs, 'p:a:c1:q1:g1', 'before', 'course')).toEqual({ kind: 'doc', doc: 'a', index: 0 })
  })
})
