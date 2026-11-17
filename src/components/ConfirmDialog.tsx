import { createRoot } from 'react-dom/client'
import { activeWindow } from '../kit/windows'
import { Modal, closeModal } from './Modal'

/** One button of `askChoice`. */
export type Choice<V> = { label: string; value: V; primary?: boolean; danger?: boolean }

/**
 * Asks a question with several answers in a modal: Cancel, then the choices, the primary one last (where the confirm
 * button of `askConfirm` sits). Resolves the chosen value; Cancel, the ✕, Esc or a click outside resolve null.
 * A blank line in `question` starts a new paragraph.
 */
export function askChoice<V>(question: string, choices: Choice<V>[], options?: { title?: string }): Promise<V | null> {
  return new Promise((resolve) => {
    // In the active window's document (a popped-out pane's popup, or the main one), so the question shows where you work.
    const { document: doc } = activeWindow()
    const host = doc.createElement('div')
    doc.body.appendChild(host)
    const root = createRoot(host)
    let chosen: V | null = null
    const onClose = () => {
      resolve(chosen)
      // Unmount after the close event has finished, not from inside it.
      queueMicrotask(() => {
        root.unmount()
        host.remove()
      })
    }
    const ordered = [...choices.filter((c) => !c.primary), ...choices.filter((c) => c.primary)]
    root.render(
      <Modal title={options?.title ?? 'Are you sure?'} narrow onClose={onClose}>
        {question.split('\n\n').map((part, i) => (
          <p key={i}>{part}</p>
        ))}
        <div className="actions">
          <button type="button" onClick={(e) => closeModal(e.currentTarget)}>
            Cancel
          </button>
          {ordered.map((c) => (
            <button
              key={c.label}
              type="button"
              className={c.danger ? 'danger' : c.primary ? 'primary' : undefined}
              onClick={(e) => {
                chosen = c.value
                closeModal(e.currentTarget)
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </Modal>,
    )
  })
}

/**
 * Asks a yes/no question in a modal (instead of the browser's confirm). Resolves true only for the confirm button.
 * `title` replaces "Are you sure?" where it would read wrong. A blank line in `question` starts a new paragraph.
 */
export async function askConfirm(question: string, confirmLabel: string, options?: { danger?: boolean; title?: string }): Promise<boolean> {
  const confirm = { label: confirmLabel, value: true, primary: !options?.danger, danger: options?.danger }
  return (await askChoice(question, [confirm], { title: options?.title })) === true
}
