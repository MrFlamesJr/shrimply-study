import { describe, expect, it } from 'vitest'
import { checkAnswer } from './checkAnswer'

describe('checkAnswer', () => {
  it('ignores case', () => expect(checkAnswer('PARIS', 'paris')).toBe(true))
  it('ignores accents', () => expect(checkAnswer('Café', 'cafe')).toBe(true))
  it('ignores punctuation', () => expect(checkAnswer('mother-in-law', 'mother in law')).toBe(true))
  it('ignores extra spaces', () => expect(checkAnswer('  new   york ', 'New York')).toBe(true))
  it('rejects empty input', () => expect(checkAnswer('  ', 'paris')).toBe(false))
  it('rejects a wrong answer', () => expect(checkAnswer('london', 'paris')).toBe(false))
  it('compares raw text for punctuation-only answers', () => {
    expect(checkAnswer('?', '?')).toBe(true)
    expect(checkAnswer('!', '?')).toBe(false)
    expect(checkAnswer(' ', '?')).toBe(false)
  })
})
