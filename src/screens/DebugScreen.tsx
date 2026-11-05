import { useRef } from 'react'
import { askConfirm } from '../components/ConfirmDialog'
import { PageHead } from '../components/Page'
import type { Notify } from '../components/Toasts'
import type { ToastKind } from '../logic/pushToast'
import { breakBackup, clearBackup } from '../storage/browserBackup'
import type { LibraryApi } from '../state/useLibrary'
import { JsonSection } from './debug/JsonSection'
import { LibrarySection } from './debug/LibrarySection'
import { TokensSection } from './debug/TokensSection'

const KINDS: ToastKind[] = ['info', 'warning', 'error']
const LONG =
  'This is a long test message that wraps over several lines, to check spacing, the corner badge and the close button.'

type Props = { lib: LibraryApi; notify: Notify; debugBar: boolean; setDebugBar: (on: boolean) => void }

// Test tools, reached by typing #/_debug. Not linked from the app.
export function DebugScreen({ lib, notify, debugBar, setDebugBar }: Props) {
  // A counter keeps each message unique, so repeated clicks stack instead of replacing each other.
  const count = useRef(0)
  const fire = (kind: ToastKind) => notify(kind, `Test ${kind} ${++count.current}.`)
  const changeBackup = async (question: string, change: () => Promise<void>) => {
    if (!(await askConfirm(question, 'Continue'))) return
    await change()
    location.reload()
  }
  return (
    <>
      <PageHead title="Debug" sub="Tools for testing the app. Not linked anywhere: open #/_debug." />
      <LibrarySection lib={lib} notify={notify} />
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
        <p className="muted">The copy of the library this browser keeps, which comes back on reload.</p>
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
        </div>
      </section>
      <JsonSection lib={lib} notify={notify} />
      <TokensSection />
    </>
  )
}
