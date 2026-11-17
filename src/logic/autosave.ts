// Autosave (asked for): the user's own Drive file, and a library tied to a .shrimp file on this device, save themselves
// a moment after the last edit, and say so quietly on their where line. When a save can't go through it pauses that
// file and says why (a problem).

/** How long after the last edit the file saves (typing merges into one save). */
export const AUTOSAVE_DELAY = 1500
/** A save that failed for another reason tries again after this long (and on the next edit). */
export const RETRY_DELAY = 30_000
/** How often a file with nothing unsaved looks for a newer version while the page is visible. */
export const SYNC_EVERY = 60_000

/**
 * Why a save is paused: the sign-in ran out or was refused (`signIn`, a click renews it), the browser is offline
 * (`offline`, resumes once back online), the file changed on Google Drive (`conflict`, asks), or anything else
 * (`error`, tried again after RETRY_DELAY). On this device: the browser needs a click to allow writing to the file
 * (`permission`), or the file was moved or deleted (`missing`, the library is only in this browser now).
 */
export type SaveProblem = 'signIn' | 'offline' | 'conflict' | 'error' | 'permission' | 'missing'
/**
 * Where a library's saving stands: saved, waiting to save (`pending`), saving, someone else's Drive file (`viewOnly`,
 * never saved), a browser library (`browser`, kept in this browser only), or paused by a problem.
 */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'viewOnly' | 'browser' | SaveProblem

/** The library is view only: someone else's Drive file, or any Drive file while signed out (asked for). */
export const VIEW_ONLY_TEXT = 'This library is view only. Make a copy to change it.'
export const RENAME_VIEW_ONLY_TEXT = "You can't rename someone else's file. Make a copy to change it."

/** What a document's saving depends on (a workspace document fits). */
export type SaveDoc = {
  library: object
  saved: object | null
  drive: { mine: boolean; owner?: string | null } | null
  /** The .shrimp file on this device it is tied to. */
  file: object | null
  problem: SaveProblem | null
}

/**
 * A Drive file not known to be the signed-in user's own is view only; signed out, every Drive file is. One that was
 * known to be another account's own (`owner`) is view only too while this tab is signed in as someone else: autosave
 * never writes into it (an `account` not known yet counts as the same).
 */
export const isViewOnly = (d: Pick<SaveDoc, 'drive'>, signedIn: boolean, account: string | null = null): boolean =>
  !!d.drive && !(signedIn && d.drive.mine && (!d.drive.owner || !account || d.drive.owner === account))

export function saveStatus(d: SaveDoc, o: { signedIn: boolean; account?: string | null; busy: boolean; online: boolean }): SaveStatus {
  if (!d.drive && !d.file) return 'browser'
  if (isViewOnly(d, o.signedIn, o.account)) return 'viewOnly'
  if (o.busy) return 'saving'
  if (d.problem) return d.problem
  if (d.library === d.saved) return 'saved'
  // A file on this device saves offline too.
  return o.online || !d.drive ? 'pending' : 'offline'
}

const TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  pending: 'Saving…',
  saving: 'Saving…',
  viewOnly: 'View only',
  browser: '',
  signIn: 'Not saved: sign in again',
  offline: 'Offline: not saved yet',
  conflict: 'Changed on Google Drive',
  error: 'Not saved: trying again soon',
  permission: 'Not saved: allow access',
  missing: 'Moved or deleted: only in this browser now',
}

/**
 * The status in words, for after the where line ("Your Google Drive · Saved"); none for a browser library. `where`: a
 * conflict is a change on Google Drive or on this device.
 */
export const statusText = (s: SaveStatus, where: 'drive' | 'device' | 'browser' = 'drive'): string =>
  s === 'conflict' && where === 'device' ? 'Changed on this device' : TEXT[s]

/** Only a paused save needs the user: the tab's dot, the corner badge, the warn color. */
export const needsAttention = (s: SaveStatus): s is SaveProblem =>
  s === 'signIn' || s === 'offline' || s === 'conflict' || s === 'error' || s === 'permission' || s === 'missing'
