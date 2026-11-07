import { SIDE_PRESETS, isTermCard, type Card, type Library, type Sides, type TermCard } from '../model'

export const samePair = (a: Sides, b: Sides): boolean => a[0] === b[0] && a[1] === b[1]

/** The names a term card shows for its sides: its own, or Front and Back. */
export function sideNames(card: Pick<TermCard, 'sides'>): { term: string; definition: string } {
  const [term, definition] = card.sides ?? SIDE_PRESETS[0]
  return { term, definition }
}

/** The pair to store: trimmed, or undefined for the default pair (it is never stored). */
export function toSides(pair: Sides): Sides | undefined {
  const trimmed: Sides = [pair[0].trim(), pair[1].trim()]
  return samePair(trimmed, SIDE_PRESETS[0]) ? undefined : trimmed
}

export const isPreset = (pair: Sides): boolean => SIDE_PRESETS.some((p) => samePair(p, pair))

/** The presets, then the user's own types. */
export const sidePairs = (library: Library): Sides[] => [...SIDE_PRESETS, ...(library.sideTypes ?? [])]

/** The list with `pair` added at the end, unless it is a preset or already there (then the same array). */
export function addSideType(types: Sides[], pair: Sides): Sides[] {
  return isPreset(pair) || types.some((t) => samePair(t, pair)) ? types : [...types, pair]
}

/** How many cards use this pair. */
export function sideTypeUses(library: Library, pair: Sides): number {
  return library.courses.reduce(
    (n, c) => n + c.quizzes.reduce((m, q) => m + q.cards.filter((card) => isTermCard(card) && card.sides && samePair(card.sides, pair)).length, 0),
    0,
  )
}

// Every card of the library, with `fn` applied to the term cards that use `pair`.
const mapUsers = (library: Library, pair: Sides, fn: (card: TermCard) => Card): Library => ({
  ...library,
  courses: library.courses.map((c) => ({
    ...c,
    quizzes: c.quizzes.map((q) => ({
      ...q,
      cards: q.cards.map((card) => (isTermCard(card) && card.sides && samePair(card.sides, pair) ? fn(card) : card)),
    })),
  })),
})

/** Renames a type: its cards follow. The list keeps its place, or drops the type when `to` is a preset or already listed. */
export function renameSideType(library: Library, from: Sides, to: Sides): Library {
  const target: Sides = [to[0].trim(), to[1].trim()]
  const types = library.sideTypes ?? []
  const clash = isPreset(target) || types.some((t) => samePair(t, target) && !samePair(t, from))
  const next = clash ? types.filter((t) => !samePair(t, from)) : types.map((t) => (samePair(t, from) ? target : t))
  const sides = toSides(target)
  return {
    ...mapUsers(library, from, ({ sides: _old, ...card }) => ({ ...card, ...(sides && { sides }) })),
    sideTypes: next,
  }
}

/** Deletes a type: its cards go back to Front and Back. */
export function deleteSideType(library: Library, pair: Sides): Library {
  return {
    ...mapUsers(library, pair, ({ sides: _removed, ...card }) => card),
    sideTypes: (library.sideTypes ?? []).filter((t) => !samePair(t, pair)),
  }
}

/** The sides of the last term card (what a new card takes), undefined when it has the default ones or there is none. */
export function lastSides(cards: Card[]): Sides | undefined {
  const last = cards.filter(isTermCard).at(-1)
  return last?.sides
}
