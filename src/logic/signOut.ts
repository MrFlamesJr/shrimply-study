// Signing out of Google with the user's own Drive files open (asked for): nothing is ever lost. They are saved and
// closed first, or kept hidden until that account signs in again (workspace.isHidden).
import { plural } from './plural'

/**
 * Save all and sign out: saves each file with changes, then, once every save went through, closes them all and signs
 * out. A failed save stops it there: nothing is closed and the tab stays signed in. Resolves the ids that failed.
 */
export async function saveAllThenSignOut(
  files: { id: string; dirty: boolean }[],
  o: { save(id: string): Promise<boolean>; close(ids: string[]): void; signOut(): void },
): Promise<string[]> {
  const failed: string[] = []
  for (const f of files) if (f.dirty && !(await o.save(f.id))) failed.push(f.id)
  if (failed.length > 0) return failed
  o.close(files.map((f) => f.id))
  o.signOut()
  return []
}

/**
 * Where the open files are listed: how many are hidden, and why. Signed out it never says "your" (nobody can tell
 * whose they are then); signed in, they belong to another account.
 */
export function hiddenNote(count: number, signedIn: boolean): string {
  const files = plural(count, 'Google Drive file')
  const are = count === 1 ? 'is' : 'are'
  return signedIn
    ? `${files} of another Google account ${are} hidden. Sign out, then sign in with that account to see ${count === 1 ? 'it' : 'them'}.`
    : `${files} ${are} hidden until you sign in.`
}

/** A hidden file's tab, in place of its page. */
export const hiddenFileText = (signedIn: boolean): string =>
  signedIn
    ? 'This file is in the Google Drive of another Google account. Sign out, then sign in with that account to see it.'
    : 'This file is in the Google Drive of the account that was signed in. Sign in to see it.'
