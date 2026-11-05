import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Library, TermCard } from '../model'
import { checkLibrary, decodeLibrary, encodeLibrary, libraryFromJson, libraryToJson } from './format'

const library: Library = {
  version: 1,
  courses: [
    {
      id: 'a',
      name: 'French',
      quizzes: [
        { id: 'b', name: 'Animals', groups: [], cards: [{ id: 'c', term: 'cat', definition: 'chat\nmeow' }] },
        { id: 'd', name: 'Empty', groups: [], cards: [] },
      ],
    },
  ],
}

const plain = {
  version: 1,
  courses: [
    {
      name: 'French',
      quizzes: [
        { name: 'Animals', cards: [{ term: 'cat', definition: 'chat\nmeow' }] },
        { name: 'Empty', cards: [] },
      ],
    },
  ],
}

const fromData = (data: unknown) => libraryFromJson(JSON.stringify(data))
const withCard = (card: unknown) => ({
  version: 1,
  courses: [{ name: 'c', quizzes: [{ name: 'q', cards: [card] }] }],
})

describe('library format', () => {
  it('round-trips names, terms and definitions with fresh unique ids', () => {
    const back = decodeLibrary(encodeLibrary(library))
    expect(JSON.parse(libraryToJson(back))).toEqual(plain)
    const ids = [back.courses[0].id, ...back.courses[0].quizzes.map((q) => q.id), back.courses[0].quizzes[0].cards[0].id]
    expect(new Set(ids).size).toBe(4)
    expect(ids).not.toContain('a')
  })

  it('writes no ids and one card per line', () => {
    const json = libraryToJson(library)
    expect(json).not.toContain('"id"')
    expect(json).toContain('\n            { "term": "cat", "definition": "chat\\nmeow" }\n')
    expect(json).toContain('"cards": []')
    expect(JSON.parse(json)).toEqual(plain)
  })

  it('keeps an explanation through a round trip', () => {
    const lib = structuredClone(library)
    lib.courses[0].quizzes[0].cards[0].explanation = 'because'
    const json = libraryToJson(lib)
    expect(json).toContain('"definition": "chat\\nmeow", "explanation": "because" }')
    expect(libraryFromJson(json).courses[0].quizzes[0].cards[0].explanation).toBe('because')
  })

  it('does not write an empty or whitespace explanation', () => {
    for (const explanation of ['', '  \n']) {
      const lib = structuredClone(library)
      lib.courses[0].quizzes[0].cards[0].explanation = explanation
      expect(libraryToJson(lib)).not.toContain('explanation')
    }
  })

  it('drops spaces and empty lines at the start and end of card text, keeping the ones in between', () => {
    const data = withCard({ term: '  cat \n', definition: '\n\nchat\n\nmeow  \n\n', explanation: ' \n because\n' })
    const card = fromData(data).courses[0].quizzes[0].cards[0]
    expect(card).toMatchObject({ term: 'cat', definition: 'chat\n\nmeow', explanation: 'because' })
  })

  it('rejects an explanation that is not text, naming the spot', () => {
    const data = withCard({ term: 'a', definition: 'b', explanation: 5 })
    expect(() => fromData(data)).toThrow('courses[0].quizzes[0].cards[0]: "explanation" must be text.')
  })

  it('accepts an empty explanation in stored data', () => {
    const data = {
      version: 1,
      courses: [
        { id: 'a', name: 'c', quizzes: [{ id: 'b', name: 'q', cards: [{ id: 'c', term: 't', definition: 'd', explanation: '' }] }] },
      ],
    }
    expect(checkLibrary(data, 'stored').courses[0].quizzes[0].cards[0].explanation).toBe('')
  })

  it('rejects an id in the file', () => {
    const data = { version: 1, courses: [{ name: 'a', quizzes: [] }, { id: 'x', name: 'b', quizzes: [] }] }
    expect(() => fromData(data)).toThrow('courses[1]: unknown field "id".')
  })

  it('rejects an unknown field', () => {
    expect(() => fromData({ ...plain, extra: 1 })).toThrow('unknown field "extra".')
  })

  it('rejects a missing definition and names the spot', () => {
    expect(() => fromData(withCard({ term: 't' }))).toThrow(
      'courses[0].quizzes[0].cards[0]: "definition" is missing.',
    )
  })

  it('rejects an empty or spaces-only name and names the spot', () => {
    expect(() => fromData({ version: 1, courses: [{ name: '', quizzes: [] }] })).toThrow('courses[0]: "name" can not be empty.')
    const quiz = { version: 1, courses: [{ name: 'c', quizzes: [{ name: '  ', cards: [] }] }] }
    expect(() => fromData(quiz)).toThrow('courses[0].quizzes[0]: "name" can not be empty.')
    const group = { version: 1, courses: [{ name: 'c', quizzes: [{ name: 'q', cards: [], groups: [{ name: ' ', cards: [] }] }] }] }
    expect(() => fromData(group)).toThrow('courses[0].quizzes[0].groups[0]: "name" can not be empty.')
  })

  it('rejects a non-string term', () => {
    expect(() => fromData(withCard({ term: 1, definition: 'd' }))).toThrow(
      'courses[0].quizzes[0].cards[0]: "term" must be text.',
    )
  })

  it('rejects version 2', () => {
    expect(() => fromData({ ...plain, version: 2 })).toThrow('"version" must be 1.')
  })

  it('rejects invalid JSON', () => {
    expect(() => libraryFromJson('{')).toThrow('library.json is not valid JSON.')
  })

  it('rejects a zip without library.json', () => {
    expect(() => decodeLibrary(zipSync({ 'other.txt': strToU8('x') }))).toThrow('The file has no library.json.')
  })

  it('rejects random bytes', () => {
    expect(() => decodeLibrary(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow('This is not a .shrimp file.')
  })

  describe('groups', () => {
    const withGroups: Library = {
      version: 1,
      courses: [
        {
          id: 'a',
          name: 'c',
          quizzes: [
            {
              id: 'b',
              name: 'q',
              groups: [
                { id: 'g1', name: 'One', color: 'lagoon' },
                { id: 'g2', name: 'Two', color: 'coral' },
              ],
              cards: [
                { id: 'c1', term: 'free', definition: 'f' },
                { id: 'c2', term: 'x', definition: 'y', group: 'g1' },
                { id: 'c3', term: 'z', definition: 'w', group: 'g2' },
              ],
            },
          ],
        },
      ],
    }
    const nested = {
      version: 1,
      courses: [
        {
          name: 'c',
          quizzes: [
            {
              name: 'q',
              cards: [{ term: 'free', definition: 'f' }],
              groups: [
                { name: 'One', color: 'lagoon', cards: [{ term: 'x', definition: 'y' }] },
                { name: 'Two', color: 'coral', cards: [{ term: 'z', definition: 'w' }] },
              ],
            },
          ],
        },
      ],
    }

    it('writes groups nested, one card per line', () => {
      const json = libraryToJson(withGroups)
      expect(JSON.parse(json)).toEqual(nested)
      expect(json).toContain('\n                { "term": "x", "definition": "y" }\n')
    })

    it('round-trips through the file with fresh group ids', () => {
      const back = decodeLibrary(encodeLibrary(withGroups)).courses[0].quizzes[0]
      expect(back.groups.map((g) => g.name)).toEqual(['One', 'Two'])
      expect(back.groups[0].id).not.toBe('g1')
      expect(back.cards.map((c) => (c as TermCard).term)).toEqual(['free', 'x', 'z'])
      expect(back.cards.map((c) => c.group)).toEqual([undefined, back.groups[0].id, back.groups[1].id])
      expect(JSON.parse(libraryToJson(decodeLibrary(encodeLibrary(withGroups))))).toEqual(nested)
    })

    it('round-trips through the backup', () => {
      expect(checkLibrary(JSON.parse(JSON.stringify(withGroups)), 'stored')).toEqual(withGroups)
    })

    it('leaves groups out when there are none, and opens a file without them', () => {
      expect(libraryToJson(library)).not.toContain('groups')
      expect(fromData(plain).courses[0].quizzes[0].groups).toEqual([])
    })

    it('rejects a stored card with an unknown group, naming the spot', () => {
      const bad = structuredClone(withGroups)
      bad.courses[0].quizzes[0].cards[2].group = 'nope'
      expect(() => checkLibrary(bad, 'stored')).toThrow(
        "courses[0].quizzes[0].cards[2]: \"group\" is not one of this quiz's groups.",
      )
    })

    it('keeps the color through the file', () => {
      const back = decodeLibrary(encodeLibrary(withGroups)).courses[0].quizzes[0]
      expect(back.groups.map((g) => g.color)).toEqual(['lagoon', 'coral'])
    })

    it('gives a group without a color the next unused one', () => {
      const data = {
        version: 1,
        courses: [
          {
            name: 'c',
            quizzes: [{ name: 'q', cards: [], groups: [{ name: 'a', color: 'lagoon', cards: [] }, { name: 'b', cards: [] }] }],
          },
        ],
      }
      expect(fromData(data).courses[0].quizzes[0].groups.map((g) => g.color)).toEqual(['lagoon', 'coral'])
    })

    it('rejects an unknown color, naming the spot', () => {
      const data = { version: 1, courses: [{ name: 'c', quizzes: [{ name: 'q', cards: [], groups: [{ name: 'g', color: 'pink', cards: [] }] }] }] }
      expect(() => fromData(data)).toThrow('courses[0].quizzes[0].groups[0]: "color" must be one of lagoon, coral')
    })

    it('rejects a group field on a file card and a file group without cards', () => {
      expect(() => fromData(withCard({ term: 't', definition: 'd', group: 'g' }))).toThrow('unknown field "group".')
      const data = { version: 1, courses: [{ name: 'c', quizzes: [{ name: 'q', cards: [], groups: [{ name: 'g' }] }] }] }
      expect(() => fromData(data)).toThrow('courses[0].quizzes[0].groups[0]: "cards" is missing.')
    })
  })

  it('checkLibrary stored keeps ids and requires them', () => {
    expect(checkLibrary(library, 'stored')).toEqual(library)
    const noId = { version: 1, courses: [{ name: 'c', quizzes: [] }] }
    expect(() => checkLibrary(noId, 'stored')).toThrow('courses[0]: "id" is missing.')
  })

  describe('images', () => {
    const at = 'courses[0].quizzes[0].cards[0]: '
    const bytesOf = (...n: number[]) => new Uint8Array(n)
    const dataUrl = (type: string, bytes: Uint8Array) => `data:${type};base64,${btoa(String.fromCharCode(...bytes))}`
    const png = dataUrl('image/png', bytesOf(137, 80, 78, 71, 0, 255, 200))
    const gif = dataUrl('image/gif', bytesOf(71, 73, 70, 56, 1, 2, 3))
    const webp = dataUrl('image/webp', bytesOf(82, 73, 70, 70, 9, 8, 7))
    const withImages: Library = {
      version: 1,
      courses: [
        {
          id: 'a',
          name: 'c',
          quizzes: [
            {
              id: 'b',
              name: 'q',
              groups: [],
              cards: [
                { id: 'c1', term: 'a', termImage: png, definition: 'b', definitionImage: gif, explanation: 'why' },
                { id: 'c2', type: 'cloze', statement: 'x {y}', image: webp, explanation: [null] },
                { id: 'c3', term: 'c', termImage: png, definition: 'd' },
              ],
            },
          ],
        },
      ],
    }
    const oneCard = (card: unknown, files: Record<string, Uint8Array> = {}) => libraryFromJson(JSON.stringify(withCard(card)), files)

    it('round-trips through the file, sharing one image file between cards', () => {
      const bytes = encodeLibrary(withImages)
      const names = Object.keys(unzipSync(bytes)).filter((n) => n.startsWith('images/'))
      expect(names.sort()).toEqual(['images/1.png', 'images/2.gif', 'images/3.webp'])
      const cards = decodeLibrary(bytes).courses[0].quizzes[0].cards
      expect(cards[0]).toMatchObject({ termImage: png, definitionImage: gif })
      expect(cards[1]).toMatchObject({ image: webp })
      expect(cards[2]).toMatchObject({ termImage: png })
      expect(cards[2]).not.toHaveProperty('definitionImage')
    })

    it('writes image names in order, each after its own text', () => {
      const images = new Map<string, string>()
      const json = libraryToJson(withImages, images)
      expect(json).toContain(
        '{ "term": "a", "termImage": "1.png", "definition": "b", "definitionImage": "2.gif", "explanation": "why" }',
      )
      expect(json).toContain('{ "type": "cloze", "statement": "x {y}", "image": "3.webp" }')
      expect(json).toContain('{ "term": "c", "termImage": "1.png", "definition": "d" }')
      expect([...images]).toEqual([[png, '1.png'], [gif, '2.gif'], [webp, '3.webp']])
    })

    it('numbers the images of grouped cards after those of ungrouped cards', () => {
      const lib = structuredClone(withImages)
      const quiz = lib.courses[0].quizzes[0]
      quiz.groups = [{ id: 'g', name: 'G', color: 'lagoon' }]
      quiz.cards[0].group = 'g'
      const json = libraryToJson(lib)
      expect(json).toContain('"image": "1.webp"')
      expect(json).toContain('{ "term": "c", "termImage": "2.png", "definition": "d" }')
      expect(json).toContain('"termImage": "2.png", "definition": "b", "definitionImage": "3.gif"')
    })

    it('reads an image the file names', () => {
      const card = oneCard({ term: 't', termImage: 'p.png', definition: 'd' }, { 'images/p.png': bytesOf(1, 2, 3) })
      expect((card.courses[0].quizzes[0].cards[0] as TermCard).termImage).toBe(dataUrl('image/png', bytesOf(1, 2, 3)))
    })

    it('reads an upper-case extension', () => {
      const lib = oneCard({ term: 't', termImage: 'A.PNG', definition: 'd' }, { 'images/A.PNG': bytesOf(1) })
      expect((lib.courses[0].quizzes[0].cards[0] as TermCard).termImage).toBe(dataUrl('image/png', bytesOf(1)))
    })

    it('ignores zip images no card names, dropping them on re-encode', () => {
      const json = JSON.stringify(plain)
      const lib = decodeLibrary(zipSync({ 'library.json': strToU8(json), 'images/1.png': bytesOf(1, 2) }))
      expect(lib.courses[0].quizzes[0].cards).toHaveLength(1)
      expect(Object.keys(unzipSync(encodeLibrary(lib)))).toEqual(['library.json'])
    })

    it('rejects an image that is not in the file, naming the spot', () => {
      expect(() => oneCard({ term: 't', termImage: 'x.png', definition: 'd' })).toThrow(
        `${at}"termImage" names images/x.png, which is not in the file.`,
      )
      expect(() => oneCard({ type: 'cloze', statement: 'a {b}', image: 'x.png' })).toThrow(
        `${at}"image" names images/x.png, which is not in the file.`,
      )
    })

    it('rejects a name that is not an image file', () => {
      const msg = `${at}"termImage" must name an image file ending in .png, .jpg, .jpeg, .gif, .webp, .avif or .svg.`
      expect(() => oneCard({ term: 't', termImage: 'x.txt', definition: 'd' })).toThrow(msg)
      expect(() => oneCard({ term: 't', termImage: 'png', definition: 'd' })).toThrow(msg)
    })

    it('rejects an image that is not text', () => {
      expect(() => oneCard({ term: 't', definitionImage: 5, definition: 'd' })).toThrow(`${at}"definitionImage" must be text.`)
    })

    it('accepts a supported data URL in stored data and rejects others', () => {
      const stored = (termImage: string) => ({
        version: 1,
        courses: [{ id: 'a', name: 'c', quizzes: [{ id: 'b', name: 'q', cards: [{ id: 'c', term: 't', termImage, definition: 'd' }] }] }],
      })
      expect(checkLibrary(stored(png), 'stored').courses[0].quizzes[0].cards[0]).toMatchObject({ termImage: png })
      const bad = `${at}"termImage" must be an image data URL.`
      expect(() => checkLibrary(stored('1.png'), 'stored')).toThrow(bad)
      expect(() => checkLibrary(stored('data:text/plain;base64,AAAA'), 'stored')).toThrow(bad)
    })
  })

  describe('fill-in-the-blank cards', () => {
    const at ='courses[0].quizzes[0].cards[0]: '
    const cardOf = (lib: Library) => lib.courses[0].quizzes[0].cards[0]
    const nested = 'The {mitochondria} is the {powerhouse of the {cell}}.'

    it('round-trip on one line, with a list explanation for several blanks', () => {
      const file = { type: 'cloze', statement: nested, explanation: ['DNA', '', 'unit "of" life'] }
      const lib = fromData(withCard(file))
      const read = { type: 'cloze', statement: nested, explanation: ['DNA', null, 'unit "of" life'] }
      expect(cardOf(lib)).toMatchObject(read)
      const json = libraryToJson(lib)
      expect(json).toContain(
        `{ "type": "cloze", "statement": ${JSON.stringify(nested)}, "explanation": ["DNA", "", "unit \\"of\\" life"] }`,
      )
      expect(cardOf(libraryFromJson(json))).toMatchObject(read)
    })

    it('write plain text for one blank and nothing when all are empty', () => {
      const one = fromData(withCard({ type: 'cloze', statement: 'Water boils at {100 C}.', explanation: 'Sea level' }))
      expect(cardOf(one)).toMatchObject({ explanation: ['Sea level'] })
      expect(libraryToJson(one)).toContain('"statement": "Water boils at {100 C}.", "explanation": "Sea level" }')
      const none = fromData(withCard({ type: 'cloze', statement: nested, explanation: ['', ' ', ''] }))
      expect(libraryToJson(none)).toContain(`{ "type": "cloze", "statement": ${JSON.stringify(nested)} }`)
      expect(cardOf(none)).toMatchObject({ explanation: [null, null, null] })
      expect(cardOf(fromData(withCard({ type: 'cloze', statement: nested })))).toMatchObject({ explanation: [null, null, null] })
    })

    it('keep an opened but empty explanation apart from none only in stored data', () => {
      const stored = structuredClone(library)
      stored.courses[0].quizzes[0].cards = [{ id: 'k', type: 'cloze', statement: nested, explanation: [null, '', 'x'] }]
      expect(checkLibrary(JSON.parse(JSON.stringify(stored)), 'stored')).toEqual(stored)
      expect(libraryToJson(stored)).toContain('"explanation": ["", "", "x"] }')
      expect(() => fromData(withCard({ type: 'cloze', statement: nested, explanation: [null, '', 'x'] }))).toThrow(
        `${at}"explanation" must be text or a list of texts.`,
      )
    })

    it('reject a wrong explanation count, naming the spot', () => {
      expect(() => fromData(withCard({ type: 'cloze', statement: nested, explanation: ['a', 'b'] }))).toThrow(
        `${at}"explanation" has 2 items but the statement has 3 blanks.`,
      )
      expect(() => fromData(withCard({ type: 'cloze', statement: nested, explanation: 'a' }))).toThrow(
        `${at}"explanation" must be a list with one text per blank (3 blanks).`,
      )
      expect(() => fromData(withCard({ type: 'cloze', statement: nested, explanation: [1, 2, 3] }))).toThrow(
        `${at}"explanation" must be text or a list of texts.`,
      )
    })

    it('reject a bad statement, naming the spot', () => {
      expect(() => fromData(withCard({ type: 'cloze', statement: 'The {cell' }))).toThrow(
        `${at}"statement" has a { with no matching }.`,
      )
      expect(() => fromData(withCard({ type: 'cloze', statement: 'a {{cell}}' }))).toThrow(
        `${at}"statement" marks the same text twice.`,
      )
    })

    it('reject an unknown type and term fields', () => {
      expect(() => fromData(withCard({ type: 'pair', statement: 'a' }))).toThrow(`${at}"type" must be "cloze".`)
      expect(() => fromData(withCard({ type: 'cloze', statement: 'a', term: 't' }))).toThrow(`${at}unknown field "term".`)
    })

    it('allow a statement without blanks', () => {
      expect(cardOf(fromData(withCard({ type: 'cloze', statement: 'No blanks' })))).toMatchObject({ explanation: [] })
    })

    it('stay in their group through the file and stored data', () => {
      const card = { type: 'cloze', statement: nested, explanation: ['', '', 'x'] }
      const read = { ...card, explanation: [null, null, 'x'] }
      const file = { version: 1, courses: [{ name: 'c', quizzes: [{ name: 'q', cards: [], groups: [{ name: 'G', cards: [card] }] }] }] }
      const lib = fromData(file)
      const quiz = lib.courses[0].quizzes[0]
      expect(quiz.cards[0]).toMatchObject({ ...read, group: quiz.groups[0].id })
      const again = libraryFromJson(libraryToJson(lib)).courses[0].quizzes[0]
      expect(again.cards[0]).toMatchObject({ ...read, group: again.groups[0].id })
      expect(checkLibrary(JSON.parse(JSON.stringify(lib)), 'stored')).toEqual(lib)
    })
  })
})

