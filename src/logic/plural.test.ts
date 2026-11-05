import { describe, expect, it } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('uses the singular for 1', () => expect(plural(1, 'card')).toBe('1 card'))
  it('adds s by default', () => expect(plural(0, 'card')).toBe('0 cards'))
  it('accepts an irregular plural', () => expect(plural(3, 'quiz', 'quizzes')).toBe('3 quizzes'))
})
