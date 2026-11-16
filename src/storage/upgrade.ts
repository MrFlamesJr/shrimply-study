// The one place that knows older versions of the library format. Every file and the browser backup pass through
// `upgrade` before format.ts reads them, and format.ts only knows the current version (FORMAT_VERSION in model.ts).
//
// Changing what a file or the backup holds (a field or card type added, renamed, removed or read differently):
// - Changes not yet on main share one version. The first change after a release raises FORMAT_VERSION and adds
//   a step below that turns the previous version's data into the new one, in both forms ('new' is a file's
//   library.json, 'stored' the backup with ids and data URL images). A step that only adds something returns the
//   data as it is.
// - A released step never changes, nor do the fixtures of released versions (fixtures/v<N>.json and
//   v<N>-backup.json, added when the version is released); upgrade.test.ts opens every one of them.
import type { Ids } from './format'

type Data = Record<string, unknown>
export type Step = { to: number; changes: string; up: (data: Data, ids: Ids) => Data }

export const STEPS: Step[] = [
  {
    to: 2,
    changes: 'Cards may be "true-false". Term cards may name their sides ("sides"). A library may list its own side types ("sideTypes"). Cards may be "choice" (your own right and wrong answers) or "sequence" (steps in order).',
    up: (data) => data,
  },
  {
    to: 3,
    changes: 'Choice cards have a "mode": "one" (pick one answer, any right answer counts) or "all" (select all that apply). Before, a card with several right answers was "all" and any other "one".',
    up: (data) => {
      // Not shared with other code, so this step never changes with it. Malformed data is left for checkLibrary to report.
      const isObject = (v: unknown): v is Data => typeof v === 'object' && v !== null && !Array.isArray(v)
      const withMode = (card: unknown): unknown => {
        if (!isObject(card) || card.type !== 'choice' || !Array.isArray(card.right)) return card
        const right = new Set(card.right.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean))
        return { ...card, mode: right.size > 1 ? 'all' : 'one' }
      }
      const eachCards = (list: unknown): unknown => (Array.isArray(list) ? list.map((o) => (isObject(o) && Array.isArray(o.cards) ? { ...o, cards: o.cards.map(withMode) } : o)) : list)
      const quiz = (q: unknown): unknown => {
        if (!isObject(q)) return q
        return { ...q, ...(Array.isArray(q.cards) && { cards: q.cards.map(withMode) }), ...('groups' in q && { groups: eachCards(q.groups) }) }
      }
      return { ...data, ...(Array.isArray(data.courses) && { courses: data.courses.map((c) => (isObject(c) && Array.isArray(c.quizzes) ? { ...c, quizzes: c.quizzes.map(quiz) } : c)) }) }
    },
  },
]

/** `data` brought up to the last step's version (FORMAT_VERSION). Throws when its version is not a whole number or is newer than this app. */
export function upgrade(data: unknown, ids: Ids, steps = STEPS): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data // checkLibrary says what is wrong
  const { version } = data as Data
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('"version" must be a whole number.')
  }
  const latest = steps.at(-1)?.to ?? 1
  if (version > latest) {
    throw new Error('This library was made by a newer version of Shrimply Study. Reload the page to update the app, then open it again.')
  }
  return steps.filter((s) => s.to > version).reduce<Data>((d, s) => ({ ...s.up(d, ids), version: s.to }), data as Data)
}
