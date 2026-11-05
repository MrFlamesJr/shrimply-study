import { describe, expect, it } from 'vitest'
import type { Library } from './model'
import { href, parseHash, resolve } from './route'

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

describe('parseHash', () => {
  it('reads home and the debug page', () => {
    expect(parseHash('#/')).toEqual({ name: 'home' })
    expect(parseHash('')).toEqual({ name: 'home' })
    expect(parseHash('#/_debug')).toEqual({ name: 'debug' })
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
