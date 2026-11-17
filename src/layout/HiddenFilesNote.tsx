import type { WorkspaceApi } from '../state/useWorkspace'
import { hiddenNote } from '../logic/signOut'

/**
 * Where the open files are listed (the sidebar's Files, the Explorer): how many of the user's own Drive files are
 * hidden while this tab is signed out (or signed in with another account), and Sign in. Nothing while none are.
 */
export function HiddenFilesNote({ ws }: { ws: WorkspaceApi }) {
  if (ws.hiddenDocs === 0) return null
  const signedIn = ws.drive.signedIn()
  return (
    <p className="hidden-files">
      {hiddenNote(ws.hiddenDocs, signedIn)}
      {!signedIn && (
        <button type="button" className="link" onClick={() => void ws.drive.signIn()}>
          Sign in
        </button>
      )}
    </p>
  )
}
