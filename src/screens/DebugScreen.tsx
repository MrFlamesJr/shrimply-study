import { useRef } from 'react'
import { askConfirm } from '../components/ConfirmDialog'
import { PageHead } from '../components/Page'
import type { Notify } from '../components/Toasts'
import { isMac } from '../kit/shortcuts'
import { plural } from '../logic/plural'
import type { ToastKind } from '../logic/pushToast'
import { quoteName, undoHint } from '../logic/toastText'
import { breakBackup, clearAll, clearBackup } from '../storage/browserBackup'
import { resetPrefs } from '../storage/resetPrefs'
import { href } from '../route'
import type { LibraryApi } from '../state/useWorkspace'
import type { Library } from '../model'
import { JsonSection } from './debug/JsonSection'
import { LibrarySection } from './debug/LibrarySection'
import { TokensSection } from './debug/TokensSection'

const KINDS: ToastKind[] = ['info', 'warning', 'error']
const LONG =
  'This is a long test message that wraps over several lines, to check spacing, the corner badge and the close button.'

// `lib`: the active file, which the tools act on (null when none is open). `ensureDoc`: it, or a new empty one.
// `openLibrary` and `newDoc` open a file beside the others, staying on this page.
type Props = {
  lib: LibraryApi | null
  ensureDoc: () => LibraryApi
  openLibrary: (load: () => Promise<Library>, name: string) => Promise<unknown>
  newDoc: () => void
  /** Once the reset is agreed: waiting saves go first (asking when one can't be saved), then it signs out; false when cancelled. */
  readyToReset: () => Promise<boolean>
  /** The libraries kept only in this browser: open ones and closed ones. */
  browserLibraries: number
  notify: Notify
  debugBar: boolean
  setDebugBar: (on: boolean) => void
}

// Test tools, reached by typing #/_debug. Not linked from the app.
export function DebugScreen({ lib, ensureDoc, openLibrary, newDoc, readyToReset, browserLibraries, notify, debugBar, setDebugBar }: Props) {
  // A counter keeps each message unique, so repeated clicks stack instead of replacing each other.
  const count = useRef(0)
  const fire = (kind: ToastKind) => notify(kind, `Test ${kind} ${++count.current}.`)
  const changeBackup = async (question: string, change: () => Promise<void>) => {
    if (!(await askConfirm(question, 'Continue'))) return
    await change()
    location.reload()
  }
  // A new visit, after asking first: nothing happens before Reset is clicked, and the question lists all it does. Then
  // the waiting saves go (asking when one can't be saved; Cancel there still changes nothing) and this tab signs out
  // (Google keeps the app's permission, as it would for a new browser); the whole browser backup and every preference
  // are forgotten, and a reload also resets what only lasts the session (collapsed groups, debug bar). The app's other
  // tabs are told by `clearAll` and start afresh too (App). Replaced, not assigned, so home isn't shown before the
  // reload.
  const resetVisit = async () => {
    const only =
      browserLibraries === 0 ? '' : `, and the ${browserLibraries === 1 ? 'one library' : plural(browserLibraries, 'library', 'libraries')} kept only in this browser, for good`
    const sure = await askConfirm(
      `After you click Reset, in every tab of the app:

- Saves what is still waiting to be saved, to Google Drive and to files on this device.
- Signs out of Google.
- Closes and forgets every library: the open ones, the closed ones${only}.
- Forgets the tabs and the layout, and which files on this device your libraries save into.
- Forgets the preferences: the theme, the study options, a closed sidebar, and that the welcome page and the Explorer's tip were seen.
- Reloads on the welcome page, as on a first visit.

Libraries on Google Drive and .shrimp files on this device stay where they are, to open again. Download any library kept only in this browser that you want to keep first.`,
      'Reset',
      { danger: true, title: 'Reset to first visit?' },
    )
    if (!sure || !(await readyToReset())) return
    await clearAll()
    resetPrefs()
    history.replaceState(null, '', href({ name: 'home' }))
    location.reload()
  }
  return (
    <>
      <PageHead title="Debug" sub="Tools for testing the app. Not linked anywhere: open #/_debug." />
      <LibrarySection lib={lib} ensureDoc={ensureDoc} openLibrary={openLibrary} newDoc={newDoc} notify={notify} />
      <section className="debug-section">
        <h2>First visit</h2>
        <p className="muted">
          Everything this browser remembers, in every tab of the app: its open and closed libraries, tabs and layout
          (the whole browser backup), the libraries kept only in it, which files on this device its libraries save
          into, the theme, the study options, whether the sidebar was closed, whether the Explorer's right-click tip
          was seen, the last release whose welcome page it showed, and the Google sign-in (each tab's, and the
          account chosen last).
        </p>
        <div className="actions">
          <button
            type="button"
            title="Asks first, then forgets the whole browser backup and every preference, signs out of Google and reloads on home, which is then the welcome page, in every tab of the app; libraries on Google Drive and files on this device stay where they are"
            onClick={resetVisit}
          >
            Reset to first visit
          </button>
        </div>
      </section>
      <section className="debug-section">
        <h2>Debug bar</h2>
        <div className="actions">
          <button type="button" aria-pressed={debugBar} onClick={() => setDebugBar(!debugBar)}>
            {debugBar ? 'Hide debug bar' : 'Show debug bar'}
          </button>
          <p className="muted">
            A small bar on every page: the window size and which layout applies, outlines around every box, slow
            motion, and the controls smaller than a 44px touch target.
          </p>
        </div>
      </section>
      <section className="debug-section">
        <h2>Browser backup</h2>
        <p className="muted">The copy of the open files this browser keeps, which comes back on reload.</p>
        <div className="actions">
          <button type="button" title="Reload the page; the library comes back from the browser backup" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            type="button"
            onClick={() =>
              void changeBackup('Clear the browser backup and reload? Changes you have not downloaded are lost.', clearBackup)
            }
          >
            Clear backup and reload
          </button>
          <button
            type="button"
            onClick={() =>
              void changeBackup(
                'Overwrite the browser backup with broken data and reload? Changes you have not downloaded are lost.',
                breakBackup,
              )
            }
          >
            Break backup and reload
          </button>
        </div>
      </section>
      <section className="debug-section">
        <h2>Toasts</h2>
        <div className="actions">
          <button type="button" onClick={() => fire('info')}>
            Info
          </button>
          <button type="button" onClick={() => fire('warning')}>
            Warning
          </button>
          <button type="button" onClick={() => fire('error')}>
            Error
          </button>
          <button type="button" onClick={() => KINDS.forEach(fire)}>
            One of each
          </button>
          <button type="button" onClick={() => KINDS.concat(KINDS, KINDS, ['info']).forEach(fire)}>
            Ten at once
          </button>
          <button type="button" onClick={() => notify('info', 'Same text every time.')}>
            Same text again
          </button>
          <button type="button" onClick={() => notify('warning', LONG)}>
            Long text
          </button>
          <button
            type="button"
            onClick={() =>
              notify('info', `Deleted the card ${quoteName('The mitochondria is the powerhouse of the cell and makes most of its ATP')}.`, {
                detail: ['From Test library › Biology 101 › Cells and organelles, group Hard ones.', undoHint(isMac(navigator.platform))],
                action: { label: 'Undo', run: () => {} },
              })
            }
          >
            With details
          </button>
          <button
            type="button"
            onClick={() =>
              notify('error', `Couldn't open "Test library". Google Drive is having trouble. Try again later.`, {
                detail: "The problem is on Google's side, not in your library. Your changes are kept here.",
                cause: new Error(
                  '503 backendError: The service is currently unavailable. See https://developers.google.com/workspace/drive/api/guides/handle-errors for more information.',
                ),
              })
            }
          >
            Error with cause
          </button>
        </div>
      </section>
      <JsonSection lib={lib} openLibrary={openLibrary} notify={notify} />
      <TokensSection />
    </>
  )
}
