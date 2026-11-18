import { FORMATS, type StudyOptions } from '../model'

// The quiz page's study options (mode, order), remembered in this browser (not in the library file). Storage can
// be blocked, empty or hold something old, so each option falls back to its default on its own.
const KEY = 'shrimply-study-options'
const DEFAULT: StudyOptions = { format: 'flashcards', shuffle: true }

export function loadStudyOptions(): StudyOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      format: FORMATS.includes(saved.format) ? saved.format : DEFAULT.format,
      shuffle: typeof saved.shuffle === 'boolean' ? saved.shuffle : DEFAULT.shuffle,
    }
  } catch {
    return DEFAULT
  }
}

export function saveStudyOptions(options: StudyOptions) {
  try {
    localStorage.setItem(KEY, JSON.stringify(options))
  } catch {
    // Not remembered; the options still apply until the page closes.
  }
}
