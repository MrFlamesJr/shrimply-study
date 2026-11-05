import { describe, expect, it } from 'vitest'
import { mixedUpBlank, mixedUpWith } from './mixUp'

const cards = [
  { id: '1', term: 'cat', definition: 'chat' },
  { id: '2', term: 'dog', definition: 'Chien!' },
]

describe('mixedUpWith', () => {
  it('finds the card whose definition matches', () => {
    expect(mixedUpWith('chien', 'definition', '1', cards)?.id).toBe('2')
  })

  it('ignores the asked card itself', () => {
    expect(mixedUpWith('chat', 'definition', '1', cards)).toBeUndefined()
  })

  it('is undefined for blank input or no match', () => {
    expect(mixedUpWith('  ', 'definition', '1', cards)).toBeUndefined()
    expect(mixedUpWith('cheval', 'definition', '1', cards)).toBeUndefined()
  })

  it('matches terms too, ignoring case and punctuation', () => {
    expect(mixedUpWith('DOG.', 'term', '1', cards)?.id).toBe('2')
  })
})

const blanks = [
  { id: 'a', type: 'cloze' as const, statement: 'The {nucleus} holds the {DNA}.', explanation: [] },
  { id: 'b', type: 'cloze' as const, statement: '{Ribosomes} make {proteins} from {DNA}.', explanation: [] },
  { id: 'c', type: 'cloze' as const, statement: 'No blanks here.', explanation: [] },
  ...cards,
]

describe('mixedUpBlank', () => {
  it('finds another blank of the same card first', () => {
    expect(mixedUpBlank('dna', 'a', 0, blanks)).toEqual({ card: blanks[0], blank: 1 })
  })

  it('then a blank of another card', () => {
    expect(mixedUpBlank('Proteins', 'a', 1, blanks)).toEqual({ card: blanks[1], blank: 1 })
  })

  it('ignores the asked blank itself, term cards and no match', () => {
    expect(mixedUpBlank('nucleus', 'a', 0, blanks)).toBeUndefined()
    expect(mixedUpBlank('cat', 'a', 0, blanks)).toBeUndefined()
    expect(mixedUpBlank(' ', 'a', 0, blanks)).toBeUndefined()
  })
})
