// Data model. Everything the app stores lives in one Library object.

// `group` is the id of one of the quiz's groups. `cards` stays flat and in group order (see logic/groups.ts).
// Images (`termImage`, `definitionImage`, a cloze or true-or-false card's `image`) are data URLs of one of the IMAGE_TYPES.
export type TermCard = {
  id: string
  type?: never
  // The names of the two sides; absent means the default pair (SIDE_PRESETS[0]), which is never stored.
  sides?: Sides
  term: string
  termImage?: string
  definition: string
  definitionImage?: string
  explanation?: string
  group?: string
}
// The names shown for a term card's two sides (its `term` and `definition`). The first preset is the default.
export type Sides = [string, string]
export const SIDE_PRESETS: Sides[] = [
  ['Front', 'Back'],
  ['Term', 'Definition'],
  ['Question', 'Answer'],
  ['Word', 'Translation'],
  ['Date', 'Event'],
  ['Symbol', 'Meaning'],
]
// Longest side name you can type (a file may hold a longer one; it opens as is).
export const SIDE_NAME_MAX = 30
// Fill in the blank. `statement` marks blanks inline: "The {mitochondria} is the {powerhouse of the {cell}}." (see logic/cloze.ts).
// `explanation` has one entry per blank, in the order their "{" appear: null for none, '' for one opened but still empty.
export type ClozeCard = { id: string; type: 'cloze'; statement: string; image?: string; explanation: (string | null)[]; group?: string }
// True or false. The student says whether `statement` is true; `answer` is the right one. `image` belongs to the statement.
export type TrueFalseCard = { id: string; type: 'true-false'; statement: string; answer: boolean; image?: string; explanation?: string; group?: string }
// Choice question: your own multiple choice. `right` holds the right answers (one or more) and `wrong` the wrong ones;
// with several right answers the student must pick all of them. `image` belongs to the question.
export type ChoiceCard = {
  id: string
  type: 'choice'
  question: string
  image?: string
  right: string[]
  wrong: string[]
  explanation?: string
  group?: string
}
// Sequence: `steps` (two or more) in their right order, named by `title` ("Phases of mitosis"). `image` belongs to the title.
export type SequenceCard = {
  id: string
  type: 'sequence'
  title: string
  image?: string
  steps: string[]
  explanation?: string
  group?: string
}
export type Card = TermCard | ClozeCard | TrueFalseCard | ChoiceCard | SequenceCard
export const isTermCard = (c: Card): c is TermCard => c.type === undefined
// The name of every kind but a term card, which goes by its sides (the editor's card head, the quiz page's badges).
export const KIND_NAME = { cloze: 'Fill in the blank', 'true-false': 'True or false', choice: 'Choice question', sequence: 'Sequence' }
// The image field of each side of a term card.
export const SIDE_IMAGE = { term: 'termImage', definition: 'definitionImage' } as const
// The image types a card can hold, by file extension (the first one listed is the one written for a type).
export const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}
// Group colors, in the order new groups take them. Each is a theme token --group-<name> (theme/theme-<id>.css).
export const GROUP_COLORS = ['lagoon', 'coral', 'sky', 'sand', 'moss', 'rose', 'clay', 'slate'] as const
export type GroupColor = (typeof GROUP_COLORS)[number]
export type Group = { id: string; name: string; color: GroupColor }
// Themes, the first is the default. Each is a `data-theme` value on <html> (theme/theme-<id>.css).
export const THEMES = [
  { id: 'calm', name: 'Calm' },
  { id: 'arcade', name: 'Neon arcade' },
  { id: 'underwater', name: 'Underwater' },
  { id: 'forest', name: 'Enchanted forest' },
  { id: 'unicorn', name: 'Sassy unicorn' },
  { id: 'quizlet', name: 'Quizlet' },
  { id: 'kahoot', name: 'Kahoot' },
] as const
export type ThemeId = (typeof THEMES)[number]['id']
// Longest group name you can type (a file may hold a longer one; it opens as is).
export const GROUP_NAME_MAX = 50
export type Quiz = { id: string; name: string; groups: Group[]; cards: Card[] }
export type Course = { id: string; name: string; quizzes: Quiz[] }
// The library format's current version. Raise it only together with a step in storage/upgrade.ts.
export const FORMAT_VERSION = 2
// In memory `version` is always FORMAT_VERSION (older data is upgraded on reading).
// `sideTypes` are the user's own side names, never a preset: shared by every course, kept until deleted.
// Every card pair that is not a preset is in the list.
export type Library = { version: number; courses: Course[]; sideTypes?: Sides[] }

export const newId = (): string => crypto.randomUUID()
export const emptyLibrary = (): Library => ({ version: FORMAT_VERSION, courses: [] })

// Study options. `side` is the side shown as the prompt.
export type Side = 'term' | 'definition' | 'mixed'
export const FORMATS = ['flashcards', 'choice', 'typing'] as const
export type Format = (typeof FORMATS)[number]
export type StudyOptions = { side: Side; format: Format; shuffle: boolean }

// One question in a round. `choices` is only set for the 'choice' format and always contains `answer`.
// `side` is the side of a term card shown as the prompt (unset for blanks).
// `blank` is set for fill-in-the-blank cards: the index of the blank being asked.
// `answers` is set when the answer is a list: a choice question's right answers (when there are several, all of them
// must be picked from `choices`) or a sequence's steps in order; `answer` then holds the same as plain text.
// `arrange` is set for a sequence asked as a whole: its shuffled steps are in `choices`, to be placed in order.
// `step` is set for a sequence asked one step at a time: the index of the step asked.
export type Question = {
  cardId: string
  prompt: string
  answer: string
  choices?: string[]
  side?: 'term' | 'definition'
  blank?: number
  answers?: string[]
  arrange?: boolean
  step?: number
}
