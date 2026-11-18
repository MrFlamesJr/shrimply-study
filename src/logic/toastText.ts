// Parts of a toast's words that more than one place writes: a name in quotes (cut at a word when long), a trail of
// names like the pane head's crumbs, a card by its name (never its number), and the undo key. Pure.
import { comboLabel } from '../kit/shortcuts'
import type { Card } from '../model'
import { cardName } from './cardStatus'

export const NAME_MAX = 40
// A cut falls at the last space only when it is within this many characters of the limit.
const WORD_REACH = 15

/** A name in quotes, whitespace made single; over NAME_MAX it is cut at a word (or hard) and ends in "…" inside the quotes. */
export function quoteName(name: string): string {
  const flat = name.replace(/\s+/g, ' ').trim()
  if (flat.length <= NAME_MAX) return `"${flat}"`
  const head = flat.slice(0, NAME_MAX + 1)
  const space = head.lastIndexOf(' ')
  const cut = space >= NAME_MAX - WORD_REACH ? head.slice(0, space) : flat.slice(0, NAME_MAX)
  return `"${cut.trimEnd()}…"`
}

/** True when `quoteName` shortens the name, so the full one belongs in the toast's detail. */
export function isCut(name: string): boolean {
  return name.replace(/\s+/g, ' ').trim().length > NAME_MAX
}

/** Where a thing was, for a detail line: "From My notes › Biology › Cells, group Hard ones." */
export function fromLine(path: string, group?: string | null): string {
  return `From ${path}${group ? `, group ${group}` : ''}.`
}

/** The non-empty names joined as a trail: "My notes › Biology › Cells". */
export function trail(...names: (string | null | undefined)[]): string {
  return names.filter(Boolean).join(' › ')
}

/** A card by its name: the card "Mitochondria", or an empty card. */
export function cardRef(card: Card): string {
  const name = cardName(card)
  return name ? `the card ${quoteName(name)}` : 'an empty card'
}

/** The undo key for what was just done to `count` things: "Ctrl+Z puts it back." */
export function undoHint(mac: boolean, count = 1): string {
  return `${comboLabel('Mod+Z', mac)} puts ${count === 1 ? 'it' : 'them'} back.`
}
