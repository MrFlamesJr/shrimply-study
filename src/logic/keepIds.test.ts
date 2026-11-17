import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, type Card, type Library, type TermCard } from '../model'
import { keepIds } from './keepIds'

const term = (id: string, group?: string): TermCard => ({ id, term: `t${id}`, definition: 'd', ...(group && { group }) })
const cloze = (id: string): Card => ({ id, type: 'cloze', statement: '{x}', explanation: [null] })

const old: Library = {
  version: FORMAT_VERSION,
  courses: [
    {
      id: 'c1',
      name: 'Biology',
      quizzes: [
        { id: 'q1', name: 'Cells', groups: [{ id: 'g1', name: 'Parts', color: 'coral' }], cards: [term('k1', 'g1'), term('k2'), cloze('k3')] },
        { id: 'q2', name: 'Plants', groups: [], cards: [] },
      ],
    },
  ],
}

describe('keepIds', () => {
  it('carries course, quiz, group and card ids over, and points cards at the kept group', () => {
    const next: Library = {
      version: FORMAT_VERSION,
      courses: [
        {
          id: 'n1',
          name: 'biology',
          quizzes: [
            {
              id: 'n2',
              name: 'Cells',
              groups: [{ id: 'n3', name: 'Parts', color: 'moss' }],
              // the third card changed kind: a new id
              cards: [term('n4', 'n3'), { ...term('n5'), term: 'edited' }, term('n6'), term('n7')],
            },
          ],
        },
        { id: 'n8', name: 'Chemistry', quizzes: [] },
      ],
    }
    const kept = keepIds(old, next)
    const quiz = kept.courses[0].quizzes[0]
    expect(kept.courses.map((c) => c.id)).toEqual(['c1', 'n8'])
    expect(kept.courses[0].name).toBe('biology')
    expect(quiz.id).toBe('q1')
    expect(quiz.groups).toEqual([{ id: 'g1', name: 'Parts', color: 'moss' }])
    expect(quiz.cards.map((c) => c.id)).toEqual(['k1', 'k2', 'n6', 'n7'])
    expect(quiz.cards[0].group).toBe('g1')
    expect(quiz.cards[1]).toMatchObject({ term: 'edited' })
    expect(quiz.cards[1].group).toBeUndefined()
  })

  it('a card keeps its id by content when cards were added or removed before it', () => {
    const same = (id: string, term: string): TermCard => ({ id, term, definition: 'd' })
    const before: Library = { version: FORMAT_VERSION, courses: [{ id: 'c1', name: 'Bio', quizzes: [{ id: 'q1', name: 'Q', groups: [], cards: [same('k1', 'a'), same('k2', 'b'), same('k3', 'c')] }] }] }
    const after: Library = {
      version: FORMAT_VERSION,
      courses: [{ id: 'n0', name: 'Bio', quizzes: [{ id: 'n1', name: 'Q', groups: [], cards: [same('n2', 'new'), same('n3', 'a'), same('n4', 'c'), same('n5', 'b')] }] }],
    }
    // a, c and b by content (moved, or one added above them); the new card at the top takes no id that is taken.
    expect(keepIds(before, after).courses[0].quizzes[0].cards.map((c) => c.id)).toEqual(['n2', 'k1', 'k3', 'k2'])
    const edited: Library = {
      version: FORMAT_VERSION,
      courses: [{ id: 'n0', name: 'Bio', quizzes: [{ id: 'n1', name: 'Q', groups: [], cards: [same('n2', 'a'), same('n3', 'B!'), same('n4', 'c')] }] }],
    }
    // An edited card keeps its id by its place.
    expect(keepIds(before, edited).courses[0].quizzes[0].cards.map((c) => c.id)).toEqual(['k1', 'k2', 'k3'])
  })

  it('a renamed course or quiz takes new ids', () => {
    const next: Library = { version: FORMAT_VERSION, courses: [{ id: 'n1', name: 'Botany', quizzes: [] }] }
    expect(keepIds(old, next).courses[0].id).toBe('n1')
  })
})
