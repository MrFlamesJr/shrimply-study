import { statusText, type SaveStatus } from './autosave'
import { quoteName } from './toastText'

/**
 * Where a library lives, in words: its Google Drive file (whose only as far as anyone can tell: "Your" needs a sign-in
 * and Google's word; signed out, nobody knows), the .shrimp file on this device (`file`, its name: browsers never give
 * a page the folder), or this browser alone, which says it can be lost (asked for: clearing the browser's data, or
 * another device or browser, loses it).
 */
export const BROWSER_ONLY = 'Only in this browser: can be lost'
export function whereLine(f: { drive: { shared: boolean; trashed: boolean } | null; yours: boolean; signedIn: boolean; file?: string | null }): string {
  if (!f.drive) return f.file ? `On this device · ${f.file}` : BROWSER_ONLY
  const whose = f.yours ? 'Your Google Drive' : f.signedIn ? "Someone else's Google Drive" : f.drive.shared ? 'Shared on Google Drive' : 'On Google Drive'
  return `${whose}${f.drive.trashed ? ', in the bin' : ''}`
}

/**
 * The toast after closing a library (it has Reopen): its text, and under More info where it is now and how to open it again. `yours`: the user's own
 * Drive file, as far as anyone can tell (signed in, and Google said so).
 */
export function closedNote(entry: { name: string; drive: unknown; file?: unknown }, yours: boolean): { text: string; detail: string } {
  const text = `Closed ${quoteName(entry.name)}.`
  if (entry.file) return { text, detail: "It's on this device: open it again with Open." }
  if (!entry.drive) return { text, detail: "It's still in this browser: open it again from the Explorer." }
  return {
    text,
    detail: yours ? "It's in your Google Drive: open it again from the Explorer." : "It's on Google Drive: open it again from the Explorer, or from its link.",
  }
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
