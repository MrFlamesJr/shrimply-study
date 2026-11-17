import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION, type Card, type Course, type Library, type Quiz, type Sides } from '../model'
import { canPlace, exists, extract, insert, itemName, move, remove, ungroup, type Docs, type ItemRef } from './contentOps'

const term = (id: string, text = id, extra: Partial<Card> = {}): Card => ({ id, term: text, definition: 'd', ...extra }) as Card
const quiz = (id: string, cards: Card[] = [], groups: Quiz['groups'] = []): Quiz => ({ id, name: id.toUpperCase(), groups, cards })
const course = (id: string, quizzes: Quiz[] = []): Course => ({ id, name: id.toUpperCase(), quizzes })
const lib = (courses: Course[], sideTypes?: Sides[]): Library => ({ version: FORMAT_VERSION, courses, ...(sideTypes && { sideTypes }) })

let n = 0
const fresh = () => `new${++n}`

const cref = (doc: string, course: string): ItemRef => ({ kind: 'course', doc, course })
const qref = (doc: string, course: string, quiz: string): ItemRef => ({ kind: 'quiz', doc, course, quiz })
const kref = (doc: string, course: string, quiz: string, card: string): ItemRef => ({ kind: 'card', doc, course, quiz, card })
const termOf = (c: Card) => (c as { term: string }).term

function sample(): Docs {
  return {
    a: lib([
      course('c1', [quiz('q1', [term('k1'), term('k2'), term('k3')]), quiz('q2', [term('k4')])]),
      course('c2', [quiz('q3')]),
      course('c3'),
    ]),
    b: lib([course('c4', [quiz('q4', [term('k5')])])]),
    c: lib([course('c5')]),
  }
}
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('extract', () => {
  it('keeps document order whatever the order of refs, and deep copies', () => {
    const docs = sample()
    const f = extract(docs, [cref('b', 'c4'), cref('a', 'c3'), cref('a', 'c1')])
    expect(f.kind === 'course' && ids(f.courses)).toEqual(['c1', 'c3', 'c4'])
    if (f.kind === 'course') expect(f.courses[0]).not.toBe(docs.a.courses[0])
  })
  it('lists the own side types the term cards use', () => {
    const docs = sample()
    docs.a.courses[0].quizzes[0].cards[0] = term('k1', 'x', { sides: ['Q', 'A'] })
    docs.a.courses[0].quizzes[0].cards[1] = term('k2', 'y', { sides: ['Term', 'Definition'] })
    expect(extract(docs, [qref('a', 'c1', 'q1')]).sideTypes).toEqual([['Q', 'A']])
  })
  it('throws on mixed kinds and missing items', () => {
    const docs = sample()
    expect(() => extract(docs, [cref('a', 'c1'), qref('a', 'c1', 'q1')])).toThrow()
    expect(() => extract(docs, [cref('a', 'zz')])).toThrow('That is no longer there.')
  })
})

describe('canPlace', () => {
  it('refuses the wrong level with a plain reason', () => {
    const docs = sample()
    expect(canPlace(docs, [qref('a', 'c1', 'q1')], { kind: 'doc', doc: 'b' }, 'copy')).toBe('A quiz can only go in a course.')
    expect(canPlace(docs, [qref('a', 'c1', 'q1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q2' }, 'move')).toBe('A quiz can only go in a course.')
    expect(canPlace(docs, [cref('a', 'c1')], { kind: 'course', doc: 'a', course: 'c2' }, 'move')).toBe('A course can only go in a file.')
    expect(canPlace(docs, [kref('a', 'c1', 'q1', 'k1')], { kind: 'course', doc: 'a', course: 'c2' }, 'copy')).toBe('A card can only go in a quiz.')
  })
  it('refuses a missing source, target or group', () => {
    const docs = sample()
    expect(canPlace(docs, [cref('a', 'zz')], { kind: 'doc', doc: 'b' }, 'copy')).toBe('That is no longer there.')
    expect(canPlace(docs, [cref('a', 'c1')], { kind: 'doc', doc: 'zz' }, 'copy')).toBe('That is no longer there.')
    expect(canPlace(docs, [kref('a', 'c1', 'q1', 'k1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q2', group: 'nope' }, 'copy')).toBe('That group is no longer there.')
  })
  it('refuses a move that changes nothing, but not a reorder or a copy', () => {
    const docs = sample()
    const t = { kind: 'doc', doc: 'a', index: 1 } as const
    expect(canPlace(docs, [cref('a', 'c1')], t, 'move')).toBe('That is already there.')
    expect(canPlace(docs, [cref('a', 'c1')], { kind: 'doc', doc: 'a', index: 2 }, 'move')).toBeNull()
    expect(canPlace(docs, [cref('a', 'c1')], t, 'copy')).toBeNull()
    expect(canPlace(docs, [], t, 'copy')).toBe('Nothing is selected.')
  })
})

describe('insert', () => {
  it('copies a course with fresh ids for everything inside and keeps its quizzes, groups and cards', () => {
    const docs = sample()
    const q1 = docs.a.courses[0].quizzes[0]
    q1.groups = [{ id: 'g1', name: 'G', color: 'coral' }]
    q1.cards = [term('k1'), term('k3'), term('k2', 'k2', { group: 'g1' })]
    const { docs: out, created } = insert(docs, extract(docs, [cref('a', 'c1')]), { kind: 'doc', doc: 'b' }, fresh)
    const copy = out.b.courses[1]
    expect(created).toEqual([{ kind: 'course', doc: 'b', course: copy.id }])
    expect(copy.id).not.toBe('c1')
    expect(copy.name).toBe('C1')
    expect(copy.quizzes.map((q) => q.name)).toEqual(['Q1', 'Q2'])
    const q = copy.quizzes[0]
    expect(q.cards.map(termOf)).toEqual(['k1', 'k3', 'k2'])
    expect(q.groups[0]).toMatchObject({ name: 'G', color: 'coral' })
    expect(q.cards[2].group).toBe(q.groups[0].id)
    const all = [copy.id, ...copy.quizzes.flatMap((x) => [x.id, ...x.groups.map((g) => g.id), ...x.cards.map((c) => c.id)])]
    expect(new Set(all).size).toBe(all.length)
    expect(all.every((i) => !['c1', 'q1', 'q2', 'g1', 'k1', 'k2', 'k3', 'k4'].includes(i))).toBe(true)
  })
  it('names a clash with (2), (3), also among the inserted ones', () => {
    const docs = sample()
    const f = extract(docs, [cref('a', 'c1'), cref('a', 'c2')])
    const once = insert(docs, f, { kind: 'doc', doc: 'a' }, fresh).docs
    expect(once.a.courses.map((c) => c.name)).toEqual(['C1', 'C2', 'C3', 'C1 (2)', 'C2 (2)'])
    const twice = insert(once, f, { kind: 'doc', doc: 'a', index: 0 }, fresh).docs
    expect(twice.a.courses.map((c) => c.name).slice(0, 2)).toEqual(['C1 (3)', 'C2 (3)'])
    const q = insert(docs, extract(docs, [qref('a', 'c1', 'q1')]), { kind: 'course', doc: 'a', course: 'c1', index: 0 }, fresh)
    expect(q.docs.a.courses[0].quizzes.map((x) => x.name)).toEqual(['Q1 (2)', 'Q1', 'Q2'])
  })
  it('groups carry by name, or are added at the end with their color; no group stays none', () => {
    const docs = sample()
    const src = docs.a.courses[0].quizzes[0]
    src.groups = [{ id: 'g1', name: 'Same', color: 'coral' }, { id: 'g2', name: 'Fresh', color: 'sky' }]
    src.cards = [term('k1'), term('k2', 'k2', { group: 'g1' }), term('k3', 'k3', { group: 'g2' })]
    docs.b.courses[0].quizzes[0].groups = [{ id: 'tg', name: 'Same', color: 'moss' }]
    const f = extract(docs, [kref('a', 'c1', 'q1', 'k3'), kref('a', 'c1', 'q1', 'k1'), kref('a', 'c1', 'q1', 'k2')])
    const out = insert(docs, f, { kind: 'quiz', doc: 'b', course: 'c4', quiz: 'q4' }, fresh).docs.b.courses[0].quizzes[0]
    expect(out.groups.map((g) => g.name)).toEqual(['Same', 'Fresh'])
    expect(out.groups[0].id).toBe('tg')
    expect(out.groups[1]).toMatchObject({ name: 'Fresh', color: 'sky' })
    expect(out.groups[1].id).not.toBe('g2')
    const byTerm = Object.fromEntries(out.cards.map((c) => [termOf(c), c.group]))
    expect(byTerm).toEqual({ k5: undefined, k1: undefined, k2: 'tg', k3: out.groups[1].id })
    expect(out.cards.map(termOf)).toEqual(['k5', 'k1', 'k2', 'k3'])
  })
  it('group null drops groups; an id uses that group; an unknown id is refused', () => {
    const docs = sample()
    docs.a.courses[0].quizzes[0].groups = [{ id: 'g1', name: 'G', color: 'coral' }]
    docs.a.courses[0].quizzes[0].cards[0] = term('k1', 'k1', { group: 'g1' })
    docs.b.courses[0].quizzes[0].groups = [{ id: 'tg', name: 'T', color: 'moss' }]
    const f = extract(docs, [kref('a', 'c1', 'q1', 'k1')])
    const into = (group: string | null) => insert(docs, f, { kind: 'quiz', doc: 'b', course: 'c4', quiz: 'q4', index: 0, group }, fresh).docs.b.courses[0].quizzes[0]
    expect(into(null).cards[0].group).toBeUndefined()
    expect(into(null).groups).toHaveLength(1)
    expect(into('tg').cards.find((c) => termOf(c) === 'k1')?.group).toBe('tg')
    expect(() => into('g1')).toThrow('That group is no longer there.')
  })
  it("adds a card's own side type to the target file once", () => {
    const docs = sample()
    docs.a.courses[0].quizzes[0].cards[0] = term('k1', 'k1', { sides: ['Q', 'A'] })
    const f = extract(docs, [kref('a', 'c1', 'q1', 'k1')])
    const t = { kind: 'quiz', doc: 'b', course: 'c4', quiz: 'q4' } as const
    const once = insert(docs, f, t, fresh).docs
    expect(once.b.sideTypes).toEqual([['Q', 'A']])
    expect(insert(once, f, t, fresh).docs.b.sideTypes).toEqual([['Q', 'A']])
    expect(docs.b.sideTypes).toBeUndefined()
  })
  it('index counts positions before the operation; untouched files keep their identity', () => {
    const docs = sample()
    const f = extract(docs, [kref('a', 'c1', 'q2', 'k4')])
    const out = insert(docs, f, { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 1 }, fresh).docs
    expect(out.a.courses[0].quizzes[0].cards.map(termOf)).toEqual(['k1', 'k4', 'k2', 'k3'])
    expect(out.b).toBe(docs.b)
    expect(out.c).toBe(docs.c)
  })
})

describe('move', () => {
  it('reorders within a file at a new index, counted before the move, without renaming', () => {
    const docs = sample()
    const { docs: out, moved } = move(docs, [cref('a', 'c1')], { kind: 'doc', doc: 'a', index: 3 })
    expect(ids(out.a.courses)).toEqual(['c2', 'c3', 'c1'])
    expect(moved).toEqual([cref('a', 'c1')])
    expect(out.a.courses[2].name).toBe('C1')
    expect(out.b).toBe(docs.b)
    expect(out.c).toBe(docs.c)
    expect(ids(move(docs, [cref('a', 'c3')], { kind: 'doc', doc: 'a', index: 0 }).docs.a.courses)).toEqual(['c3', 'c1', 'c2'])
  })
  it('keeps document order for shuffled refs and moves them together', () => {
    const docs = sample()
    const out = move(docs, [cref('b', 'c4'), cref('a', 'c3'), cref('a', 'c1')], { kind: 'doc', doc: 'c', index: 0 })
    expect(ids(out.docs.c.courses)).toEqual(['c1', 'c3', 'c4', 'c5'])
    expect(ids(out.docs.a.courses)).toEqual(['c2'])
    expect(out.docs.b.courses).toEqual([])
    expect(out.moved.map((r) => (r as { course: string }).course)).toEqual(['c1', 'c3', 'c4'])
    const cards = move(docs, [kref('a', 'c1', 'q1', 'k3'), kref('a', 'c1', 'q1', 'k1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 2 })
    expect(ids(cards.docs.a.courses[0].quizzes[0].cards)).toEqual(['k2', 'k1', 'k3'])
  })
  it('keeps ids across files, renames a clash, changes only the two files', () => {
    const docs = sample()
    docs.b.courses[0].name = 'C1'
    const out = move(docs, [cref('a', 'c1')], { kind: 'doc', doc: 'b' }).docs
    expect(out.b.courses.map((c) => [c.id, c.name])).toEqual([['c4', 'C1'], ['c1', 'C1 (2)']])
    expect(out.b.courses[1].quizzes[0].cards.map((c) => c.id)).toEqual(['k1', 'k2', 'k3'])
    expect(out.a.courses.map((c) => c.id)).toEqual(['c2', 'c3'])
    expect(out.c).toBe(docs.c)
  })
  it("moves quizzes between courses and refuses a quiz dropped at a card's level", () => {
    const docs = sample()
    const out = move(docs, [qref('a', 'c1', 'q2')], { kind: 'course', doc: 'a', course: 'c2', index: 0 }).docs
    expect(ids(out.a.courses[1].quizzes)).toEqual(['q2', 'q3'])
    expect(ids(out.a.courses[0].quizzes)).toEqual(['q1'])
    expect(() => move(docs, [qref('a', 'c1', 'q2')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1' })).toThrow('A quiz can only go in a course.')
    expect(() => move(docs, [cref('a', 'c1')], { kind: 'course', doc: 'a', course: 'c1' })).toThrow('A course can only go in a file.')
  })
  it('moves cards with their group and own side type to another file; the source group stays', () => {
    const docs = sample()
    const src = docs.a.courses[0].quizzes[0]
    src.groups = [{ id: 'g1', name: 'G', color: 'rose' }]
    src.cards = [term('k1', 'k1', { group: 'g1', sides: ['Q', 'A'] }), term('k2')]
    const out = move(docs, [kref('a', 'c1', 'q1', 'k1')], { kind: 'quiz', doc: 'b', course: 'c4', quiz: 'q4', index: 0 }).docs
    const target = out.b.courses[0].quizzes[0]
    expect(target.cards.map((c) => c.id)).toEqual(['k5', 'k1'])
    // A group made in another quiz gets its own id, never the source group's.
    expect(target.groups).toEqual([{ id: expect.any(String), name: 'G', color: 'rose' }])
    expect(target.groups[0].id).not.toBe('g1')
    expect(target.cards[1].group).toBe(target.groups[0].id)
    expect(out.b.sideTypes).toEqual([['Q', 'A']])
    expect(out.a.courses[0].quizzes[0].groups).toEqual(src.groups)
    expect(out.a.courses[0].quizzes[0].cards.map((c) => c.id)).toEqual(['k2'])
    expect(out.a.sideTypes).toBeUndefined()
  })
  it('keeps cards in group order within a quiz', () => {
    const docs = sample()
    const q = docs.a.courses[0].quizzes[0]
    q.groups = [{ id: 'g1', name: 'G', color: 'rose' }]
    q.cards = [term('k1'), term('k2'), term('k3', 'k3', { group: 'g1' })]
    const out = move(docs, [kref('a', 'c1', 'q1', 'k1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 3 }).docs
    expect(ids(out.a.courses[0].quizzes[0].cards)).toEqual(['k2', 'k1', 'k3'])
    const into = move(docs, [kref('a', 'c1', 'q1', 'k1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', group: 'g1' }).docs
    expect(ids(into.a.courses[0].quizzes[0].cards)).toEqual(['k2', 'k3', 'k1'])
  })
})

describe('ids never repeat within a file', () => {
  // Every id in a library, to check none appears twice.
  const allIds = (l: Library) => l.courses.flatMap((c) => [c.id, ...c.quizzes.flatMap((q) => [q.id, ...q.groups.map((g) => g.id), ...q.cards.map((k) => k.id)])])
  // Two files with the same ids, as two copies of one backup would be.
  const twins = (): Docs => {
    const one = () => lib([course('c1', [quiz('q1', [term('k1', 'k1', { group: 'g1' }), term('k2')], [{ id: 'g1', name: 'G', color: 'rose' }])])])
    return { a: one(), b: one() }
  }

  it('a move from a twin file gives the clashing course, quiz, group and card ids new ones, keeping the links', () => {
    const out = move(twins(), [cref('a', 'c1')], { kind: 'doc', doc: 'b' }).docs
    expect(new Set(allIds(out.b)).size).toBe(allIds(out.b).length)
    const moved = out.b.courses[1]
    expect(moved.name).toBe('C1 (2)')
    expect(moved.quizzes[0].cards[0].group).toBe(moved.quizzes[0].groups[0].id)
    expect(moved.quizzes[0].cards.map(termOf)).toEqual(['k1', 'k2'])
  })

  it('a quiz or cards moved from a twin file take new ids where they clash', () => {
    const quizzes = move(twins(), [qref('a', 'c1', 'q1')], { kind: 'course', doc: 'b', course: 'c1' }).docs
    expect(new Set(allIds(quizzes.b)).size).toBe(allIds(quizzes.b).length)
    const cards = move(twins(), [kref('a', 'c1', 'q1', 'k1'), kref('a', 'c1', 'q1', 'k2')], { kind: 'quiz', doc: 'b', course: 'c1', quiz: 'q1' }).docs
    expect(new Set(allIds(cards.b)).size).toBe(allIds(cards.b).length)
    expect(cards.b.courses[0].quizzes[0].cards.map(termOf)).toEqual(['k2', 'k2', 'k1', 'k1'])
  })

  it('cards from two twin files moved together into a third get apart ids', () => {
    const docs = { ...twins(), c: lib([course('c9', [quiz('q9')])]) }
    const out = move(docs, [kref('a', 'c1', 'q1', 'k2'), kref('b', 'c1', 'q1', 'k2')], { kind: 'quiz', doc: 'c', course: 'c9', quiz: 'q9' }).docs
    const ids = out.c.courses[0].quizzes[0].cards.map((k) => k.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('a move within one file keeps every id', () => {
    const docs = twins()
    const out = move(docs, [kref('a', 'c1', 'q1', 'k2')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 0 }).docs
    expect(allIds(out.a).sort()).toEqual(allIds(docs.a).sort())
  })
})

describe('atomicity', () => {
  it('a refused operation throws and changes nothing', () => {
    const docs = sample()
    const before = structuredClone(docs)
    const frag = extract(docs, [kref('a', 'c1', 'q1', 'k1')])
    const fragBefore = structuredClone(frag)
    expect(() => move(docs, [cref('a', 'c1'), cref('a', 'zz')], { kind: 'doc', doc: 'b' })).toThrow()
    expect(() => insert(docs, frag, { kind: 'course', doc: 'b', course: 'c4' }, fresh)).toThrow()
    expect(() => remove(docs, [cref('a', 'c1'), cref('a', 'zz')])).toThrow()
    expect(docs).toEqual(before)
    expect(frag).toEqual(fragBefore)
  })
  it('successful operations leave their inputs alone', () => {
    const docs = sample()
    const before = structuredClone(docs)
    move(docs, [cref('a', 'c1')], { kind: 'doc', doc: 'b' })
    insert(docs, extract(docs, [cref('a', 'c1')]), { kind: 'doc', doc: 'c' }, fresh)
    remove(docs, [cref('a', 'c1')])
    expect(docs).toEqual(before)
  })
})

describe('remove, exists, itemName', () => {
  it('removes items with what is inside and keeps other files as they are', () => {
    const docs = sample()
    const out = remove(docs, [cref('a', 'c2'), kref('a', 'c1', 'q1', 'k2'), qref('a', 'c1', 'q2')])
    expect(ids(out.a.courses)).toEqual(['c1', 'c3'])
    expect(ids(out.a.courses[0].quizzes)).toEqual(['q1'])
    expect(ids(out.a.courses[0].quizzes[0].cards)).toEqual(['k1', 'k3'])
    expect(out.b).toBe(docs.b)
    expect(exists(out, cref('a', 'c2'))).toBe(false)
    expect(exists(out, kref('a', 'c1', 'q1', 'k1'))).toBe(true)
  })
  it('names an item by its first text', () => {
    const docs = sample()
    const cards: Card[] = [
      term('a1', '  Hello '),
      term('a2', '   '),
      { id: 'a3', type: 'cloze', statement: 'The {mito} is \\{x\\}', explanation: [null] },
      { id: 'a4', type: 'true-false', statement: 'Sky is blue', answer: true },
      { id: 'a5', type: 'choice', mode: 'one', question: 'Pick', right: ['a'], wrong: ['b'] },
      { id: 'a6', type: 'sequence', title: 'Phases', steps: ['a', 'b'] },
    ]
    docs.a.courses[0].quizzes[0].cards = cards
    const name = (id: string) => itemName(docs, kref('a', 'c1', 'q1', id))
    expect(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map(name)).toEqual(['Hello', 'Empty card', 'The mito is {x}', 'Sky is blue', 'Pick', 'Phases'])
    expect(itemName(docs, cref('a', 'c1'))).toBe('C1')
    expect(itemName(docs, qref('a', 'c1', 'q2'))).toBe('Q2')
  })
})

describe('groups', () => {
  const g = (id: string, color: 'coral' | 'sky' = 'coral') => ({ id, name: id.toUpperCase(), color })
  const withGroups = () =>
    quiz('q1', [term('k1'), term('k2', 'k2', { group: 'g1' }), term('k3', 'k3', { group: 'g1' }), term('k4', 'k4', { group: 'g2' })], [g('g1'), g('g2', 'sky')])
  const docs = (): Docs => ({ a: lib([course('c1', [withGroups(), quiz('q2')])]), b: lib([course('cb', [quiz('qb', [], [g('g1', 'sky')])])]) })
  const gref = (doc: string, course: string, quiz: string, group: string): ItemRef => ({ kind: 'group', doc, course, quiz, group })
  const groupsOf = (d: Docs, doc = 'a', q = 0) => d[doc].courses[0].quizzes[q].groups.map((x) => x.id)
  const cardsOf = (d: Docs, doc = 'a', q = 0) => d[doc].courses[0].quizzes[q].cards.map((c) => `${c.id}${c.group ? '@' + c.group : ''}`)

  it('extract takes the group with its cards, deep', () => {
    const f = extract(docs(), [gref('a', 'c1', 'q1', 'g1')])
    expect(f.kind === 'group' && f.groups.map((e) => [e.group.id, e.cards.map((c) => c.id)])).toEqual([['g1', ['k2', 'k3']]])
  })
  it('names and finds a group', () => {
    expect(itemName(docs(), gref('a', 'c1', 'q1', 'g2'))).toBe('G2')
    expect(exists(docs(), gref('a', 'c1', 'q1', 'gone'))).toBe(false)
  })
  it('insert copies a group into a quiz of another file: free name, color kept, fresh ids, its cards inside it', () => {
    const f = extract(docs(), [gref('a', 'c1', 'q1', 'g1')])
    const r = insert(docs(), f, { kind: 'quiz', doc: 'b', course: 'cb', quiz: 'qb' }, fresh)
    const q = r.docs.b.courses[0].quizzes[0]
    expect(q.groups.map((x) => [x.name, x.color])).toEqual([['G1', 'sky'], ['G1 (2)', 'coral']])
    expect(q.cards.map((c) => c.group)).toEqual([q.groups[1].id, q.groups[1].id])
    expect(r.created).toHaveLength(1)
    expect(groupsOf(docs())).toEqual(['g1', 'g2'])
  })
  it('insert puts a group at its place among the groups', () => {
    const f = extract(docs(), [gref('a', 'c1', 'q1', 'g2')])
    const r = insert(docs(), f, { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 0 }, fresh)
    expect(r.docs.a.courses[0].quizzes[0].groups.map((x) => x.name)).toEqual(['G2 (2)', 'G1', 'G2'])
  })
  it('a group goes only in a quiz', () => {
    const f = extract(docs(), [gref('a', 'c1', 'q1', 'g1')])
    expect(() => insert(docs(), f, { kind: 'course', doc: 'a', course: 'c1' }, fresh)).toThrow('A group can only go in a quiz.')
    expect(canPlace(docs(), [gref('a', 'c1', 'q1', 'g1'), qref('a', 'c1', 'q1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q2' }, 'move')).toBe('Pick items of one kind.')
  })
  it('move reorders groups, counting the place before the move; cards keep their order', () => {
    const m = move(docs(), [gref('a', 'c1', 'q1', 'g2')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 0 })
    expect(groupsOf(m.docs)).toEqual(['g2', 'g1'])
    expect(cardsOf(m.docs)).toEqual(['k1', 'k4@g2', 'k2@g1', 'k3@g1'])
    const down = move(docs(), [gref('a', 'c1', 'q1', 'g1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 2 })
    expect(groupsOf(down.docs)).toEqual(['g2', 'g1'])
  })
  it('move to another quiz keeps ids and name; moving where it is says so', () => {
    const m = move(docs(), [gref('a', 'c1', 'q1', 'g1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q2' })
    expect(groupsOf(m.docs, 'a', 1)).toEqual(['g1'])
    expect(groupsOf(m.docs)).toEqual(['g2'])
    expect(cardsOf(m.docs, 'a', 1)).toEqual(['k2@g1', 'k3@g1'])
    expect(canPlace(docs(), [gref('a', 'c1', 'q1', 'g2')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1' }, 'move')).toBe('That is already there.')
  })
  it('cards moved into a group join it, at the place given', () => {
    const m = move(docs(), [kref('a', 'c1', 'q1', 'k1')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', group: 'g2' })
    expect(cardsOf(m.docs)).toEqual(['k2@g1', 'k3@g1', 'k4@g2', 'k1@g2'])
    const first = move(docs(), [kref('a', 'c1', 'q1', 'k4')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q1', index: 1, group: 'g1' })
    expect(cardsOf(first.docs)).toEqual(['k1', 'k4@g1', 'k2@g1', 'k3@g1'])
  })
  it('remove deletes a group and its cards, and only those', () => {
    const r = remove(docs(), [gref('a', 'c1', 'q1', 'g1')])
    expect(groupsOf(r)).toEqual(['g2'])
    expect(cardsOf(r)).toEqual(['k1', 'k4@g2'])
    expect(groupsOf(docs())).toEqual(['g1', 'g2'])
  })
  it('ungroup keeps the cards, loose, after the ones that were loose', () => {
    const r = ungroup(docs(), gref('a', 'c1', 'q1', 'g1') as Extract<ItemRef, { kind: 'group' }>)
    expect(groupsOf(r)).toEqual(['g2'])
    expect(cardsOf(r)).toEqual(['k1', 'k2', 'k3', 'k4@g2'])
    expect(() => ungroup(docs(), gref('a', 'c1', 'q1', 'gone') as Extract<ItemRef, { kind: 'group' }>)).toThrow('That is no longer there.')
  })
  it('a group that is gone is refused whole', () => {
    expect(() => move(docs(), [gref('a', 'c1', 'q1', 'gone')], { kind: 'quiz', doc: 'a', course: 'c1', quiz: 'q2' })).toThrow('That is no longer there.')
  })
})
