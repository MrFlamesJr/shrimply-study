import { useEffect, useState } from 'react'
import type { WorkspaceApi } from '../state/useWorkspace'
import { CloudIcon } from '../components/Icons'

/**
 * The sidebar's account box, right under the corner, the one place the Google account lives (shown only when Drive is
 * set up). Signed out: what that means and a Sign in button (a secondary one: the page's gold button stays alone).
 * Signed in (`bottom`): one slim line just above the sidebar's footer: icon, the account's email, Switch account and Sign out.
 */
export function AccountBox({ drive, bottom = false }: { drive: WorkspaceApi['drive']; bottom?: boolean }) {
  const signedIn = drive.signedIn()
  const signedAs = drive.signedAs()
  // The account is known with the sign-in (kept with it in this tab). Only an older sign-in that lost it asks Google,
  // and only while that needs no popup: an hour-old sign-in renews on the next click, never on its own (a popup
  // without a click is blocked, which said "Allow pop-ups" and hid the email).
  const [asked, setAsked] = useState<string | null>(null)
  useEffect(() => {
    if (!bottom || !signedIn || signedAs || !drive.canListQuietly()) return setAsked(null)
    let live = true
    void drive.account().then((a) => live && setAsked(a))
    return () => {
      live = false
    }
  }, [signedIn, signedAs])
  const email = signedAs ?? asked

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
      <button type="button" className="link" title="Sign in with another Google account in this tab; other tabs keep theirs" onClick={() => void drive.switchAccount()}>
        Switch account
      </button>
      <button type="button" className="link" title="Sign out of Google in this tab" onClick={() => void drive.signOut()}>
        Sign out
      </button>
    </div>
  )
}
