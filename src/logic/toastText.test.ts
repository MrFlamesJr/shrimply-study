import { describe, expect, it } from 'vitest'
import { NAME_MAX, cardRef, fromLine, isCut, quoteName, trail, undoHint } from './toastText'

describe('quoteName', () => {
  it('quotes a short name and collapses whitespace', () => expect(quoteName('  Mito \n chondria ')).toBe('"Mito chondria"'))
  it('keeps a name of exactly NAME_MAX', () => expect(quoteName('a'.repeat(NAME_MAX))).toBe(`"${'a'.repeat(NAME_MAX)}"`))
  it('cuts a long name at a word and ends in an ellipsis inside the quotes', () => {
    const out = quoteName('The mitochondria is the powerhouse of the cell and makes most of its ATP')
    expect(out).toBe('"The mitochondria is the powerhouse of…"')
  })
  it('cuts hard when there is no space near the limit', () => expect(quoteName('a'.repeat(60))).toBe(`"${'a'.repeat(NAME_MAX)}…"`))
})

describe('trail', () => {
  it('joins the non-empty names', () => expect(trail('My notes', null, 'Biology', '', undefined, 'Cells')).toBe('My notes › Biology › Cells'))
  it('is empty with none', () => expect(trail()).toBe(''))
})

describe('cardRef', () => {
  it('names a card', () => expect(cardRef({ id: 'x', term: 'Mitochondria', definition: '' })).toBe('the card "Mitochondria"'))
  it('says an empty card has no name', () => expect(cardRef({ id: 'x', term: '', definition: '' })).toBe('an empty card'))
})

describe('undoHint', () => {
  it('names the key and what comes back', () => {
    expect(undoHint(false)).toBe('Ctrl+Z puts it back.')
    expect(undoHint(true, 3)).toBe('⌘Z puts them back.')
  })
})

describe('isCut and fromLine', () => {
  it('tells when a name is cut', () => {
    expect(isCut('a'.repeat(NAME_MAX))).toBe(false)
    expect(isCut(`${'a'.repeat(NAME_MAX)}b`)).toBe(true)
  })
  it('writes where a thing was', () => {
    expect(fromLine('My notes › Biology › Cells', 'Hard ones')).toBe('From My notes › Biology › Cells, group Hard ones.')
    expect(fromLine('My notes')).toBe('From My notes.')
  })
})
