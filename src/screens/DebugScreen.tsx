import { useRef } from 'react'
import type { Notify } from '../components/Toasts'
import type { ToastKind } from '../logic/pushToast'

const KINDS: ToastKind[] = ['info', 'warning', 'error']
const LONG =
  'This is a long test message that wraps over several lines, to check spacing, the corner badge and the close button.'

// Test tools, reached by typing #/debug. Not linked from the app.
export function DebugScreen({ notify }: { notify: Notify }) {
  // A counter keeps each message unique, so repeated clicks stack instead of replacing each other.
  const count = useRef(0)
  const fire = (kind: ToastKind) => notify(kind, `Test ${kind} ${++count.current}.`)
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Debug</h1>
          <p className="muted">Tools for testing the app.</p>
        </div>
      </header>
      <section>
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
    </>
  )
}
