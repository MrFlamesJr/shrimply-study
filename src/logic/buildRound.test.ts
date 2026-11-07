import { describe, expect, it } from 'vitest'
import type { Card, ChoiceCard, SequenceCard, StudyOptions, TrueFalseCard } from '../model'
import { buildRound, canChoose, refreshQuestions, usableCards } from './buildRound'

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

  it('never offers answers that read the same as the right one, or as each other', () => {
    const list: Card[] = ['cell', 'Cell', 'cell.', 'nucleus', 'ribosome'].map((definition, i) => ({
      id: `k${i}`,
      term: `t${i}`,
      definition,
    }))
    for (let run = 0; run < 30; run++) {
      const q = buildRound(list, options({ format: 'choice' })).find((x) => x.cardId === 'k0')!
      expect(q.choices).not.toContain('Cell')
      expect(q.choices).not.toContain('cell.')
      const normalized = q.choices!.map((c) => c.toLowerCase().replace(/\./g, ''))
      expect(new Set(normalized).size).toBe(normalized.length)
    }
  })
})

describe('buildRound with true-or-false cards', () => {
  const tf = (id: string, statement: string, answer: boolean): TrueFalseCard => ({ id, type: 'true-false', statement, answer })
  const sky = tf('s', ' The sky is green. ', false)
  const grass = tf('g', 'Grass is green.', true)

  it('skips a card without a statement', () => {
    expect(usableCards([tf('e', ' ', true), sky])).toEqual([sky])
  })

  it('asks each card once in every format, True first and never shuffled', () => {
    for (const format of ['flashcards', 'choice', 'typing'] as const) {
      const round = buildRound([sky, grass, card(1)], options({ format }))
      expect(round.slice(0, 2)).toEqual([
        { cardId: 's', prompt: 'The sky is green.', answer: 'False', choices: ['True', 'False'] },
        { cardId: 'g', prompt: 'Grass is green.', answer: 'True', choices: ['True', 'False'] },
      ])
      expect(round[2].choices === undefined).toBe(format !== 'choice')
    }
  })

  it('gives its answers to no other card', () => {
    const round = buildRound([sky, grass, card(1), card(2)], options({ format: 'choice' }))
    for (const q of round.filter((q) => q.cardId.startsWith('c'))) {
      expect(q.choices).not.toContain('True')
      expect(q.choices).not.toContain('False')
    }
  })

  it('refreshes the prompt and answer after an edit', () => {
    const round = buildRound([sky], options())
    expect(refreshQuestions(round, { ...sky, statement: 'Water is wet.', answer: true })).toEqual([
      { cardId: 's', prompt: 'Water is wet.', answer: 'True', choices: ['True', 'False'] },
    ])
  })
})

const sorted = (a?: string[]) => [...(a ?? [])].sort()

describe('buildRound with choice questions', () => {
  const one: ChoiceCard = { id: 'q1', type: 'choice', question: ' Which is a fruit? ', right: ['Apple'], wrong: ['Rock', ' Chair ', ''] }
  const many: ChoiceCard = { id: 'q2', type: 'choice', question: 'Which are organelles?', right: ['Nucleus', 'Ribosome'], wrong: ['Cell wall', 'Sap'] }

  it('is usable with a question, a right answer and a wrong answer', () => {
    expect(usableCards([one, many])).toHaveLength(2)
    expect(usableCards([{ ...one, question: ' ' }, { ...one, right: [' '] }, { ...one, wrong: [''] }])).toHaveLength(0)
  })

  it('flashcards: the answer, or the list of answers', () => {
    expect(buildRound([one], options())).toEqual([{ cardId: 'q1', prompt: 'Which is a fruit?', answer: 'Apple' }])
    expect(buildRound([many], options())).toEqual([
      { cardId: 'q2', prompt: 'Which are organelles?', answer: 'Nucleus, Ribosome', answers: ['Nucleus', 'Ribosome'] },
    ])
  })

  it('multiple choice: every own answer, one right or several', () => {
    const [a] = buildRound([one], options({ format: 'choice' }))
    expect(a.answer).toBe('Apple')
    expect(a.answers).toBeUndefined()
    expect(sorted(a.choices)).toEqual(['Apple', 'Chair', 'Rock'])
    const [b] = buildRound([many], options({ format: 'choice' }))
    expect(b.answer).toBe('Nucleus, Ribosome')
    expect(b.answers).toEqual(['Nucleus', 'Ribosome'])
    expect(sorted(b.choices)).toEqual(['Cell wall', 'Nucleus', 'Ribosome', 'Sap'])
  })

  it('counts an answer typed twice once', () => {
    const twice: ChoiceCard = { ...one, right: ['Apple', ' Apple'], wrong: ['Rock', 'Rock', 'Apple'] }
    const [q] = buildRound([twice], options({ format: 'choice' }))
    expect(q.answers).toBeUndefined()
    expect(sorted(q.choices)).toEqual(['Apple', 'Rock'])
  })

  it('typing: type one right answer, pick when there are several', () => {
    const [a] = buildRound([one], options({ format: 'typing' }))
    expect(a).toEqual({ cardId: 'q1', prompt: 'Which is a fruit?', answer: 'Apple' })
    const [b] = buildRound([many], options({ format: 'typing' }))
    expect(b.answers).toEqual(['Nucleus', 'Ribosome'])
    expect(sorted(b.choices)).toEqual(['Cell wall', 'Nucleus', 'Ribosome', 'Sap'])
  })

  it('never takes wrong answers from other cards or gives its own away', () => {
    const others: Card[] = [card(1), card(2), card(3), card(4), { id: 'z', type: 'true-false', statement: 'S', answer: true }]
    const round = buildRound([...others, one], options({ format: 'choice' }))
    expect(sorted(round.find((q) => q.cardId === 'q1')?.choices)).toEqual(['Apple', 'Chair', 'Rock'])
    for (const q of round.filter((q) => q.cardId.startsWith('c'))) {
      expect(q.choices).not.toContain('Apple')
      expect(q.choices).not.toContain('Rock')
    }
  })

  it('ignores the question side', () => {
    for (const side of ['term', 'definition', 'mixed'] as const) {
      expect(buildRound([one], options({ side }))[0].prompt).toBe('Which is a fruit?')
    }
  })

  it('refreshes the text and options after an edit', () => {
    const [q] = buildRound([many], options({ format: 'choice' }))
    const edited: ChoiceCard = { ...many, question: 'New?', right: ['Nucleus', 'Golgi'], wrong: ['Sap'] }
    const [fresh] = refreshQuestions([q], edited)
    expect(fresh).toMatchObject({ prompt: 'New?', answer: 'Nucleus, Golgi', answers: ['Nucleus', 'Golgi'] })
    expect(sorted(fresh.choices)).toEqual(['Golgi', 'Nucleus', 'Sap'])
    const [typed] = buildRound([one], options({ format: 'typing' }))
    expect(refreshQuestions([typed], { ...one, right: ['Pear'] })[0]).toEqual({ cardId: 'q1', prompt: 'Which is a fruit?', answer: 'Pear' })
  })
})

describe('buildRound with sequences', () => {
  const steps = ['Prophase', ' Metaphase ', 'Anaphase', 'Telophase', '']
  const seq: SequenceCard = { id: 's1', type: 'sequence', title: ' Phases of mitosis ', steps }
  const ordered = ['Prophase', 'Metaphase', 'Anaphase', 'Telophase']
  const text = '1. Prophase 2. Metaphase 3. Anaphase 4. Telophase'

  it('is usable with a title and two steps', () => {
    expect(usableCards([seq])).toHaveLength(1)
    expect(usableCards([{ ...seq, title: ' ' }, { ...seq, steps: ['a', ' '] }])).toHaveLength(0)
  })

  it('flashcards: one question with the steps in order', () => {
    expect(buildRound([seq], options())).toEqual([{ cardId: 's1', prompt: 'Phases of mitosis', answer: text, answers: ordered }])
  })

  it('multiple choice: the steps to arrange, shuffled and never in order', () => {
    for (let i = 0; i < 50; i++) {
      const [q] = buildRound([{ ...seq, steps: ['a', 'b'] }], options({ format: 'choice' }))
      expect(q.arrange).toBe(true)
      expect(q.answers).toEqual(['a', 'b'])
      expect(q.choices).toEqual(['b', 'a'])
    }
    const [q] = buildRound([seq], options({ format: 'choice' }))
    expect(q).toMatchObject({ arrange: true, answer: text, answers: ordered })
    expect(sorted(q.choices)).toEqual([...ordered].sort())
    expect(q.choices).not.toEqual(ordered)
  })

  it('typing: one question per step', () => {
    expect(buildRound([seq], options({ format: 'typing' }))).toEqual([
      { cardId: 's1', prompt: 'What comes first?', answer: 'Prophase', step: 0 },
      { cardId: 's1', prompt: 'What comes after “Prophase”?', answer: 'Metaphase', step: 1 },
      { cardId: 's1', prompt: 'What comes after “Metaphase”?', answer: 'Anaphase', step: 2 },
      { cardId: 's1', prompt: 'What comes after “Anaphase”?', answer: 'Telophase', step: 3 },
    ])
  })

  it('never takes wrong answers from other cards or gives its own away', () => {
    const round = buildRound([...cards(4), seq], options({ format: 'choice' }))
    expect(round.filter((q) => q.cardId === 's1')[0].choices).toHaveLength(4)
    for (const q of round.filter((q) => q.cardId.startsWith('c'))) expect(q.choices?.some((c) => ordered.includes(c))).toBe(false)
  })

  it('ignores the question side', () => {
    for (const side of ['term', 'definition', 'mixed'] as const) {
      expect(buildRound([seq], options({ side }))[0].prompt).toBe('Phases of mitosis')
    }
  })

  it('refreshes after an edit, leaving a step that no longer exists', () => {
    const edited: SequenceCard = { ...seq, title: 'Mitosis', steps: ['Prophase', 'Anaphase', 'Telophase'] }
    const [flash] = buildRound([seq], options())
    expect(refreshQuestions([flash], edited)[0]).toEqual({
      cardId: 's1',
      prompt: 'Mitosis',
      answer: '1. Prophase 2. Anaphase 3. Telophase',
      answers: ['Prophase', 'Anaphase', 'Telophase'],
    })
    const [arrange] = buildRound([seq], options({ format: 'choice' }))
    const fresh = refreshQuestions([arrange], edited)[0]
    expect(fresh).toMatchObject({ arrange: true, answers: ['Prophase', 'Anaphase', 'Telophase'] })
    expect(sorted(fresh.choices)).toEqual(['Anaphase', 'Prophase', 'Telophase'])
    const typed = buildRound([seq], options({ format: 'typing' }))
    const after = refreshQuestions(typed, edited)
    expect(after.map((q) => q.answer)).toEqual(['Prophase', 'Anaphase', 'Telophase', 'Telophase'])
    expect(after[2].prompt).toBe('What comes after “Anaphase”?')
    expect(after[3]).toBe(typed[3])
  })
})

describe('canChoose', () => {
  const term = (id: string): Card => ({ id, term: 't' + id, definition: 'd' + id })
  it('needs two cards, or one that brings its own options', () => {
    expect(canChoose([])).toBe(false)
    expect(canChoose([term('a')])).toBe(false)
    expect(canChoose([term('a'), term('b')])).toBe(true)
    expect(canChoose([{ id: 't', type: 'true-false', statement: 's', answer: true }])).toBe(true)
    expect(canChoose([{ id: 'c', type: 'choice', question: 'q', right: ['r'], wrong: ['w'] }])).toBe(true)
    expect(canChoose([{ id: 's', type: 'sequence', title: 't', steps: ['a', 'b'] }])).toBe(true)
  })
})
