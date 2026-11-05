// A .shrimp file is a zip holding library.json and an images/ folder. There are no ids in the file:
//
// {
//   "version": 1,
//   "courses": [
//     {
//       "name": "Biology",
//       "quizzes": [
//         {
//           "name": "Cells",
//           "cards": [
//             { "term": "Mitochondria", "termImage": "1.webp", "definition": "Powerhouse of the cell", "explanation": "Makes most of the cell's ATP" },
//             { "type": "cloze", "statement": "The {mitochondria} is the {powerhouse of the {cell}}.", "image": "2.png", "explanation": ["Has its own DNA", "", ""] }
//           ],
//           "groups": [
//             { "name": "Organelles", "color": "moss", "cards": [ { "term": "Nucleus", "definition": "Holds the DNA" } ] }
//           ]
//         }
//       ]
//     }
//   ]
// }
//
// Course, quiz and group names can not be empty or only spaces. Two courses, or two quizzes in one course, can not
// have the same name (case, spaces and punctuation do not count): the page address is made from it.
// A group's "color" is optional when reading (a missing one gets the next unused color) and always written.
// A cloze (fill in the blank) card marks its blanks with { } in "statement"; \{ \} \\ are a literal { } \.
// Its "explanation" is optional: plain text when there is one blank, otherwise a list with one entry per blank.
// Images are optional: "termImage", "definitionImage" and a cloze card's "image" name a file in images/ ("1.webp" is
// images/1.webp) whose extension is one of IMAGE_TYPES. Cards with the same image share one file; files no card
// names are ignored. The app numbers the files in the order they are written.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { parseCloze } from '../logic/cloze'
import { plural } from '../logic/plural'
import { nextColor } from '../logic/groups'
import { slug } from '../logic/names'
import { GROUP_COLORS, IMAGE_TYPES, newId } from '../model'
import type { Card, ClozeCard, Course, Group, GroupColor, Library, Quiz, TermCard } from '../model'

const LIBRARY_FILE = 'library.json'

type Ids = 'new' | 'stored'

const list = (items: string[], indent: string): string =>
  items.length === 0 ? '[]' : `[\n${items.map((i) => `${indent}  ${i}`).join(',\n')}\n${indent}]`

// A cloze explanation is left out when empty, plain text for one blank, otherwise a list ("" for a blank without one).
const clozeExplanation = (explanation: (string | null)[]): string =>
  explanation.every((e) => !e?.trim())
    ? ''
    : `, "explanation": ${
        explanation.length === 1 ? JSON.stringify(explanation[0]) : `[${explanation.map((e) => JSON.stringify(e ?? '')).join(', ')}]`
      }`

// Gives an image (a data URL) its file name in images/.
type ImageFile = (src: string) => string

const imageJson = (key: string, src: string | undefined, file: ImageFile): string =>
  src ? `, "${key}": ${JSON.stringify(file(src))}` : ''

const cardJson = (c: Card, file: ImageFile): string =>
  c.type === 'cloze'
    ? `{ "type": "cloze", "statement": ${JSON.stringify(c.statement)}${imageJson('image', c.image, file)}${clozeExplanation(c.explanation)} }`
    : `{ "term": ${JSON.stringify(c.term)}${imageJson('termImage', c.termImage, file)}, "definition": ${JSON.stringify(c.definition)}${imageJson('definitionImage', c.definitionImage, file)}${
        c.explanation?.trim() ? `, "explanation": ${JSON.stringify(c.explanation)}` : ''
      } }`

const groupJson = (name: string, color: GroupColor, cards: Card[], file: ImageFile): string =>
  `{\n              "name": ${JSON.stringify(name)},\n              "color": ${JSON.stringify(color)},\n              "cards": ${list(cards.map((c) => cardJson(c, file)), '              ')}\n            }`

// Ungrouped cards are those whose group is not one of the quiz's groups. Groups are written only when there are some.
// Ungrouped cards are written first, so their images get the lower numbers (file names follow the text).
const quizJson = (q: Quiz, file: ImageFile): string => {
  const ids = new Set(q.groups.map((g) => g.id))
  const cards = list(
    q.cards.filter((c) => !c.group || !ids.has(c.group)).map((c) => cardJson(c, file)),
    '          ',
  )
  const groups =
    q.groups.length === 0
      ? ''
      : `,\n          "groups": ${list(
          q.groups.map((g) => groupJson(g.name, g.color, q.cards.filter((c) => c.group === g.id), file)),
          '          ',
        )}`
  return `{\n          "name": ${JSON.stringify(q.name)},\n          "cards": ${cards}${groups}\n        }`
}

const courseJson = (c: Course, file: ImageFile): string =>
  `{\n      "name": ${JSON.stringify(c.name)},\n      "quizzes": ${list(c.quizzes.map((q) => quizJson(q, file)), '      ')}\n    }`

// "data:image/png;base64,..." is image/png.
const typeOf = (src: string): string => src.slice(5, src.indexOf(';'))

/**
 * The library as library.json text, without ids. `images` collects each distinct image (data URL) with the
 * file name it was given: 1.png, 2.webp and so on, in the order they are written.
 */
export function libraryToJson(library: Library, images = new Map<string, string>()): string {
  const file = (src: string) => {
    let name = images.get(src)
    if (!name) {
      const ext = Object.keys(IMAGE_TYPES).find((e) => IMAGE_TYPES[e] === typeOf(src))
      if (!ext) throw new Error(`An image has a type that can't be saved (${typeOf(src)}).`)
      images.set(src, (name = `${images.size + 1}.${ext}`))
    }
    return name
  }
  return `{\n  "version": 1,\n  "courses": ${list(library.courses.map((c) => courseJson(c, file)), '  ')}\n}\n`
}

/** Parses library.json text. `files` is the rest of the zip, where images are looked up. Throws an Error naming the spot that is wrong. */
export function libraryFromJson(text: string, files: Record<string, Uint8Array> = {}): Library {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error(`library.json is not valid JSON. ${(e as Error).message}`)
  }
  return checkLibrary(data, 'new', files)
}

// The "path: " that starts an error message (nothing at the top).
const at = (path: string) => (path ? `${path}: ` : '')

// Checks that `v` is an object with exactly these fields (plus `id` when ids are stored); `optional` fields may be absent.
function exactFields(v: unknown, path: string, names: string[], ids: Ids, optional: string[] = []): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${at(path)}must be an object.`)
  const required = ids === 'stored' ? ['id', ...names] : names
  const allowed = [...required, ...optional]
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) throw new Error(`${at(path)}unknown field "${key}".`)
  }
  for (const key of required) {
    if (!(key in v)) throw new Error(`${at(path)}"${key}" is missing.`)
  }
  return v as Record<string, unknown>
}

function text(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key]
  if (typeof v !== 'string') throw new Error(`${at(path)}"${key}" must be text.`)
  return v
}

// A course, quiz or group name in a file can not be empty or only spaces. The backup is not checked, so one
// left by an older version still loads (a backup that fails to load is lost).
function name(o: Record<string, unknown>, path: string, ids: Ids): string {
  const v = text(o, 'name', path)
  if (ids === 'new' && !v.trim()) throw new Error(`${at(path)}"name" can not be empty.`)
  return v
}

// Two courses, or two quizzes in one course, can not share a name (see `slug`). Only files are checked, like `name`.
function uniqueNames(list: { name: string }[], path: (i: number) => string, ids: Ids): void {
  if (ids === 'stored') return
  const seen = new Map<string, number>()
  list.forEach(({ name }, i) => {
    const first = seen.get(slug(name))
    if (first !== undefined) {
      throw new Error(`${at(path(i))}"name" is already used by ${path(first)} (case, spaces and punctuation do not count).`)
    }
    seen.set(slug(name), i)
  })
}

function items(o: Record<string, unknown>, key: string, path: string): unknown[] {
  const v = o[key]
  if (!Array.isArray(v)) throw new Error(`${at(path)}"${key}" must be a list.`)
  return v
}

const idOf = (o: Record<string, unknown>, path: string, ids: Ids): string =>
  ids === 'new' ? newId() : text(o, 'id', path)

// Reads an image field as a data URL. In a file it names a file in images/; stored data keeps the data URL.
type ImageRead = (o: Record<string, unknown>, key: string, path: string) => string

function imageReader(ids: Ids, files: Record<string, Uint8Array>): ImageRead {
  const types = Object.values(IMAGE_TYPES)
  const exts = Object.keys(IMAGE_TYPES).map((e) => `.${e}`)
  const read = new Map<string, string>() // a file several cards name is read once, into one shared string
  return (o, key, path) => {
    const value = text(o, key, path)
    const at = `${path}: "${key}"`
    if (ids === 'stored') {
      const type = /^data:([^;,]+);base64,/.exec(value)?.[1]
      if (!type || !types.includes(type)) throw new Error(`${at} must be an image data URL.`)
      return value
    }
    const ext = value.slice(value.lastIndexOf('.') + 1).toLowerCase()
    if (!value.includes('.') || !Object.hasOwn(IMAGE_TYPES, ext)) {
      throw new Error(`${at} must name an image file ending in ${exts.slice(0, -1).join(', ')} or ${exts.at(-1)}.`)
    }
    const bytes = files[`images/${value}`]
    if (!bytes) throw new Error(`${at} names images/${value}, which is not in the file.`)
    let src = read.get(value)
    if (!src) read.set(value, (src = `data:${IMAGE_TYPES[ext]};base64,${btoa(strFromU8(bytes, true))}`))
    return src
  }
}

// Card text loses spaces and empty lines at its start and end; the ones in between stay.
function checkCard(v: unknown, path: string, ids: Ids, image: ImageRead): Card {
  const stored = ids === 'stored' ? ['group'] : []
  if (typeof v === 'object' && v !== null && 'type' in v) {
    return checkCloze(v, path, ids, image, ['image', 'explanation', ...stored])
  }
  const o = exactFields(v, path, ['term', 'definition'], ids, ['termImage', 'definitionImage', 'explanation', ...stored])
  const card: TermCard = {
    id: idOf(o, path, ids),
    term: text(o, 'term', path).trim(),
    definition: text(o, 'definition', path).trim(),
  }
  if ('termImage' in o) card.termImage = image(o, 'termImage', path)
  if ('definitionImage' in o) card.definitionImage = image(o, 'definitionImage', path)
  if ('explanation' in o) card.explanation = text(o, 'explanation', path).trim()
  if ('group' in o) card.group = text(o, 'group', path)
  return card
}

// A fill-in-the-blank card. Its explanation comes back as one entry per blank: missing means none (null),
// plain text needs exactly one blank, a list needs exactly one entry per blank. In the file an empty entry
// means none; stored data also keeps null (none) apart from '' (opened in the editor, still empty).
function checkCloze(v: object, path: string, ids: Ids, image: ImageRead, optional: string[]): ClozeCard {
  const o = exactFields(v, path, ['type', 'statement'], ids, optional)
  const at = `${path}: `
  if (o.type !== 'cloze') throw new Error(`${at}"type" must be "cloze".`)
  const statement = text(o, 'statement', path).trim()
  let count: number
  try {
    count = parseCloze(statement).ranges.length
  } catch (e) {
    throw new Error(`${at}${(e as Error).message}`)
  }
  const notText = `${at}"explanation" must be text or a list of texts.`
  const entry = (x: unknown): string | null => {
    if (x === null && ids === 'stored') return null
    if (typeof x !== 'string') throw new Error(notText)
    const trimmed = x.trim()
    return trimmed === '' && ids === 'new' ? null : trimmed
  }
  let explanation: (string | null)[] = Array<null>(count).fill(null)
  if ('explanation' in o) {
    const e = o.explanation
    if (Array.isArray(e)) {
      if (e.length !== count) {
        throw new Error(`${at}"explanation" has ${plural(e.length, 'item')} but the statement has ${plural(count, 'blank')}.`)
      }
      explanation = e.map(entry)
    } else if (typeof e === 'string') {
      if (count !== 1) throw new Error(`${at}"explanation" must be a list with one text per blank (${plural(count, 'blank')}).`)
      explanation = [entry(e)]
    } else {
      throw new Error(notText)
    }
  }
  const card: ClozeCard = { id: idOf(o, path, ids), type: 'cloze', statement, explanation }
  if ('image' in o) card.image = image(o, 'image', path)
  if ('group' in o) card.group = text(o, 'group', path)
  return card
}

// A file group nests its cards; a stored group is just { id, name } and its cards point to it.
function checkQuiz(v: unknown, path: string, ids: Ids, image: ImageRead): Quiz {
  const o = exactFields(v, path, ['name', 'cards'], ids, ['groups'])
  const cards = items(o, 'cards', path).map((c, i) => checkCard(c, `${path}.cards[${i}]`, ids, image))
  const groups: Group[] = []
  const groupItems = 'groups' in o ? items(o, 'groups', path) : []
  groupItems.forEach((g, i) => {
    const gp = `${path}.groups[${i}]`
    const go = exactFields(g, gp, ids === 'new' ? ['name', 'cards'] : ['name'], ids, ['color'])
    const color = 'color' in go ? go.color : nextColor(groups)
    if (!GROUP_COLORS.some((c) => c === color)) throw new Error(`${gp}: "color" must be one of ${GROUP_COLORS.join(', ')}.`)
    const group: Group = { id: idOf(go, gp, ids), name: name(go, gp, ids), color: color as GroupColor }
    groups.push(group)
    if (ids === 'new') {
      for (const [j, c] of items(go, 'cards', gp).entries()) cards.push({ ...checkCard(c, `${gp}.cards[${j}]`, ids, image), group: group.id })
    }
  })
  if (ids === 'stored') {
    cards.forEach((card, i) => {
      if (card.group !== undefined && !groups.some((g) => g.id === card.group)) {
        throw new Error(`${path}.cards[${i}]: "group" is not one of this quiz's groups.`)
      }
    })
  }
  return { id: idOf(o, path, ids), name: name(o, path, ids), groups, cards }
}

function checkCourse(v: unknown, path: string, ids: Ids, image: ImageRead): Course {
  const o = exactFields(v, path, ['name', 'quizzes'], ids)
  const course = {
    id: idOf(o, path, ids),
    name: name(o, path, ids),
    quizzes: items(o, 'quizzes', path).map((q, i) => checkQuiz(q, `${path}.quizzes[${i}]`, ids, image)),
  }
  uniqueNames(course.quizzes, (i) => `${path}.quizzes[${i}]`, ids)
  return course
}

/**
 * Throws when `data` is not a version 1 library. 'new' is the file format (no ids, fresh ids are added);
 * 'stored' also requires a string `id` on every course, quiz and card and keeps it. A file quiz may nest `groups`
 * with their own `cards`; a stored quiz has `groups: [{ id, name, color }]` (`color` optional, see above) and each card's optional `group` must be one of them.
 * A file's images are looked up in `files` (the zip's other files); stored images are data URLs.
 */
export function checkLibrary(data: unknown, ids: Ids, files: Record<string, Uint8Array> = {}): Library {
  const o = exactFields(data, '', ['version', 'courses'], 'new')
  if (o.version !== 1) throw new Error('"version" must be 1.')
  const image = imageReader(ids, files)
  const courses = items(o, 'courses', '').map((c, i) => checkCourse(c, `courses[${i}]`, ids, image))
  uniqueNames(courses, (i) => `courses[${i}]`, ids)
  return { version: 1, courses }
}

export function encodeLibrary(library: Library): Uint8Array {
  const images = new Map<string, string>()
  const files: Zippable = { [LIBRARY_FILE]: strToU8(libraryToJson(library, images)) }
  // Images are compressed already, so they are stored as they are.
  for (const [src, name] of images) files[`images/${name}`] = [strToU8(atob(src.slice(src.indexOf(',') + 1)), true), { level: 0 }]
  return zipSync(files)
}

export function decodeLibrary(bytes: Uint8Array): Library {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new Error('This is not a .shrimp file.')
  }
  const file = files[LIBRARY_FILE]
  if (!file) throw new Error('The file has no library.json.')
  return libraryFromJson(strFromU8(file), files)
}
