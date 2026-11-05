import { describe, expect, it } from 'vitest'
import { mixedUpWith } from './mixUp'

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
