import { describe, expect, it } from 'vitest'
import type { Card, StudyOptions } from '../model'
import { buildRound, usableCards } from './buildRound'

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
    expect(buildRound([card(1)], options())[0]).toEqual({ cardId: 'c1', prompt: 'term1', answer: 'def1' })
  })

  it('uses the definition as prompt for side definition', () => {
    expect(buildRound([card(1)], options({ side: 'definition' }))[0]).toEqual({
      cardId: 'c1',
      prompt: 'def1',
      answer: 'term1',
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
