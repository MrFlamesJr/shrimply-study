import { describe, expect, it } from 'vitest'
import type { Card, Group, Library } from '../model'
import { usableCards } from './buildRound'
import { fakeQuiz, libraryProblems, libraryStats } from './debugData'
import { inGroupOrder } from './groups'

const IMG = 'data:image/png;base64,AAAAAAAA' // 8 base64 chars = 6 bytes
const term = (id: string, extra: Partial<Card> = {}): Card => ({ id, term: 't', definition: 'd', ...extra }) as Card
const group: Group = { id: 'g1', name: 'G', color: 'lagoon' }

const library = (cards: Card[], groups: Group[] = [], names = ['C', 'Q']): Library => ({
  version: 1,
  courses: [{ id: 'c1', name: names[0], quizzes: [{ id: 'q1', name: names[1], groups, cards }] }],
})

describe('libraryStats', () => {
  it('counts the library', () => {
    const cards: Card[] = [
      term('a', { termImage: IMG, definitionImage: IMG, explanation: 'why' }),
      term('b', { termImage: IMG, group: 'g1', explanation: ' ' }),
      term('c', { definition: '' }),
      { id: 'd', type: 'cloze', statement: '{one} and {two}', explanation: ['first', null], image: 'data:image/png;base64,AAAA' },
      { id: 'e', type: 'true-false', statement: 'Sky', answer: true, explanation: 'blue' },
      { id: 'f', type: 'choice', question: 'Which?', image: IMG, right: ['A'], wrong: ['B', 'C'], explanation: 'why' },
      { id: 'g', type: 'sequence', title: 'Order', image: IMG, steps: ['one'] },
    ]
    expect(libraryStats(library(cards, [group]))).toEqual({
      courses: 1,
      quizzes: 1,
      termCards: 3,
      clozeCards: 1,
      trueFalseCards: 1,
      choiceCards: 1,
      sequenceCards: 1,
      blanks: 2,
      groups: 1,
      groupedCards: 1,
      explanations: 4,
      incomplete: 2,
      emptyCourses: 0,
      emptyQuizzes: 0,
      unstudyable: 0,
      noChoice: 0,
      largestQuiz: { name: 'Q', cards: 7 },
      longestText: 15,
      images: 2,
      imageBytes: 9,
      largestImage: 6,
    })
  })
  it('counts empty courses and quizzes, and quizzes with too few cards to study', () => {
    const lib: Library = {
      version: 1,
      courses: [
        { id: 'c1', name: 'Empty', quizzes: [] },
        {
          id: 'c2',
          name: 'C',
          quizzes: [
            { id: 'q1', name: 'No cards', groups: [], cards: [] },
            { id: 'q2', name: 'Half', groups: [], cards: [term('a', { definition: '' })] },
            { id: 'q3', name: 'One', groups: [], cards: [term('b')] },
          ],
        },
      ],
    }
    const stats = libraryStats(lib)
    expect([stats.emptyCourses, stats.emptyQuizzes, stats.unstudyable, stats.noChoice]).toEqual([1, 1, 2, 1])
    expect(libraryStats({ version: 1, courses: [] })).toMatchObject({ largestQuiz: undefined, longestText: 0, largestImage: 0 })
  })
})

describe('libraryProblems', () => {
  it('finds none in a clean library', () => {
    expect(libraryProblems(library([term('a'), term('b', { group: 'g1' })], [group]))).toEqual([])
  })
  it('finds an id used twice', () => {
    expect(libraryProblems(library([term('a'), term('a')]))).toHaveLength(1)
  })
  it('finds a card in a missing group', () => {
    expect(libraryProblems(library([term('a', { group: 'nope' })]))[0]).toContain('C > Q: card 1')
  })
  it('finds cards out of group order', () => {
    const problems = libraryProblems(library([term('a', { group: 'g1' }), term('b')], [group]))
    expect(problems).toEqual(['C > Q: the cards are not in group order.'])
  })
  it('finds empty names', () => {
    const problems = libraryProblems(library([], [{ ...group, name: ' ' }], ['', ' ']))
    expect(problems).toHaveLength(3)
  })
})

describe('fakeQuiz', () => {
  const { cards, groups } = fakeQuiz(100)
  it('makes usable cards', () => {
    expect(cards).toHaveLength(100)
    expect(usableCards(cards)).toHaveLength(100)
    expect(groups.map((g) => g.name)).toEqual(['Group 1', 'Group 2', 'Group 3', 'Group 4'])
  })
  it('makes every 7th card a true-or-false card, alternating true and false (7 each in 100)', () => {
    const answers = cards.filter((c) => c.type === 'true-false').map((c) => (c.type === 'true-false' ? c.answer : null))
    expect(answers).toHaveLength(14)
    expect(answers.filter(Boolean)).toHaveLength(7)
  })
  it('is a clean library in group order', () => {
    expect(libraryProblems(library(cards, groups))).toEqual([])
    expect(inGroupOrder(cards, groups)).toEqual(cards)
  })
})

describe('fakeQuiz with choice questions and sequences', () => {
  const { cards } = fakeQuiz(100)
  it('mixes in both, one and several right answers', () => {
    const choices = cards.filter((c) => c.type === 'choice')
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.some((c) => c.type === 'choice' && c.right.length > 1)).toBe(true)
    expect(choices.some((c) => c.type === 'choice' && c.right.length === 1)).toBe(true)
    expect(cards.filter((c) => c.type === 'sequence').length).toBeGreaterThan(0)
  })
})
