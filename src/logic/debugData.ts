import { GROUP_COLORS, isTermCard, newId } from '../model'
import type { Card, Group, Library } from '../model'
import { usableCards } from './buildRound'
import { missingPart } from './cardStatus'
import { parseCloze } from './cloze'
import { inGroupOrder } from './groups'

const imagesOf = (card: Card): (string | undefined)[] =>
  isTermCard(card) ? [card.termImage, card.definitionImage] : [card.image]
// Every text of a card: both sides and the explanation, the statement and each blank's explanation, a question with
// its answers, or a title with its steps.
const textsOf = (card: Card): string[] =>
  (card.type === 'cloze'
    ? [card.statement, ...card.explanation]
    : card.type === 'true-false'
      ? [card.statement, card.explanation]
      : card.type === 'choice'
        ? [card.question, ...card.right, ...card.wrong, card.explanation]
        : card.type === 'sequence'
          ? [card.title, ...card.steps, card.explanation]
          : [card.term, card.definition, card.explanation]
  ).filter((t): t is string => !!t)
const explanationsOf = (card: Card): number =>
  card.type === 'cloze' ? card.explanation.filter((x) => x?.trim()).length : card.explanation?.trim() ? 1 : 0
// The decoded size of a data URL's base64 part.
const imageSize = (src: string) => Math.floor(((src.length - src.indexOf(',') - 1) * 3) / 4)

/**
 * Counts for the debug page. Images are counted once however often they are used. `unstudyable`: quizzes with no
 * card to ask; `noChoice`: quizzes with one, so multiple choice is off.
 */
export function libraryStats(library: Library) {
  const quizzes = library.courses.flatMap((c) => c.quizzes)
  const cards = quizzes.flatMap((q) => q.cards)
  const images = [...new Set(cards.flatMap(imagesOf).filter((src): src is string => !!src))]
  const usable = quizzes.map((q) => usableCards(q.cards).length)
  const largest = quizzes.reduce<(typeof quizzes)[number] | undefined>((max, q) => (!max || q.cards.length > max.cards.length ? q : max), undefined)
  return {
    courses: library.courses.length,
    quizzes: quizzes.length,
    termCards: cards.filter(isTermCard).length,
    trueFalseCards: cards.filter((c) => c.type === 'true-false').length,
    choiceCards: cards.filter((c) => c.type === 'choice').length,
    sequenceCards: cards.filter((c) => c.type === 'sequence').length,
    clozeCards: cards.filter((c) => c.type === 'cloze').length,
    blanks: cards.reduce((sum, c) => sum + (c.type === 'cloze' ? parseCloze(c.statement).ranges.length : 0), 0),
    groups: quizzes.reduce((sum, q) => sum + q.groups.length, 0),
    groupedCards: cards.filter((c) => c.group !== undefined).length,
    explanations: cards.reduce((sum, c) => sum + explanationsOf(c), 0),
    incomplete: cards.filter((c) => missingPart(c) !== null).length,
    emptyCourses: library.courses.filter((c) => c.quizzes.length === 0).length,
    emptyQuizzes: quizzes.filter((q) => q.cards.length === 0).length,
    unstudyable: usable.filter((n) => n === 0).length,
    noChoice: usable.filter((n) => n === 1).length,
    largestQuiz: largest && { name: largest.name, cards: largest.cards.length },
    longestText: cards.flatMap(textsOf).reduce((max, t) => Math.max(max, t.length), 0),
    images: images.length,
    imageBytes: images.reduce((sum, src) => sum + imageSize(src), 0),
    largestImage: images.reduce((max, src) => Math.max(max, imageSize(src)), 0),
  }
}

/** Readable messages for what is wrong inside the library: repeated ids, bad group links, order, empty names. */
export function libraryProblems(library: Library): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const repeated = new Set<string>()
  const see = (id: string, where: string) => {
    if (seen.has(id) && !repeated.has(id)) {
      repeated.add(id)
      problems.push(`${where}: the id ${id} is used twice.`)
    }
    seen.add(id)
  }
  const empty = (name: string) => name.trim() === ''
  for (const course of library.courses) {
    see(course.id, `Course "${course.name}"`)
    if (empty(course.name)) problems.push(`Course ${course.id}: the name is empty.`)
    for (const quiz of course.quizzes) {
      const where = `${course.name} > ${quiz.name}`
      see(quiz.id, where)
      if (empty(quiz.name)) problems.push(`${course.name} > quiz ${quiz.id}: the name is empty.`)
      quiz.groups.forEach((group, i) => {
        see(group.id, where)
        if (empty(group.name)) problems.push(`${where}: group ${i + 1} has an empty name.`)
      })
      quiz.cards.forEach((card, i) => {
        see(card.id, where)
        if (card.group !== undefined && !quiz.groups.some((g) => g.id === card.group)) {
          problems.push(`${where}: card ${i + 1} is in a group that does not exist.`)
        }
      })
      const ordered = inGroupOrder(quiz.cards, quiz.groups)
      if (ordered.some((card, i) => card !== quiz.cards[i])) problems.push(`${where}: the cards are not in group order.`)
    }
  }
  return problems
}

const SENTENCE = 'This definition is long, to test wrapping and scrolling. '

/** A stress-test quiz of `count` cards in four groups, ready for `setCards`. */
export function fakeQuiz(count: number): { cards: Card[]; groups: Group[] } {
  const groups: Group[] = [0, 1, 2, 3].map((i) => ({ id: newId(), name: `Group ${i + 1}`, color: GROUP_COLORS[i] }))
  const ungrouped = Math.ceil(count / 4)
  const cards: Card[] = Array.from({ length: count }, (_, index): Card => {
    const i = index + 1
    const group = index < ungrouped ? undefined : groups[(index - ungrouped) % groups.length].id
    if (i % 7 === 0) {
      return { id: newId(), type: 'true-false', statement: `Statement ${i}: this is ${(i / 7) % 2 === 1 ? 'true' : 'false'}.`, answer: (i / 7) % 2 === 1, ...(group && { group }) }
    }
    if (i % 5 === 0) {
      return { id: newId(), type: 'cloze', statement: `Fact ${i}: the answer is {answer ${i}}.`, explanation: [null], ...(group && { group }) }
    }
    if (i % 13 === 0) {
      return {
        id: newId(),
        type: 'choice',
        question: `Question ${i}: which are right?`,
        right: i % 26 === 0 ? [`Right ${i}a`, `Right ${i}b`] : [`Right ${i}`],
        wrong: [`Wrong ${i}a`, `Wrong ${i}b`, `Wrong ${i}c`],
        ...(i % 26 === 0 && { explanation: `Explanation ${i}.` }),
        ...(group && { group }),
      }
    }
    if (i % 17 === 0) {
      return { id: newId(), type: 'sequence', title: `Sequence ${i}`, steps: [`Step ${i}.1`, `Step ${i}.2`, `Step ${i}.3`, `Step ${i}.4`], ...(group && { group }) }
    }
    return {
      id: newId(),
      term: `Term ${i}`,
      definition: i % 9 === 0 ? `Definition ${i}. ${SENTENCE.repeat(7)}` : `Definition ${i}`,
      ...(i % 11 === 0 && { explanation: `Explanation ${i}.` }),
      ...(group && { group }),
    }
  })
  return { cards: inGroupOrder(cards, groups), groups }
}
