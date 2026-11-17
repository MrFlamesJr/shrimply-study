import { statusText, type SaveStatus } from './autosave'

/**
 * Where a library lives, in words: its Google Drive file (whose only as far as anyone can tell: "Your" needs a sign-in
 * and Google's word; signed out, nobody knows), or this browser alone.
 */
export function whereLine(f: { drive: { shared: boolean; trashed: boolean } | null; yours: boolean; signedIn: boolean }): string {
  if (!f.drive) return 'Only in this browser'
  const whose = f.yours ? 'Your Google Drive' : f.signedIn ? "Someone else's Google Drive" : f.drive.shared ? 'Shared on Google Drive' : 'On Google Drive'
  return `${whose}${f.drive.trashed ? ', in the bin' : ''}`
}

/**
 * The toast after closing a library (it has Reopen): where it is now and how to open it again. `yours`: the user's own
 * Drive file, as far as anyone can tell (signed in, and Google said so).
 */
export function closedNote(entry: { name: string; drive: unknown }, yours: boolean): string {
  const closed = `Closed "${entry.name}".`
  if (!entry.drive) return `${closed} It's still in this browser: open it again from the Explorer.`
  return yours
    ? `${closed} It's in your Google Drive: open it again from the Explorer.`
    : `${closed} It's on Google Drive: open it again from the Explorer, or from its link.`
}

/** A library's place with its save status after it, when it has one. */
export function whereWithStatus(where: string, status: SaveStatus): string {
  return statusText(status) ? `${where} · ${statusText(status)}` : where
}
