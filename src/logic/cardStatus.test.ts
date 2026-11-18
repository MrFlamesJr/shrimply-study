import { describe, expect, it } from 'vitest'
import type { Card, TrueFalseCard } from '../model'
import { cardName, isBlank, missingPart, sameCard, tidyCard, tidyCards, unfinishedMessage } from './cardStatus'

const card = (term: string, definition: string) => ({ id: 'x', term, definition })
const cloze = (statement: string) => ({ id: 'x', type: 'cloze' as const, statement, explanation: [] })

describe('cardName', () => {
  it('names a term card by its term, else its definition', () => {
    expect(cardName(card('Mitochondria', 'Powerhouse'))).toBe('Mitochondria')
    expect(cardName(card('  ', 'Powerhouse'))).toBe('Powerhouse')
  })
  it('collapses whitespace runs and trims', () => expect(cardName(card('  A\n\n  b\t c ', ''))).toBe('A b c'))
  it('names the other kinds by their first text', () => {
    expect(cardName(cloze('The {sun} is a {star}'))).toBe('The sun is a star')
    expect(cardName({ id: 'x', type: 'true-false', statement: 'Water is wet', answer: true } as Card)).toBe('Water is wet')
    expect(cardName({ id: 'x', type: 'choice', question: 'Which?', mode: 'one', right: ['a'], wrong: ['b'] } as Card)).toBe('Which?')
    expect(cardName({ id: 'x', type: 'sequence', title: 'Steps', steps: ['a', 'b'] } as Card)).toBe('Steps')
  })
  it('is empty when there is no text', () => {
    expect(cardName(card('', ''))).toBe('')
    expect(cardName(cloze(''))).toBe('')
  })
})

describe('isBlank', () => {
  it('is true only when both sides are empty or whitespace', () => {
    expect(isBlank(card('', ''))).toBe(true)
    expect(isBlank(card('  ', '\n'))).toBe(true)
    expect(isBlank(card('a', ''))).toBe(false)
    expect(isBlank(card('', 'b'))).toBe(false)
  })

  it('is false when only the explanation has text', () => {
    expect(isBlank({ ...card('', ''), explanation: 'why' })).toBe(false)
    expect(isBlank({ ...card('', ''), explanation: '  ' })).toBe(true)
  })
})

describe('missingPart', () => {
  it('names the empty side of a half-filled card', () => {
    expect(missingPart(card('a', ''))).toBe('definition')
    expect(missingPart(card(' ', 'b'))).toBe('term')
  })

  it('is null for complete and blank cards', () => {
    expect(missingPart(card('a', 'b'))).toBeNull()
    expect(missingPart(card('', ''))).toBeNull()
  })

  it('asks for a term when only the explanation is filled', () => {
    expect(missingPart({ ...card('', ''), explanation: 'why' })).toBe('term')
    expect(missingPart({ ...card('a', 'b'), explanation: 'why' })).toBeNull()
  })
})

describe('unfinishedMessage', () => {
  const ok = card('a', 'b')

  it('is null when no card is half-filled', () => {
    expect(unfinishedMessage([ok, card('', '')])).toBeNull()
  })

  it('names one card and its missing side', () => {
    expect(unfinishedMessage([ok, card('a', '')])?.text).toBe('"a" needs a back.')
    expect(unfinishedMessage([card('', 'b')])?.text).toBe('"b" needs a front.')
  })

  it('lists several cards', () => {
    expect(unfinishedMessage([card('a', ''), ok, card('', 'b')])?.text).toBe('2 cards need a front or back.')
    expect(unfinishedMessage([card('a', ''), card('a', ''), card('a', '')])?.text).toBe('3 cards need a front or back.')
  })

  it('says under More info which cards, by name and number', () => {
    const found = unfinishedMessage([card('a', ''), ok, card('', 'b'), { ...card('', ''), termImage: 'data:image/png;base64,AAAA' }])!
    expect(found.detail).toEqual([
      'Each is marked in red; the first has the focus.',
      '"a" (#1) needs a back.',
      '"b" (#3) needs a front.',
      'Card #4 needs a front.',
    ])
  })

  it('cuts a long name at 40 and gives the full one in the detail', () => {
    const name = 'The mitochondria is the powerhouse of the cell and makes most of its ATP'
    const found = unfinishedMessage([card(name, '')])!
    expect(found.text).toBe('"The mitochondria is the powerhouse of…" needs a back.')
    expect(found.detail).toEqual([`The full name is "${name}".`])
    expect(unfinishedMessage([card('short', '')])!.detail).toEqual([])
  })

  it('has no name for a card with no text, only its number', () => {
    expect(unfinishedMessage([ok, { ...card('', ''), termImage: 'data:image/png;base64,AAAA' }])?.text).toBe('Card #2 needs a front.')
  })

  it('shortens a long list', () => {
    const half = Array.from({ length: 8 }, () => card('a', ''))
    const found = unfinishedMessage(half)!
    expect(found.text).toBe('8 cards need a front or back.')
    expect(found.detail).toHaveLength(9)
    const many = unfinishedMessage(Array.from({ length: 12 }, () => card('a', '')))!
    expect(many.detail).toHaveLength(12)
    expect(many.detail.at(-1)).toBe('And 2 more.')
  })
})

describe('cards with images', () => {
  const png = 'data:image/png;base64,AAAA'

  it('are not blank when they only have an image', () => {
    expect(isBlank({ ...card('', ''), termImage: png })).toBe(false)
    expect(isBlank({ ...card('', ''), definitionImage: png })).toBe(false)
    expect(isBlank({ ...cloze(''), image: png })).toBe(false)
  })

  it('still ask for text when only an image is there', () => {
    expect(missingPart({ ...card('', ''), termImage: png })).toBe('term')
    expect(missingPart({ ...card('', ''), definitionImage: png })).toBe('term')
    expect(missingPart({ ...card('a', ''), termImage: png })).toBe('definition')
    expect(missingPart({ ...card('a', 'b'), termImage: png })).toBeNull()
    expect(missingPart({ ...cloze(''), image: png })).toBe('blank')
    expect(missingPart({ ...cloze('Water {boils}'), image: png })).toBeNull()
    expect(unfinishedMessage([{ ...card('', ''), termImage: png }])?.text).toBe('Card #1 needs a front.')
  })
})

describe('fill-in-the-blank cards', () => {
  it('are blank only when the statement is empty', () => {
    expect(isBlank(cloze(' '))).toBe(true)
    expect(isBlank(cloze('Water boils'))).toBe(false)
  })

  it('need a blank when the statement has none', () => {
    expect(missingPart(cloze('Water boils'))).toBe('blank')
    expect(missingPart(cloze('Water {boils}'))).toBeNull()
    expect(missingPart(cloze(''))).toBeNull()
    expect(unfinishedMessage([cloze('Water boils')])?.text).toBe('"Water boils" needs a blank.')
    expect(unfinishedMessage([cloze('a'), card('a', '')])?.text).toBe('2 cards need a front, back or blank.')
  })
})

describe('tidyCard', () => {
  it('returns the same object when nothing changes', () => {
    const tidy = { ...card('a', 'b'), explanation: 'why' }
    expect(tidyCard(tidy)).toBe(tidy)
    expect(tidyCard(card('a', 'b'))).toEqual(card('a', 'b'))
    const c = cloze('The {x}')
    expect(tidyCard(c)).toBe(c)
  })

  it('trims both sides and the explanation', () => {
    expect(tidyCard({ ...card(' a ', '\nb '), explanation: ' why ' })).toEqual({ ...card('a', 'b'), explanation: 'why' })
  })

  it('turns an empty explanation into undefined', () => {
    expect(tidyCard({ ...card('a', 'b'), explanation: '  ' }).explanation).toBeUndefined()
  })

  it('tidies a fill-in-the-blank card', () => {
    const c = { ...cloze(' The {x} {y} '), explanation: [' why ', '', null, '  '] }
    expect(tidyCard(c)).toEqual({ ...c, statement: 'The {x} {y}', explanation: ['why', null, null, null] })
  })
})

describe('sameCard', () => {
  it('compares every field, lists element by element', () => {
    expect(sameCard(card('a', 'b'), card('a', 'b'))).toBe(true)
    expect(sameCard(card('a', 'b'), card('a', 'c'))).toBe(false)
    const c = { ...cloze('{x}'), explanation: ['a', null] }
    expect(sameCard(c, { ...c, explanation: ['a', null] })).toBe(true)
    expect(sameCard(c, { ...c, explanation: ['a', 'b'] })).toBe(false)
    expect(sameCard(c, { ...c, explanation: ['a'] })).toBe(false)
  })

  it('sees an added key', () => {
    expect(sameCard(card('a', 'b'), { ...card('a', 'b'), explanation: 'x' })).toBe(false)
    expect(sameCard({ ...card('a', 'b'), explanation: 'x' }, card('a', 'b'))).toBe(false)
  })
})

describe('tidyCards', () => {
  const groups = [
    { id: 'g1', name: 'One', color: 'lagoon' as const },
    { id: 'g2', name: 'Two', color: 'coral' as const },
  ]

  it('reports no change for tidy cards', () => {
    const cards = [{ ...card('a', 'b'), group: 'g1' }]
    const out = tidyCards(cards, [groups[0]])
    expect(out.changed).toBe(false)
    expect(out.cards[0]).toBe(cards[0])
  })

  it('drops blank cards and groups left without cards', () => {
    const cards = [card('a', 'b'), { ...card('', ''), group: 'g2' }, { ...card('c', 'd'), group: 'g1' }]
    const out = tidyCards(cards, groups)
    expect(out.cards).toEqual([cards[0], cards[2]])
    expect(out.groups).toEqual([groups[0]])
    expect(out.changed).toBe(true)
  })

  it('reports a tidied card as a change', () => {
    expect(tidyCards([card(' a', 'b')], []).changed).toBe(true)
  })
})

describe('true-or-false cards', () => {
  const tf = (statement: string, extra: Partial<TrueFalseCard> = {}): Card => ({ id: 't', type: 'true-false', statement, answer: true, ...extra })

  it('is blank without statement, image and explanation', () => {
    expect(isBlank(tf(' '))).toBe(true)
    expect(isBlank(tf('', { image: 'data:image/png;base64,AA' }))).toBe(false)
    expect(isBlank(tf('', { explanation: 'why' }))).toBe(false)
  })

  it('misses a statement when it has an image or explanation only', () => {
    expect(missingPart(tf(''))).toBeNull()
    expect(missingPart(tf('', { explanation: 'why' }))).toBe('statement')
    expect(missingPart(tf('S', { explanation: 'why' }))).toBeNull()
  })

  it('tidies the statement and closes an empty explanation', () => {
    const tidy = tf('S', { explanation: 'why' })
    expect(tidyCard(tidy)).toBe(tidy)
    expect(tidyCard(tf(' S ', { explanation: ' ' }))).toEqual(tf('S', { explanation: undefined }))
  })

  it('names only the missing parts', () => {
    const bad = tf('', { explanation: 'why' })
    expect(unfinishedMessage([bad])?.text).toBe('Card #1 needs a statement.')
    expect(unfinishedMessage([bad, bad])?.text).toBe('2 cards need a statement.')
    expect(unfinishedMessage([card('a', ''), bad])?.text).toBe('2 cards need a front, back or statement.')
    expect(unfinishedMessage([card('a', ''), card('', 'b'), bad])?.text).toBe('3 cards need a front, back or statement.')
  })
})
