import { describe, expect, it } from 'vitest'
import type { Card, Group, Quiz } from '../model'
import { cardsEdit } from './cardsEdit'

const card = (id: string, term = id, group?: string): Card => ({ id, term, definition: 'd', ...(group && { group }) })
const g1: Group = { id: 'g1', name: 'One', color: 'lagoon' }
const quiz: Quiz = { id: 'q', name: 'Q', groups: [g1], cards: [card('a'), card('b'), card('c', 'c', 'g1')] }

describe('cardsEdit', () => {
  it('is null when nothing changed, even in a new list', () => {
    expect(cardsEdit(quiz, [...quiz.cards], [...quiz.groups])).toBeNull()
  })

  it('names typing in one card with that card as its key', () => {
    expect(cardsEdit(quiz, [quiz.cards[0], card('b', 'bee'), quiz.cards[2]])).toEqual({ label: 'Edit card', key: 'card:b' })
  })

  it('names adding, deleting and moving cards', () => {
    expect(cardsEdit(quiz, [...quiz.cards, card('d')])).toEqual({ label: 'Add card' })
    expect(cardsEdit(quiz, [...quiz.cards, card('d'), card('e')])).toEqual({ label: 'Add cards' })
    expect(cardsEdit(quiz, [quiz.cards[0]])).toEqual({ label: 'Delete cards' })
    expect(cardsEdit(quiz, [quiz.cards[1], quiz.cards[0], quiz.cards[2]])).toEqual({ label: 'Move card' })
    expect(cardsEdit(quiz, [quiz.cards[0], quiz.cards[2], card('b', 'b', 'g1')])).toEqual({ label: 'Move card' })
    expect(cardsEdit(quiz, [card('a', 'x'), card('b', 'y'), quiz.cards[2]])).toEqual({ label: 'Edit cards' })
  })

  it('names group changes, typing a group name keyed by the group', () => {
    expect(cardsEdit(quiz, quiz.cards, [g1, { id: 'g2', name: 'Two', color: 'sky' }])).toEqual({ label: 'Add group' })
    expect(cardsEdit(quiz, [quiz.cards[0], quiz.cards[1], card('c')], [])).toEqual({ label: 'Ungroup' })
    expect(cardsEdit(quiz, quiz.cards, [{ ...g1, name: 'Uno' }])).toEqual({ label: 'Rename group', key: 'group:g1' })
    expect(cardsEdit(quiz, quiz.cards, [{ ...g1, color: 'sand' }])).toEqual({ label: 'Change group color', key: 'group:g1' })
  })
})
