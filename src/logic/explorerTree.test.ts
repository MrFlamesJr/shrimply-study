import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, type Card, type Library } from '../model'
import type { Docs } from './contentOps'
import { DRIVE_ROOT, driveNodeOf, driveRows, explorerSource, nodeOf, parseDriveNode, refOf, targetFor, type DriveListing, type OpenDoc } from './explorerTree'

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

describe('Google Drive nodes', () => {
  const files = [
    { id: 'f1', name: 'one.shrimp', modified: '2026-11-01T10:00:00Z' },
    { id: 'f2', name: 'two.shrimp', modified: '2026-11-02T10:00:00Z' },
  ]
  const listing = (more: Partial<DriveListing> = {}): DriveListing => ({ signedIn: true, loading: false, failed: false, files, ...more })

  it('parses its node ids and leaves the others alone', () => {
    expect(parseDriveNode(DRIVE_ROOT)).toEqual({ kind: 'root' })
    expect(parseDriveNode('g:f:abc-1')).toEqual({ kind: 'file', id: 'abc-1' })
    expect(parseDriveNode(driveNodeOf({ kind: 'wait', id: 'x' }))).toEqual({ kind: 'wait', id: 'x' })
    expect(parseDriveNode('g:signin')).toEqual({ kind: 'signin' })
    expect(parseDriveNode('d:a')).toBeNull()
    expect(parseDriveNode('g:nothing')).toBeNull()
  })
  it('puts the Drive root after the open files, only when asked for', () => {
    expect(explorerSource(open).roots).toEqual(['d:a', 'd:b'])
    expect(explorerSource(open, listing()).roots).toEqual(['d:a', 'd:b', 'g:root'])
  })
  it('signed out: one sign-in row', () => {
    const src = explorerSource(open, listing({ signedIn: false, files: null }))
    expect(src.children('g:root')).toEqual(['g:signin'])
    expect(src.label('g:signin')).toBe('Sign in to see your Google Drive libraries')
  })
  it('signed in: the libraries that are not open, then the row to choose more', () => {
    const docs: OpenDoc[] = [{ ...open[0], driveId: 'f1' }, open[1]]
    const src = explorerSource(docs, listing())
    expect(src.children('g:root')).toEqual(['g:f:f2', 'g:pick'])
    expect(src.label('g:f:f2')).toBe('two.shrimp')
    expect(src.label('g:pick')).toBe("Don't see a file? Choose files in Google Drive")
    expect(src.label('g:root')).toBe('Google Drive')
  })
  it('loading and failing show one row; a refresh keeps the last list', () => {
    expect(driveRows(listing({ files: null, loading: true }), open)).toEqual(['g:loading'])
    expect(driveRows(listing({ files: null, failed: true }), open)).toEqual(['g:failed'])
    expect(driveRows(listing({ loading: true }), open)).toEqual(['g:f:f1', 'g:f:f2', 'g:pick'])
    expect(explorerSource(open, listing({ files: null, loading: true })).label('g:loading')).toBe('Loading your Google Drive…')
  })
  it('a closed library can be expanded (to open it); nothing else under Drive can', () => {
    const src = explorerSource(open, listing())
    expect(src.children('g:f:f1')).toEqual(['g:w:f1'])
    expect(src.children('g:pick')).toEqual([])
  })
})
