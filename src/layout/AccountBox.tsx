import { useEffect, useState } from 'react'
import type { WorkspaceApi } from '../state/useWorkspace'
import { CloudIcon } from '../components/Icons'

/**
 * The sidebar's account box, right under the corner, the one place the Google account lives (shown only when Drive is
 * set up). Signed out: what that means and a Sign in button (a secondary one: the page's gold button stays alone).
 * Signed in (`bottom`): one slim line just above the sidebar's footer: icon, the account's email and Sign out.
 */
export function AccountBox({ drive, bottom = false }: { drive: WorkspaceApi['drive']; bottom?: boolean }) {
  const signedIn = drive.signedIn()
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    if (!signedIn) return setEmail(null)
    let live = true
    void drive.account().then((a) => live && setEmail(a))
    return () => {
      live = false
    }
  }, [signedIn])

  // Signed out it sits at the top of the sidebar, signed in at the bottom: each place renders only its own state.
  if (signedIn !== bottom) return null
  if (!signedIn) {
    return (
      <div className="account-box">
        <p className="account-title">Not signed in</p>
        <p className="account-note">Your libraries stay only in this browser. Sign in to save them to your Google Drive as you work.</p>
        <button type="button" className="account-sign-in" onClick={() => void drive.signIn()}>
          <CloudIcon /> Sign in with Google
        </button>
      </div>
    )
  }
  return (
    <div className="account-box is-signed-in">
      <CloudIcon />
      <span className="account-email" title={email ?? undefined}>
        {email ?? 'Signed in'}
      </span>
      <button type="button" className="link" title="Sign out of Google in this tab" onClick={() => void drive.signOut()}>
        Sign out
      </button>
    </div>
  )
}
