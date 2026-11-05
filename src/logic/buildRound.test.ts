import { describe, expect, it } from 'vitest'
import type { Card, StudyOptions } from '../model'
import { buildRound, refreshQuestions, usableCards } from './buildRound'

const card = (n: number): Card => ({ id: `c${n}`, term: `term${n}`, definition: `def${n}` })
const cards = (count: number): Card[] => Array.from({ length: count }, (_, i) => card(i + 1))
const options = (o: Partial<StudyOptions> = {}): StudyOptions => ({
  side: 'term',
  format: 'flashcards',
  shuffle: false,
  ...o,
})

describe('buildRound', () => {
  it('drops unusable cards', () => {
    const list = [card(1), { id: 'x', term: ' ', definition: 'd' }, { id: 'y', term: 't', definition: '' }]
    expect(usableCards(list)).toEqual([card(1)])
    expect(buildRound(list, options())).toHaveLength(1)
  })

  it('uses the term as prompt for side term', () => {
    expect(buildRound([card(1)], options())[0]).toEqual({ cardId: 'c1', prompt: 'term1', answer: 'def1', side: 'term' })
  })

  it('uses the definition as prompt for side definition', () => {
    expect(buildRound([card(1)], options({ side: 'definition' }))[0]).toEqual({
      cardId: 'c1',
      prompt: 'def1',
      answer: 'term1',
      side: 'definition',
    })
  })

  it('gives each mixed question one of the two directions', () => {
    for (const q of buildRound(cards(20), options({ side: 'mixed' }))) {
      const n = q.cardId.slice(1)
      expect([`term${n}|def${n}`, `def${n}|term${n}`]).toContain(`${q.prompt}|${q.answer}`)
    }
  })

  it('builds unique choices that include the answer', () => {
    for (const q of buildRound(cards(10), options({ format: 'choice' }))) {
      expect(q.choices).toHaveLength(4)
      expect(new Set(q.choices).size).toBe(4)
      expect(q.choices).toContain(q.answer)
    }
  })

  it('limits choices to the usable pool size', () => {
    for (const q of buildRound(cards(3), options({ format: 'choice' }))) expect(q.choices).toHaveLength(3)
  })

  it('takes distractors from the pool', () => {
    const [q] = buildRound([card(1)], options({ format: 'choice' }), cards(5))
    expect(q.choices).toHaveLength(4)
    expect(q.choices).toContain('def1')
  })

  it('sets no choices for other formats', () => {
    expect(buildRound(cards(3), options({ format: 'typing' }))[0].choices).toBeUndefined()
  })

  describe('groups', () => {
    const choice = options({ format: 'choice' })
    const grouped = (count: number, inGroup: number): Card[] =>
      cards(count).map((c, i) => (i < inGroup ? { ...c, group: 'g' } : c))

    it('takes wrong answers only from a group of 4', () => {
      const list = grouped(10, 4)
      for (let n = 0; n < 20; n++) {
        const q = buildRound(list, choice).find((q) => q.cardId === 'c1')!
        expect(q.choices!.sort()).toEqual(['def1', 'def2', 'def3', 'def4'])
      }
    })

    it('fills the spots a small group leaves from other cards', () => {
      const q = buildRound(grouped(10, 2), choice).find((q) => q.cardId === 'c1')!
      expect(q.choices).toHaveLength(4)
      expect(new Set(q.choices).size).toBe(4)
      expect(q.choices).toContain('def2')
    })

    it('still gives ungrouped cards 4 unique choices', () => {
      const q = buildRound(grouped(10, 4), choice).find((q) => q.cardId === 'c9')!
      expect(new Set(q.choices).size).toBe(4)
    })
  })
})

describe('buildRound with fill-in-the-blank cards', () => {
  const cloze = (id: string, statement: string): Card => ({ id, type: 'cloze', statement, explanation: [] })
  const cell = cloze('z', 'The {mitochondria} is the {powerhouse of the {cell}}.')

  it('skips a statement without blanks', () => {
    expect(usableCards([cloze('y', 'No blanks'), cell])).toEqual([cell])
  })

  it('asks each blank once with only that blank hidden', () => {
    expect(buildRound([cell], options({ side: 'definition' }))).toEqual([
      { cardId: 'z', blank: 0, prompt: 'The _____ is the powerhouse of the cell.', answer: 'mitochondria' },
      { cardId: 'z', blank: 1, prompt: 'The mitochondria is the _____.', answer: 'powerhouse of the cell' },
      { cardId: 'z', blank: 2, prompt: 'The mitochondria is the powerhouse of the _____.', answer: 'cell' },
    ])
  })

  it('takes choices for a blank from other blanks only', () => {
    const round = buildRound([cell, cloze('w', 'Water boils at {100 C}.'), card(1)], options({ format: 'choice' }))
    const q = round.find((q) => q.cardId === 'w')!
    expect(q.choices).toHaveLength(4)
    expect(q.choices).toContain('100 C')
    expect(q.choices).not.toContain('def1')
    const t = round.find((q) => q.cardId === 'c1')!
    expect(t.choices).toEqual(['def1'])
  })
})

describe('question side', () => {
  it('matches the prompt', () => {
    expect(buildRound(cards(2), options({ side: 'term' })).map((q) => q.side)).toEqual(['term', 'term'])
    const defs = buildRound(cards(2), options({ side: 'definition' }))
    expect(defs.map((q) => q.side)).toEqual(['definition', 'definition'])
    for (const q of buildRound(cards(30), options({ side: 'mixed' }))) {
      expect(q.prompt).toBe(q.side === 'term' ? `term${q.cardId.slice(1)}` : `def${q.cardId.slice(1)}`)
    }
  })
})

describe('refreshQuestions', () => {
  const edited: Card = { id: 'c1', term: ' new term ', definition: 'new def' }

  it('updates a question prompted from the term', () => {
    const [q] = refreshQuestions(buildRound(cards(1), options({ side: 'term' })), edited)
    expect(q).toMatchObject({ prompt: 'new term', answer: 'new def', side: 'term' })
  })

  it('updates a question prompted from the definition', () => {
    const [q] = refreshQuestions(buildRound(cards(1), options({ side: 'definition' })), edited)
    expect(q).toMatchObject({ prompt: 'new def', answer: 'new term', side: 'definition' })
  })

  it('leaves other cards alone', () => {
    const round = buildRound(cards(2), options())
    expect(refreshQuestions(round, edited)[1]).toBe(round[1])
  })

  it('swaps the old answer in the choices', () => {
    const round = buildRound(cards(3), options({ format: 'choice' }))
    const [q] = refreshQuestions(round, edited)
    expect(q.choices).toContain('new def')
    expect(q.choices).not.toContain('def1')
    expect(q.choices).toHaveLength(round[0].choices!.length)
  })

  it('follows the prompt side when the term equals the definition', () => {
    const same: Card = { id: 'c1', term: 'x', definition: 'x' }
    const round = buildRound([same], options({ side: 'definition' }))
    const [q] = refreshQuestions(round, { ...same, term: 'a', definition: 'b' })
    expect(q).toMatchObject({ prompt: 'b', answer: 'a', side: 'definition' })
  })

  it('updates a fill-in-the-blank question', () => {
    const cloze: Card = { id: 'z', type: 'cloze', statement: 'The {cat} sat', explanation: [null] }
    const round = buildRound([cloze], options())
    const [q] = refreshQuestions(round, { ...cloze, statement: 'The {dog} sat' })
    expect(q.answer).toBe('dog')
    expect(q.blank).toBe(0)
  })

  it('leaves a question whose blank was removed', () => {
    const cloze: Card = { id: 'z', type: 'cloze', statement: 'A {b} and {c}', explanation: [null, null] }
    const round = buildRound([cloze], options())
    const out = refreshQuestions(round, { ...cloze, statement: 'A {b} and c' })
    expect(out[0]).not.toBe(round[0])
    expect(out[1]).toBe(round[1])
  })
})
