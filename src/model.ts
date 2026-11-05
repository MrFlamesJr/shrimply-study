// Data model. Everything the app stores lives in one Library object.

// `group` is the id of one of the quiz's groups. `cards` stays flat and in group order (see logic/groups.ts).
// Images (`termImage`, `definitionImage`, a cloze card's `image`) are data URLs of one of the IMAGE_TYPES.
export type TermCard = {
  id: string
  type?: never
  term: string
  termImage?: string
  definition: string
  definitionImage?: string
  explanation?: string
  group?: string
}
// Fill in the blank. `statement` marks blanks inline: "The {mitochondria} is the {powerhouse of the {cell}}." (see logic/cloze.ts).
// `explanation` has one entry per blank, in the order their "{" appear: null for none, '' for one opened but still empty.
export type ClozeCard = { id: string; type: 'cloze'; statement: string; image?: string; explanation: (string | null)[]; group?: string }
export type Card = TermCard | ClozeCard
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
] as const
export type ThemeId = (typeof THEMES)[number]['id']
// Longest group name you can type (a file may hold a longer one; it opens as is).
export const GROUP_NAME_MAX = 50
export type Quiz = { id: string; name: string; groups: Group[]; cards: Card[] }
export type Course = { id: string; name: string; quizzes: Quiz[] }
export type Library = { version: 1; courses: Course[] }

export const newId = (): string => crypto.randomUUID()
export const emptyLibrary = (): Library => ({ version: 1, courses: [] })

// Study options. `side` is the side shown as the prompt.
export type Side = 'term' | 'definition' | 'mixed'
export const FORMATS = ['flashcards', 'choice', 'typing'] as const
export type Format = (typeof FORMATS)[number]
export type StudyOptions = { side: Side; format: Format; shuffle: boolean }

// One question in a round. `choices` is only set for the 'choice' format and always contains `answer`.
// `side` is the side of a term card shown as the prompt (unset for blanks).
// `blank` is set for fill-in-the-blank cards: the index of the blank being asked.
export type Question = {
  cardId: string
  prompt: string
  answer: string
  choices?: string[]
  side?: 'term' | 'definition'
  blank?: number
}
