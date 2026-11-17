/**
 * Where an open file lives, in words: its Google Drive file (whose only as far as anyone can tell: "Your" needs a
 * sign-in and Google's word; signed out, nobody knows), the .shrimp file it is tied to, or none yet.
 */
export function whereLine(f: {
  hasFile: boolean
  drive: { shared: boolean; trashed: boolean } | null
  yours: boolean
  signedIn: boolean
}): string {
  if (!f.drive) return f.hasFile ? 'On this device' : 'Only in this browser'
  const whose = f.yours ? 'Your Google Drive' : f.signedIn ? "Someone else's Google Drive" : f.drive.shared ? 'Shared on Google Drive' : 'On Google Drive'
  return `${whose}${f.drive.trashed ? ', in the bin' : ''}`
}
