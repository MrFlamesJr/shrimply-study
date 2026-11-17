import { statusText, type SaveStatus } from './autosave'

/**
 * Where a library lives, in words: its Google Drive file (whose only as far as anyone can tell: "Your" needs a sign-in
 * and Google's word; signed out, nobody knows), the .shrimp file on this device (`file`, its name: browsers never give
 * a page the folder), or this browser alone.
 */
export function whereLine(f: { drive: { shared: boolean; trashed: boolean } | null; yours: boolean; signedIn: boolean; file?: string | null }): string {
  if (!f.drive) return f.file ? `On this device · ${f.file}` : 'Only in this browser'
  const whose = f.yours ? 'Your Google Drive' : f.signedIn ? "Someone else's Google Drive" : f.drive.shared ? 'Shared on Google Drive' : 'On Google Drive'
  return `${whose}${f.drive.trashed ? ', in the bin' : ''}`
}

/**
 * The toast after closing a library (it has Reopen): where it is now and how to open it again. `yours`: the user's own
 * Drive file, as far as anyone can tell (signed in, and Google said so).
 */
export function closedNote(entry: { name: string; drive: unknown; file?: unknown }, yours: boolean): string {
  const closed = `Closed "${entry.name}".`
  if (entry.file) return `${closed} It's on this device: open it again with Open file.`
  if (!entry.drive) return `${closed} It's still in this browser: open it again from the Explorer.`
  return yours
    ? `${closed} It's in your Google Drive: open it again from the Explorer.`
    : `${closed} It's on Google Drive: open it again from the Explorer, or from its link.`
}

/**
 * A library's place with its save status after it, when it has one. A file that is gone says that alone (its place
 * no longer holds). `place` words a change in Drive or on this device.
 */
export function whereWithStatus(where: string, status: SaveStatus, place: 'drive' | 'device' | 'browser' = 'drive'): string {
  const text = statusText(status, place)
  if (status === 'missing') return text
  return text ? `${where} · ${text}` : where
}
