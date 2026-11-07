import { describe, expect, it } from 'vitest'
import { FORMAT_VERSION } from '../model'
import { checkLibrary, libraryFromJson } from './format'
import { STEPS, upgrade, type Step } from './upgrade'
// Frozen copies of every released version, a file's library.json and a browser backup. Never edit them.
import v1 from './fixtures/v1.json?raw'
import v1Backup from './fixtures/v1-backup.json?raw'
import v2 from './fixtures/v2.json?raw'
import v2Backup from './fixtures/v2-backup.json?raw'

const files = [v1, v2]
const backups = [v1Backup, v2Backup]

// Any bytes do as an image: the file reader only turns them into a data URL.
const imagesOf = (text: string): Record<string, Uint8Array> =>
  Object.fromEntries([...text.matchAll(/"(?:termImage|definitionImage|image)": "([^"]+)"/g)].map((m) => [`images/${m[1]}`, new Uint8Array([1, 2, 3])]))

describe('older versions', () => {
  it.each(files.map((f, i) => [i + 1, f]))('opens a version %i file', (_, text) => {
    const library = libraryFromJson(text, imagesOf(text))
    expect(library.version).toBe(FORMAT_VERSION)
    expect(library.courses.length).toBeGreaterThan(0)
  })

  it.each(backups.map((b, i) => [i + 1, b]))('opens a version %i backup', (_, text) => {
    const library = checkLibrary(JSON.parse(text).library, 'stored')
    expect(library.version).toBe(FORMAT_VERSION)
    expect(library.courses.length).toBeGreaterThan(0)
  })

  it('keeps what a version 1 file holds', () => {
    const library = libraryFromJson(v1, imagesOf(v1))
    const quizzes = library.courses.flatMap((c) => c.quizzes)
    const cards = quizzes.flatMap((q) => q.cards)
    expect(quizzes).toHaveLength(6)
    expect(cards).toHaveLength(54)
    expect(quizzes.flatMap((q) => q.groups).map((g) => g.color)).toEqual(['sky', expect.any(String)])
    expect(cards.some((c) => !c.type && c.termImage?.startsWith('data:image/svg+xml;base64,'))).toBe(true)
    expect(cards.some((c) => c.type === 'cloze' && c.explanation.length === 3)).toBe(true)
  })

  it('keeps what a version 1 backup holds', () => {
    const library = checkLibrary(JSON.parse(v1Backup).library, 'stored')
    const [cells] = library.courses[0].quizzes
    expect(cells.groups).toEqual([
      { id: 'g1', name: 'Organelles', color: 'moss' },
      { id: 'g2', name: 'Without a color', color: expect.any(String) },
    ])
    expect(cells.cards.map((c) => c.id)).toEqual(['k1', 'k2', 'k3', 'k4', 'k5'])
    expect(cells.cards[2]).toMatchObject({ type: 'cloze', explanation: ['Has its own DNA', null, ''] })
    expect(cells.cards[3]).toMatchObject({ group: 'g1', definitionImage: expect.stringMatching(/^data:image\/png;base64,/) })
  })

  it('keeps what a version 2 file holds', () => {
    const library = libraryFromJson(v2, imagesOf(v2))
    const [cells] = library.courses[0].quizzes
    expect(library.sideTypes).toEqual([['Organelle', 'Job']])
    expect(cells.groups.map((g) => g.name)).toEqual(['Organelles', 'Without a color'])
    expect(cells.cards).toHaveLength(15)
    expect(cells.cards[1]).toMatchObject({ sides: ['Organelle', 'Job'], term: 'Ribosome' })
    expect(cells.cards[5]).toMatchObject({ type: 'true-false', answer: true, image: expect.stringMatching(/^data:image\/png;base64,/) })
    expect(cells.cards[8]).toMatchObject({ type: 'choice', right: ['Chloroplast', 'Cell wall'], wrong: ['Centriole'] })
    expect(cells.cards[9]).toMatchObject({ type: 'sequence', steps: ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'], explanation: 'PMAT' })
    expect(cells.cards[14]).toMatchObject({ type: 'sequence', group: cells.groups[1].id })
  })

  it('keeps what a version 2 backup holds', () => {
    const library = checkLibrary(JSON.parse(v2Backup).library, 'stored')
    const [cells] = library.courses[0].quizzes
    expect(library.sideTypes).toEqual([['Organelle', 'Job']])
    expect(cells.cards.map((c) => c.id)).toEqual(['k1', 'k2', 'k3', 'k4', 'k5', 'k6'])
    expect(cells.cards[1]).toMatchObject({ sides: ['Organelle', 'Job'], definition: '' })
    expect(cells.cards[3]).toMatchObject({ type: 'true-false', answer: true })
    expect(cells.cards[4]).toMatchObject({ type: 'choice', right: ['Chloroplast', 'Cell wall', ''], explanation: '', group: 'g1' })
    expect(cells.cards[5]).toMatchObject({ type: 'sequence', group: 'g2', image: expect.stringMatching(/^data:image\/png;base64,/) })
  })
})

describe('upgrade', () => {
  it('has one step per version, ending at FORMAT_VERSION', () => {
    expect(STEPS.map((s) => s.to)).toEqual(STEPS.map((_, i) => i + 2))
    expect(STEPS.at(-1)?.to ?? 1).toBe(FORMAT_VERSION)
  })

  it('runs the steps after the data version, in order', () => {
    const steps: Step[] = [
      { to: 2, changes: '', up: (d) => ({ ...d, seen: [...(d.seen as string[]), 'two'] }) },
      { to: 3, changes: '', up: (d, ids) => ({ ...d, seen: [...(d.seen as string[]), `three ${ids}`] }) },
    ]
    expect(upgrade({ version: 1, seen: [] }, 'new', steps)).toEqual({ version: 3, seen: ['two', 'three new'] })
    expect(upgrade({ version: 2, seen: [] }, 'stored', steps)).toEqual({ version: 3, seen: ['three stored'] })
    expect(upgrade({ version: 3, seen: [] }, 'new', steps)).toEqual({ version: 3, seen: [] })
  })

  it('asks to reload for a newer version', () => {
    expect(() => upgrade({ version: FORMAT_VERSION + 1, courses: [] }, 'new')).toThrow('made by a newer version of Shrimply Study')
  })

  it('rejects a version that is not a whole number', () => {
    for (const version of [undefined, '1', 1.5, 0]) {
      expect(() => upgrade({ version, courses: [] }, 'new')).toThrow('"version" must be a whole number.')
    }
  })

  it('leaves data that is not an object to checkLibrary', () => {
    expect(() => checkLibrary([], 'new')).toThrow('must be an object.')
  })
})
