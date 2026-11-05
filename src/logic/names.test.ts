import { describe, expect, it } from 'vitest'
import { freeName, nameTaken, slug } from './names'

describe('slug', () => {
  it('joins the lower-case words with dashes', () => {
    expect(slug('Les vers (2)')).toBe('les-vers-2')
    expect(slug('  BIO130 - Invertébrés: les vers  ')).toBe('bio130-invertébrés-les-vers')
  })

  it('keeps a name with no letters or digits', () => {
    expect(slug(' ?! ')).toBe('?!')
  })

  it('gives a slug back unchanged', () => {
    for (const name of ['Les vers (2)', 'Écologie', '?!']) expect(slug(slug(name))).toBe(slug(name))
  })
})

describe('nameTaken', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(nameTaken('les  vers!', ['Bio', 'Les vers'], 'quiz')).toBe('Another quiz is already named "Les vers"')
    expect(nameTaken('Les vers 2', ['Les vers'], 'quiz')).toBeUndefined()
  })
})

describe('freeName', () => {
  it('numbers the name until no other counts as the same', () => {
    expect(freeName('New course', [])).toBe('New course')
    expect(freeName('New course', ['new course', 'New course 2'])).toBe('New course 3')
  })
})
