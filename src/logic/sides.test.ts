import { describe, expect, it } from 'vitest'
import { SIDE_PRESETS, type Card, type Library } from '../model'
import { addSideType, deleteSideType, isPreset, lastSides, renameSideType, samePair, sideNames, sidePairs, sideTypeUses, toSides } from './sides'

const term = (id: string, sides?: [string, string]): Card => ({ id, term: 't', definition: 'd', ...(sides && { sides }) })
const library = (cards: Card[]): Library => ({
  version: 2,
  courses: [{ id: 'c', name: 'c', quizzes: [{ id: 'q', name: 'q', groups: [], cards }] }],
})

describe('sideNames', () => {
  it('is Front and Back without sides', () => {
    expect(sideNames({})).toEqual({ term: 'Front', definition: 'Back' })
  })
  it('is the card\'s own names', () => {
    expect(sideNames({ sides: ['Question', 'Answer'] })).toEqual({ term: 'Question', definition: 'Answer' })
  })
})

describe('samePair', () => {
  it('compares both names', () => {
    expect(samePair(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(samePair(['a', 'b'], ['b', 'a'])).toBe(false)
  })
})

describe('toSides', () => {
  it('trims', () => {
    expect(toSides([' Question ', 'Answer '])).toEqual(['Question', 'Answer'])
  })
  it('gives undefined for the default pair', () => {
    expect(toSides(['Front', 'Back'])).toBeUndefined()
    expect(toSides([' Front', 'Back '])).toBeUndefined()
  })
})

describe('sidePairs', () => {
  it('is the presets, then the own types', () => {
    expect(sidePairs(library([term('1')]))).toEqual(SIDE_PRESETS)
    expect(sidePairs({ ...library([]), sideTypes: [['English', 'French']] })).toEqual([...SIDE_PRESETS, ['English', 'French']])
  })
  it('does not scan the cards', () => {
    expect(sidePairs(library([term('1', ['English', 'French'])]))).toEqual(SIDE_PRESETS)
  })
})

describe('isPreset', () => {
  it('knows the presets', () => {
    expect(isPreset(['Question', 'Answer'])).toBe(true)
    expect(isPreset(['English', 'French'])).toBe(false)
  })
})

describe('addSideType', () => {
  it('appends a new pair', () => {
    expect(addSideType([['a', 'b']], ['c', 'd'])).toEqual([['a', 'b'], ['c', 'd']])
  })
  it('returns the same array for a preset or a listed pair', () => {
    const types: [string, string][] = [['a', 'b']]
    expect(addSideType(types, ['Front', 'Back'])).toBe(types)
    expect(addSideType(types, ['a', 'b'])).toBe(types)
  })
})

describe('sideTypeUses', () => {
  it('counts the cards using a pair', () => {
    const lib = library([term('1', ['a', 'b']), term('2', ['a', 'b']), term('3', ['c', 'd']), term('4')])
    expect(sideTypeUses(lib, ['a', 'b'])).toBe(2)
    expect(sideTypeUses(lib, ['x', 'y'])).toBe(0)
  })
})

describe('renameSideType', () => {
  const lib = { ...library([term('1', ['a', 'b']), term('2', ['c', 'd'])]), sideTypes: [['a', 'b'], ['c', 'd']] as [string, string][] }
  const sidesOf = (l: Library) => l.courses[0].quizzes[0].cards.map((c) => (c as { sides?: unknown }).sides)
  it('renames in place, trimmed, and the cards follow', () => {
    const next = renameSideType(lib, ['a', 'b'], [' x ', 'y '])
    expect(next.sideTypes).toEqual([['x', 'y'], ['c', 'd']])
    expect(sidesOf(next)).toEqual([['x', 'y'], ['c', 'd']])
  })
  it('drops the type when the new pair is listed, so the cards share it', () => {
    const next = renameSideType(lib, ['a', 'b'], ['c', 'd'])
    expect(next.sideTypes).toEqual([['c', 'd']])
    expect(sidesOf(next)).toEqual([['c', 'd'], ['c', 'd']])
  })
  it('drops the type when the new pair is a preset, and the default leaves the cards without sides', () => {
    const next = renameSideType(lib, ['a', 'b'], ['Front', 'Back'])
    expect(next.sideTypes).toEqual([['c', 'd']])
    expect(sidesOf(next)).toEqual([undefined, ['c', 'd']])
    expect('sides' in next.courses[0].quizzes[0].cards[0]).toBe(false)
  })
})

describe('deleteSideType', () => {
  it('removes the type and its cards lose sides', () => {
    const lib = { ...library([term('1', ['a', 'b']), term('2', ['c', 'd'])]), sideTypes: [['a', 'b'], ['c', 'd']] as [string, string][] }
    const next = deleteSideType(lib, ['a', 'b'])
    expect(next.sideTypes).toEqual([['c', 'd']])
    expect('sides' in next.courses[0].quizzes[0].cards[0]).toBe(false)
    expect((next.courses[0].quizzes[0].cards[1] as { sides?: unknown }).sides).toEqual(['c', 'd'])
  })
})

describe('lastSides', () => {
  it('is the sides of the last term card', () => {
    const cloze: Card = { id: 'z', type: 'cloze', statement: '{a}', explanation: [null] }
    expect(lastSides([term('1', ['Question', 'Answer']), cloze])).toEqual(['Question', 'Answer'])
  })
  it('is undefined when that card has the default sides or there is none', () => {
    expect(lastSides([term('1', ['Question', 'Answer']), term('2')])).toBeUndefined()
    expect(lastSides([])).toBeUndefined()
  })
})
