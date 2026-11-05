import { describe, expect, it } from 'vitest'
import { blankDepth, clozeQuestion, markBlank, parseCloze, readCloze, shiftBlanks, writeCloze, type Blank } from './cloze'

const blank = (start: number, end: number, explanation: string | null = null): Blank => ({ start, end, explanation })
const nested = 'The {mitochondria} is the {powerhouse of the {cell}}.'

describe('cloze', () => {
  it('parses a simple blank', () => {
    expect(parseCloze('a {b} c')).toEqual({ text: 'a b c', ranges: [{ start: 2, end: 3 }] })
  })

  it('parses nested blanks in { order', () => {
    const { text, ranges } = parseCloze(nested)
    expect(text).toBe('The mitochondria is the powerhouse of the cell.')
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(['mitochondria', 'powerhouse of the cell', 'cell'])
  })

  it('parses adjacent blanks', () => {
    expect(parseCloze('{a}{b}')).toEqual({ text: 'ab', ranges: [{ start: 0, end: 1 }, { start: 1, end: 2 }] })
  })

  it('handles escapes', () => {
    const { text, ranges } = parseCloze('\\{1, 2\\} is a {set}')
    expect(text).toBe('{1, 2} is a set')
    expect(ranges).toEqual([{ start: 12, end: 15 }])
    expect(parseCloze('a\\\\b').text).toBe('a\\b')
    expect(parseCloze('\\frac {x}').text).toBe('\\frac x')
    expect(parseCloze('{x} end\\').text).toBe('x end\\')
  })

  it('rejects bad statements', () => {
    expect(() => parseCloze('a {b')).toThrow('"statement" has a { with no matching }.')
    expect(() => parseCloze('a b}')).toThrow('"statement" has a } with no matching {.')
    expect(() => parseCloze('a { } b')).toThrow('"statement" has an empty blank.')
    expect(() => parseCloze('a {} b')).toThrow('"statement" has an empty blank.')
    expect(() => parseCloze('{{cell}}')).toThrow('"statement" marks the same text twice.')
  })

  it('round trips nested blanks with explanations', () => {
    const first = readCloze(nested, ['one', 'two', 'three'])
    const { statement, explanation } = writeCloze(first.text, first.blanks)
    expect(statement).toBe(nested)
    expect(readCloze(statement, explanation)).toEqual(first)
  })

  it('round trips adjacent blanks', () => {
    const first = readCloze('{a}{b}', ['x', 'y'])
    const { statement, explanation } = writeCloze(first.text, first.blanks)
    expect(statement).toBe('{a}{b}')
    expect(readCloze(statement, explanation)).toEqual(first)
  })

  it('round trips braces and backslashes', () => {
    const text = 'a { b } \\ \\frac c'
    const blanks = [blank(2, 7, 'e'), blank(4, 5)]
    const { statement, explanation } = writeCloze(text, blanks)
    expect(readCloze(statement, explanation)).toEqual({ text, blanks })
  })

  it('markBlank trims spaces', () => {
    expect(markBlank('a bc d', [], 1, 5)).toEqual([blank(2, 4)])
  })

  it('markBlank allows nesting and adjacency', () => {
    const text = 'one two three'
    expect(markBlank(text, [blank(0, 7)], 4, 7)).toEqual([blank(0, 7), blank(4, 7)])
    expect(markBlank(text, [blank(4, 7)], 0, 13)).toEqual([blank(0, 13), blank(4, 7)])
    expect(markBlank('onetwo', [blank(0, 3)], 3, 6)).toEqual([blank(0, 3), blank(3, 6)])
  })

  it('markBlank rejects crossing, duplicates and empty', () => {
    expect(markBlank('one two three', [blank(0, 7)], 4, 13)).toBe("Blanks can sit inside each other but can't cross.")
    expect(markBlank('one two', [blank(0, 3)], 0, 3)).toBe('That text is already a blank.')
    expect(markBlank('one  two', [], 3, 5)).toBe('Select some text first.')
  })

  it('markBlank inserts in order and keeps explanations', () => {
    const result = markBlank('aa bb cc', [blank(0, 2, 'x'), blank(6, 8, 'y')], 3, 5)
    expect(result).toEqual([blank(0, 2, 'x'), blank(3, 5), blank(6, 8, 'y')])
  })

  it('shiftBlanks shifts for insert before', () => {
    expect(shiftBlanks('ab cd', 'XXab cd', [blank(3, 5, 'e')])).toEqual([blank(5, 7, 'e')])
  })

  it('shiftBlanks grows for insert inside', () => {
    expect(shiftBlanks('ab cd', 'ab cXXd', [blank(3, 5, 'e')])).toEqual([blank(3, 7, 'e')])
  })

  it('shiftBlanks keeps typing at the edges outside', () => {
    expect(shiftBlanks('ab cd', 'abXX cd', [blank(3, 5)])).toEqual([blank(5, 7)])
    expect(shiftBlanks('ab cd', 'ab cdXX', [blank(3, 5)])).toEqual([blank(3, 5)])
    expect(shiftBlanks('ab cd', 'ab XXcd', [blank(3, 5)])).toEqual([blank(5, 7)])
  })

  it('shiftBlanks drops a deleted blank', () => {
    expect(shiftBlanks('ab cd ef', 'ab  ef', [blank(3, 5, 'gone'), blank(6, 8, 'kept')])).toEqual([blank(4, 6, 'kept')])
  })

  it('shiftBlanks shrinks when an edge is replaced', () => {
    expect(shiftBlanks('abcdef', 'abXef', [blank(2, 5)])).toEqual([blank(2, 4)])
    expect(shiftBlanks('abcdef', 'aXef', [blank(2, 5)])).toEqual([blank(2, 3)])
  })

  it('shiftBlanks merges blanks that become equal', () => {
    const result = shiftBlanks('ab cd ef', 'ab cd', [blank(0, 8, 'outer'), blank(0, 5, 'inner')])
    expect(result).toEqual([blank(0, 5, 'outer')])
    expect(shiftBlanks('ab cd ef', 'ab cd', [blank(0, 8), blank(0, 5, 'inner')])).toEqual([blank(0, 5, 'inner')])
  })

  it('shiftBlanks drops blanks left with only whitespace', () => {
    expect(shiftBlanks('ab cd', 'ab  ', [blank(3, 5, 'e')])).toEqual([])
  })

  it('blankDepth counts containing ranges', () => {
    expect(blankDepth(parseCloze(nested).ranges)).toEqual([0, 0, 1])
  })

  it('clozeQuestion builds prompt and answer', () => {
    const { text, ranges } = parseCloze(nested)
    expect(clozeQuestion(text, ranges, 0)).toEqual({ prompt: 'The _____ is the powerhouse of the cell.', answer: 'mitochondria' })
    expect(clozeQuestion(text, ranges, 2)).toEqual({ prompt: 'The mitochondria is the powerhouse of the _____.', answer: 'cell' })
  })
})
