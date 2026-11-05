import { describe, expect, it } from 'vitest'
import { isBlank, missingPart, unfinishedMessage } from './cardStatus'

const card = (term: string, definition: string) => ({ id: 'x', term, definition })
const cloze = (statement: string) => ({ id: 'x', type: 'cloze' as const, statement, explanation: [] })

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
    expect(unfinishedMessage([ok, card('a', '')])).toBe('Card #2 needs a definition.')
    expect(unfinishedMessage([card('', 'b')])).toBe('Card #1 needs a term.')
  })

  it('lists several cards', () => {
    expect(unfinishedMessage([card('a', ''), ok, card('', 'b')])).toBe('Cards #1 and #3 need a term or definition.')
    expect(unfinishedMessage([card('a', ''), card('a', ''), card('a', '')])).toBe(
      'Cards #1, #2 and #3 need a term or definition.',
    )
  })

  it('shortens a long list', () => {
    const half = Array.from({ length: 8 }, () => card('a', ''))
    expect(unfinishedMessage(half)).toBe('Cards #1, #2, #3, #4, #5 and 3 more need a term or definition.')
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
    expect(unfinishedMessage([{ ...card('', ''), termImage: png }])).toBe('Card #1 needs a term.')
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
    expect(unfinishedMessage([cloze('Water boils')])).toBe('Card #1 needs a blank.')
    expect(unfinishedMessage([cloze('a'), card('a', '')])).toBe('Cards #1 and #2 need a term, definition or blank.')
  })
})
