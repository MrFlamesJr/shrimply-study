// Autosave to Google Drive (asked for): the user's own Drive file saves itself a moment after the last edit, and says
// so quietly on its where line. When a save can't go through it pauses that file and says why (a problem).

/** How long after the last edit the user's own Drive file saves (typing merges into one save). */
export const AUTOSAVE_DELAY = 1500
/** A save that failed for another reason tries again after this long (and on the next edit). */
export const RETRY_DELAY = 30_000
/** How often a Drive file with nothing unsaved looks for a newer version while the page is visible. */
export const SYNC_EVERY = 60_000

/**
 * Why a save is paused: the sign-in ran out or was refused (`signIn`, a click renews it), the browser is offline
 * (`offline`, resumes once back online), the file changed on Google Drive (`conflict`, asks), or anything else
 * (`error`, tried again after RETRY_DELAY).
 */
export type SaveProblem = 'signIn' | 'offline' | 'conflict' | 'error'
/**
 * Where a library's saving stands: saved, waiting to save (`pending`), saving, someone else's Drive file (`viewOnly`,
 * never saved), a browser library (`browser`, kept in this browser only), or paused by a problem.
 */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'viewOnly' | 'browser' | SaveProblem

/** The library is view only: someone else's Drive file, or any Drive file while signed out (asked for). */
export const VIEW_ONLY_TEXT = 'This library is view only. Make a copy to change it.'
export const RENAME_VIEW_ONLY_TEXT = "You can't rename someone else's file. Make a copy to change it."

/** What a document's saving depends on (a workspace document fits). */
export type SaveDoc = { library: object; saved: object | null; drive: { mine: boolean; owner?: string | null } | null; problem: SaveProblem | null }

/**
 * A Drive file not known to be the signed-in user's own is view only; signed out, every Drive file is. One that was
 * known to be another account's own (`owner`) is view only too while this tab is signed in as someone else: autosave
 * never writes into it (an `account` not known yet counts as the same).
 */
export const isViewOnly = (d: Pick<SaveDoc, 'drive'>, signedIn: boolean, account: string | null = null): boolean =>
  !!d.drive && !(signedIn && d.drive.mine && (!d.drive.owner || !account || d.drive.owner === account))

export function saveStatus(d: SaveDoc, o: { signedIn: boolean; account?: string | null; busy: boolean; online: boolean }): SaveStatus {
  if (!d.drive) return 'browser'
  if (isViewOnly(d, o.signedIn, o.account)) return 'viewOnly'
  if (o.busy) return 'saving'
  if (d.problem) return d.problem
  if (d.library === d.saved) return 'saved'
  return o.online ? 'pending' : 'offline'
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
}

/** The status in words, for after the where line ("Your Google Drive · Saved"); none for a browser library. */
export const statusText = (s: SaveStatus): string => TEXT[s]

/** Only a paused save needs the user: the tab's dot, the corner badge, the warn color. */
export const needsAttention = (s: SaveStatus): s is SaveProblem => s === 'signIn' || s === 'offline' || s === 'conflict' || s === 'error'
