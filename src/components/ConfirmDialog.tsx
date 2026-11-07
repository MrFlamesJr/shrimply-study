import { createRoot } from 'react-dom/client'
import { Modal, closeModal } from './Modal'

/**
 * Asks a yes/no question in a modal (instead of the browser's confirm). Resolves true only for the confirm button.
 * `title` replaces "Are you sure?" where it would read wrong. A blank line in `question` starts a new paragraph.
 */
export function askConfirm(question: string, confirmLabel: string, options?: { danger?: boolean; title?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    let confirmed = false
    const onClose = () => {
      resolve(confirmed)
      // Unmount after the close event has finished, not from inside it.
      queueMicrotask(() => {
        root.unmount()
        host.remove()
      })
    }
    root.render(
      <Modal title={options?.title ?? 'Are you sure?'} narrow onClose={onClose}>
        {question.split('\n\n').map((part, i) => (
          <p key={i}>{part}</p>
        ))}
        <div className="actions">
          <button type="button" onClick={(e) => closeModal(e.currentTarget)}>
            Cancel
          </button>
          <button
            type="button"
            className={options?.danger ? 'danger' : 'primary'}
            onClick={(e) => {
              confirmed = true
              closeModal(e.currentTarget)
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </Modal>,
    )
  })
}
