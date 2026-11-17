import { describe, expect, it } from 'vitest'
import { emptyLibrary, type Library } from '../model'
import { countLine, fileInfo, fileTreeSource, libraryCounts, unfoldFor } from './fileTree'

const lib = (courses: number[][]): Library => ({
  ...emptyLibrary(),
  courses: courses.map((quizzes, c) => ({
    id: `c${c}`,
    name: `Course ${c}`,
    quizzes: quizzes.map((cards, q) => ({
      id: `q${c}${q}`,
      name: `Quiz ${q}`,
      groups: [],
      cards: Array.from({ length: cards }, (_, k) => ({ id: `k${k}`, term: 'a', definition: 'b' })),
    })),
  })),
}) as unknown as Library

describe('fileTreeSource', () => {
  const src = fileTreeSource([
    { id: 'b', name: 'Beta', library: lib([[2]]) },
    { id: 'a', name: 'Alpha', library: lib([]) },
  ])
  it('lists files by name, then courses and quizzes, with quizzes as leaves', () => {
    expect(src.roots).toEqual(['d:a', 'd:b'])
    expect(src.children('d:b')).toEqual(['c:b:c0'])
    expect(src.children('c:b:c0')).toEqual(['q:b:c0:q00'])
    expect(src.children('q:b:c0:q00')).toEqual([])
    expect(src.label('q:b:c0:q00')).toBe('Quiz 0')
  })
})

describe('unfoldFor', () => {
  it('adds the file and the course', () => {
    expect([...unfoldFor(new Set(), 'a', 'c')]).toEqual(['d:a', 'c:a:c'])
    expect([...unfoldFor(new Set(), 'a', null)]).toEqual(['d:a'])
  })
  it('returns the same set when nothing changes', () => {
    const s = new Set(['d:a', 'c:a:c'])
    expect(unfoldFor(s, 'a', 'c')).toBe(s)
    expect(unfoldFor(s, null, null)).toBe(s)
  })
})

describe('libraryCounts', () => {
  it('counts courses, quizzes and cards', () => {
    expect(libraryCounts(lib([[1, 2], [3]]))).toEqual({ courses: 2, quizzes: 3, cards: 6 })
    expect(libraryCounts(lib([]))).toEqual({ courses: 0, quizzes: 0, cards: 0 })
  })
})

describe('countLine', () => {
  it('counts with plurals', () => {
    expect(countLine(lib([[1, 2], [3]]))).toBe('2 courses · 3 quizzes · 6 cards')
    expect(countLine(lib([[1]]))).toBe('1 course · 1 quiz · 1 card')
    expect(countLine(lib([]))).toBe('No courses yet')
  })
})

describe('fileInfo', () => {
  const base = { where: 'On this device', fileName: null, driveName: null, shared: false, newer: false, dirty: false, hasHome: false, counts: 'x' }
  it('keeps the order', () => {
    expect(fileInfo(base)).toEqual(['On this device', 'x'])
    expect(
      fileInfo({ ...base, fileName: 'a.shrimp', driveName: 'd.shrimp', shared: true, newer: true, hasHome: true }),
    ).toEqual(['On this device', 'd.shrimp', 'Shared with a link', 'A newer version is on Google Drive', 'x', 'All changes saved'])
    expect(fileInfo({ ...base, fileName: 'a.shrimp', dirty: true, hasHome: true })).toEqual(['On this device', 'a.shrimp', 'x', 'Unsaved changes'])
  })
})
