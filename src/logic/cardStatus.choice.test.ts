import { describe, expect, it } from 'vitest'
import type { Card, ChoiceCard, SequenceCard } from '../model'
import { isBlank, missingPart, tidyCard, tidyCards, unfinishedMessage } from './cardStatus'

const choice = (extra: Partial<ChoiceCard> = {}): ChoiceCard => ({ id: 'c', type: 'choice', question: 'Q', mode: 'one', right: ['A'], wrong: ['B'], ...extra })
const sequence = (extra: Partial<SequenceCard> = {}): SequenceCard => ({ id: 's', type: 'sequence', title: 'T', steps: ['a', 'b'], ...extra })
const png = 'data:image/png;base64,AA'

describe('choice question status', () => {
  it('is blank only with nothing typed anywhere', () => {
    expect(isBlank(choice({ question: ' ', right: ['', ' '], wrong: [''] }))).toBe(true)
    expect(isBlank(choice({ question: '', right: [], wrong: [] }))).toBe(true)
    expect(isBlank(choice({ question: '', right: [''], wrong: ['x'] }))).toBe(false)
    expect(isBlank(choice({ question: '', right: [], wrong: [], image: png }))).toBe(false)
    expect(isBlank(choice({ question: '', right: [], wrong: [], explanation: 'why' }))).toBe(false)
  })

  it('names the first missing part, in order', () => {
    expect(missingPart(choice())).toBeNull()
    expect(missingPart(choice({ question: '', right: [], wrong: [] }))).toBeNull()
    expect(missingPart(choice({ question: ' ', right: [], wrong: [] , explanation: 'why' }))).toBe('question')
    expect(missingPart(choice({ right: ['', ' '] }))).toBe('right')
    expect(missingPart(choice({ wrong: [''] }))).toBe('wrong')
    expect(missingPart(choice({ right: [], wrong: [] }))).toBe('right')
  })

  it('tidies texts and entries, and keeps the same object when nothing changes', () => {
    const tidy = choice({ explanation: 'why' })
    expect(tidyCard(tidy)).toBe(tidy)
    expect(tidyCard(choice({ question: ' Q ', right: [' A ', ''], wrong: ['B', ' '], explanation: ' ' }))).toEqual(
      choice({ explanation: undefined }),
    )
  })
})

describe('sequence status', () => {
  it('is blank only with nothing typed anywhere', () => {
    expect(isBlank(sequence({ title: ' ', steps: ['', ' ', ''] }))).toBe(true)
    expect(isBlank(sequence({ title: '', steps: ['x'] }))).toBe(false)
    expect(isBlank(sequence({ title: '', steps: [], image: png }))).toBe(false)
    expect(isBlank(sequence({ title: '', steps: [], explanation: 'why' }))).toBe(false)
  })

  it('names the first missing part, in order', () => {
    expect(missingPart(sequence())).toBeNull()
    expect(missingPart(sequence({ title: '', steps: ['', ''] }))).toBeNull()
    expect(missingPart(sequence({ title: '', steps: ['a', 'b'] }))).toBe('title')
    expect(missingPart(sequence({ steps: ['a', ' ', ''] }))).toBe('steps')
    expect(missingPart(sequence({ steps: ['a', 'b', ''] }))).toBeNull()
    expect(missingPart(sequence({ title: '', steps: [] , image: png }))).toBe('title')
  })

  it('tidies texts and steps, and keeps the same object when nothing changes', () => {
    const tidy = sequence()
    expect(tidyCard(tidy)).toBe(tidy)
    expect(tidyCard(sequence({ title: ' T ', steps: [' a', '', 'b '] }))).toEqual(sequence({ explanation: undefined }))
  })
})

describe('unfinished message for the new types', () => {
  const half = (c: Card) => c
  it('names the missing part', () => {
    expect(unfinishedMessage([half(choice({ question: '' , explanation: 'x' }))])?.text).toBe('Card #1 needs a question.')
    expect(unfinishedMessage([half(choice({ right: [] }))])?.text).toBe('"Q" needs a correct answer.')
    expect(unfinishedMessage([half(choice({ wrong: [] }))])?.text).toBe('"Q" needs a wrong answer.')
    expect(unfinishedMessage([half(sequence({ title: '' }))])?.text).toBe('Card #1 needs a title.')
    expect(unfinishedMessage([half(sequence({ steps: ['a'] }))])?.text).toBe('"T" needs two steps.')
  })

  it('lists the parts of several cards', () => {
    expect(unfinishedMessage([choice({ right: [] }), sequence({ steps: ['a'] })])?.text).toBe('2 cards need a correct answer or two steps.')
    expect(unfinishedMessage([sequence({ steps: ['a'] }), sequence({ steps: [] , title: 'T' })])?.text).toBe('2 cards need two steps.')
    expect(unfinishedMessage([choice({ wrong: [] }), choice({ question: '', explanation: 'x' })])?.text).toBe(
      '2 cards need a question or wrong answer.',
    )
  })

  it('drops blank cards and tidies the rest on Done', () => {
    const blank = choice({ question: '', right: [''], wrong: [''] })
    const result = tidyCards([blank, sequence({ steps: ['a', '', 'b'] })], [])
    expect(result.cards).toEqual([sequence({ explanation: undefined })])
    expect(result.changed).toBe(true)
  })
})
