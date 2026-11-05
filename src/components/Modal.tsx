import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'
import { CrossIcon } from './Icons'
import { IconButton } from './IconButton'

/** A press on the backdrop: the dialog itself is the target (no child) and the point is outside its box. */
const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
  const box = e.currentTarget.getBoundingClientRect()
  const { clientX: x, clientY: y } = e
  return e.target === e.currentTarget && (x < box.left || x > box.right || y < box.top || y > box.bottom)
}

/**
 * A native modal dialog with a title and a ✕. Focus trap, Esc and the backdrop come from the browser.
 * Every exit goes through dialog.close() (the ✕, Esc, a click outside it, or `closeModal` from a button
 * inside), so focus returns to the button that opened it before `onClose` unmounts it.
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
  // A click outside closes it only when the press also started outside, so selecting text and letting go
  // past the edge doesn't.
  const pressedOutside = useRef(false)

  // The open check covers StrictMode running this twice. showModal focuses the ✕ (first in order),
  // so the first text field takes focus after it.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    dialog.querySelector<HTMLElement>('textarea, input')?.focus()
  }, [])

  return (
    <dialog
      ref={ref}
      className={narrow ? 'dialog is-narrow' : 'dialog'}
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(e) => (pressedOutside.current = onBackdrop(e))}
      onClick={(e) => pressedOutside.current && onBackdrop(e) && ref.current?.close()}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <IconButton label="Close" onClick={() => ref.current?.close()}>
          <CrossIcon />
        </IconButton>
      </div>
      {children}
    </dialog>
  )
}

/** Closes the modal around an element inside it, the same way the ✕ does. */
export const closeModal = (inside: Element) => inside.closest('dialog')?.close()
