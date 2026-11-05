import { useEffect, useId, useRef, type ReactNode } from 'react'
import { CrossIcon } from './Icons'

/**
 * A native modal dialog with a title and a ✕. Focus trap, Esc and the backdrop come from the browser.
 * Every exit goes through dialog.close() (the ✕, Esc, or `closeModal` from a button inside), so focus
 * returns to the button that opened it before `onClose` unmounts it.
 */
export function Modal({
  title,
  narrow,
  onClose,
  children,
}: {
  title: string
  narrow?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // The open check covers StrictMode running this twice. showModal focuses the ✕ (first in order),
  // so the first text field takes focus after it.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('textarea, input')?.focus()
  }, [])

  return (
    <dialog ref={ref} className={narrow ? 'dialog is-narrow' : 'dialog'} aria-labelledby={titleId} onClose={onClose}>
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={() => ref.current?.close()}>
          <CrossIcon />
        </button>
      </div>
      {children}
    </dialog>
  )
}

/** Closes the modal around an element inside it, the same way the ✕ does. */
export const closeModal = (inside: Element) => inside.closest('dialog')?.close()
