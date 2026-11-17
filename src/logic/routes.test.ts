import { describe, expect, it } from 'vitest'
import type { Library } from '../model'
import { addressOf, fileKeys, followRename, href, parseAddress, parseHash, resolve } from './routes'

const library: Library = {
  version: 1,
  courses: [
    {
      id: 'c1',
      name: 'Les vers (2)',
      quizzes: [{ id: 'q1', name: 'Plan 1', groups: [], cards: [] }],
    },
  ],
}

describe('addresses', () => {
  it('names the app\'s own tabs and an empty group', () => {
    for (const name of ['explorer', 'welcome', 'empty', 'changelog'] as const) expect(parseHash(href({ name }))).toEqual({ name })
    expect(href({ name: 'explorer' })).toBe('#/_explorer')
  })

  it('names the file with several open, and reads it back; one without it still works', () => {
    const quiz = { name: 'quiz', course: 'Les vers (2)', quiz: 'Plan 1' } as const
    const address = addressOf(quiz, 'biologie')
    expect(address).toBe('#/les-vers-2/plan-1?file=biologie')
    expect(parseAddress(address)).toEqual({ route: { name: 'quiz', course: 'les-vers-2', quiz: 'plan-1' }, file: 'biologie' })
    expect(parseAddress('#/les-vers-2')).toEqual({ route: { name: 'course', course: 'les-vers-2' }, file: null })
    expect(parseAddress(addressOf({ name: 'home' }, 'a b'))).toEqual({ route: { name: 'home' }, file: 'a b' })
    expect(addressOf(quiz, null)).toBe(href(quiz))
  })

  it('gives each open file a part of its own', () => {
    expect(fileKeys([
      { id: 'a', name: 'Biology.shrimp' },
      { id: 'b', name: 'Biology' },
      { id: 'c', name: 'Les vers (2)' },
      { id: 'd', name: 'biology 2' },
    ])).toEqual({ a: 'biology', b: 'biology-2', c: 'les-vers-2', d: 'biology-2-2' })
  })
})

describe('parseHash', () => {
  it('reads home and the debug page', () => {
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#/_debug')).toEqual({ name: 'debug' })
    expect(parseHash('#/_changelog')).toEqual({ name: 'changelog' })
    expect(parseHash('#/_workbench')).toEqual({ name: 'workbench' })
  })

  it('reads a Google Drive link, and goes home when it names no file', () => {
    expect(parseHash('#/_drive/1AbC-d_9')).toEqual({ name: 'drive', id: '1AbC-d_9' })
    expect(parseHash(href({ name: 'drive', id: '1AbC-d_9' }))).toEqual({ name: 'drive', id: '1AbC-d_9' })
    expect(parseHash('#/_drive')).toEqual({ name: 'home' })
    expect(parseHash('#/_drive/')).toEqual({ name: 'home' })
  })

  it('reads course, quiz and edit', () => {
    expect(parseHash('#/bio')).toEqual({ name: 'course', course: 'bio' })
    expect(parseHash('#/bio/plan-1')).toEqual({ name: 'quiz', course: 'bio', quiz: 'plan-1' })
    expect(parseHash('#/bio/plan-1/edit')).toEqual({ name: 'edit', course: 'bio', quiz: 'plan-1' })
  })

  it('reads study with a valid format and falls back to the quiz for an invalid one', () => {
    expect(parseHash('#/bio/plan-1/study/choice')).toEqual({ name: 'study', course: 'bio', quiz: 'plan-1', format: 'choice' })
    expect(parseHash('#/bio/plan-1/study/nope')).toEqual({ name: 'quiz', course: 'bio', quiz: 'plan-1' })
  })

  it('decodes escapes and goes home on a broken one', () => {
    expect(parseHash('#/caf%C3%A9')).toEqual({ name: 'course', course: 'café' })
    expect(parseHash('#/%E0%A4%A')).toEqual({ name: 'home' })
  })
})

describe('href', () => {
  it('writes names as slugs', () => {
    expect(href({ name: 'home' })).toBe('#/')
    expect(href({ name: 'debug' })).toBe('#/_debug')
    expect(href({ name: 'changelog' })).toBe('#/_changelog')
    expect(href({ name: 'workbench' })).toBe('#/_workbench')
    expect(href({ name: 'course', course: 'Les vers (2)' })).toBe('#/les-vers-2')
    expect(href({ name: 'edit', course: 'Les vers (2)', quiz: 'Plan 1' })).toBe('#/les-vers-2/plan-1/edit')
    expect(href({ name: 'study', course: 'A', quiz: 'B', format: 'typing' })).toBe('#/a/b/study/typing')
  })
})

describe('resolve', () => {
  it('matches course and quiz by slug', () => {
    const found = resolve(library, { name: 'quiz', course: 'les-vers-2', quiz: 'PLAN 1' })
    expect(found.course?.id).toBe('c1')
    expect(found.quiz?.id).toBe('q1')
    expect(found.missing).toBeUndefined()
  })

  it('reports a missing course', () => {
    expect(resolve(library, { name: 'course', course: 'nope' })).toEqual({ missing: 'course' })
  })

  it('keeps the course when the quiz is missing', () => {
    const found = resolve(library, { name: 'quiz', course: 'les-vers-2', quiz: 'nope' })
    expect(found.course?.id).toBe('c1')
    expect(found.missing).toBe('quiz')
  })

  it('gives nothing for routes with no course', () => {
    expect(resolve(library, { name: 'home' })).toEqual({})
  })
})

describe('followRename', () => {
  const renamed: Library = {
    version: 1,
    courses: [{ id: 'c1', name: 'Vers', quizzes: [{ id: 'q1', name: 'Plan', groups: [], cards: [] }] }],
  }
  const route = { name: 'quiz', course: 'Les vers (2)', quiz: 'Plan 1' } as const
  const last = (key: string) => ({ key, place: resolve(library, route) })

  it('finds the renamed course and quiz by id and names the new route', () => {
    const found = followRename(renamed, route, last(href(route)))
    expect(found?.route).toEqual({ name: 'quiz', course: 'Vers', quiz: 'Plan' })
    expect(found?.place.quiz?.id).toBe('q1')
  })
  it('keeps a course route a course route', () => {
    const r = { name: 'course', course: 'Les vers (2)' } as const
    expect(followRename(renamed, r, { key: href(r), place: resolve(library, r) })?.route).toEqual({ name: 'course', course: 'Vers' })
  })
  it('does nothing while the route resolves, for another address, or when the quiz is gone', () => {
    expect(followRename(library, route, last(href(route)))).toBeUndefined()
    expect(followRename(renamed, route, last('#/elsewhere'))).toBeUndefined()
    expect(followRename(renamed, route, undefined)).toBeUndefined()
    expect(followRename({ ...renamed, courses: [] }, route, last(href(route)))).toBeUndefined()
  })
})
