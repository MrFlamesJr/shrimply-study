import { describe, expect, it } from 'vitest'
import { fileNameProblem, freeName, nameTaken, slug } from './names'

describe('fileNameProblem', () => {
  it('takes ordinary names, accents, dots inside and symbols files allow', () => {
    for (const name of ['Bio 130', 'Écologie', 'notes.v2', 'Chap 1 + 2 (final) #3', "Marie's cards", 'console']) {
      expect(fileNameProblem(name)).toBeUndefined()
    }
  })

  it('turns down characters no file name may hold', () => {
    for (const name of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b']) {
      expect(fileNameProblem(name)).toMatch(/can't contain/)
    }
    expect(fileNameProblem('a\tb')).toMatch(/line breaks or tabs/)
  })

  it('turns down a dot or space at the end', () => {
    expect(fileNameProblem('Bio.')).toMatch(/end with a dot or a space/)
    expect(fileNameProblem('Bio ')).toMatch(/end with a dot or a space/)
  })

  it("turns down Windows' device names, in any case and with any ending", () => {
    for (const name of ['CON', 'nul', 'Com1', 'LPT9', 'aux.backup']) expect(fileNameProblem(name)).toMatch(/kept for devices/)
    for (const name of ['COM10', 'console', 'auxiliary']) expect(fileNameProblem(name)).toBeUndefined()
  })
})

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
