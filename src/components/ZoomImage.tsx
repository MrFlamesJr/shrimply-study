import { useEffect, useRef, useState, type PointerEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { CrossIcon } from './Icons'
import { IconButton } from './IconButton'

/**
 * An image that opens big, full screen. A click opens it. With `hover` (a click on it already does something
 * else: flips the flashcard, picks the choice, replaces the image), resting the pointer on it opens it instead:
 * a border traces around it first (CSS, so leaving early cancels it) and the viewer opens when it closes.
 * The viewer closes with its ✕, Esc or a click anywhere. Use it for every image.
 */
export function ZoomImage({ src, alt, className, hover }: { src: string; alt: string; className: string; hover?: boolean }) {
  const [open, setOpen] = useState(false)
  // Hover: no trace after a click, or while the pointer is still on the image after the viewer closed, until
  // the pointer leaves it, so the image doesn't open again on its own.
  const [held, setHeld] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  // Where the pointer last was, to tell whether it is still on the image when the viewer closes.
  const pointer = useRef({ x: -1, y: -1 })
  const track = (e: PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY }
  }

  const show = () => {
    setHeld(true)
    setOpen(true)
  }
  const closed = () => {
    setOpen(false)
    const box = imgRef.current?.getBoundingClientRect()
    const { x, y } = pointer.current
    setHeld(!!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
  }

  const image = <img ref={imgRef} className={className} src={src} alt={alt} />
  return (
    <>
      {hover ? (
        <span
          className={held ? 'zoom-img on-hover is-held' : 'zoom-img on-hover'}
          onPointerMove={track}
          onPointerDown={() => setHeld(true)}
          // The viewer covering the image counts as leaving it; only a real leave clears the hold.
          onPointerLeave={() => !open && setHeld(false)}
          onAnimationEnd={(e) => {
            e.stopPropagation()
            show()
          }}
        >
          {image}
        </span>
      ) : (
        <button type="button" className="zoom-img" aria-label="View image full screen" title="View full screen" onClick={show}>
          {image}
        </button>
      )}
      {/* In the body, as a button around the image can't hold the viewer's ✕. */}
      {open && createPortal(<ImageViewer src={src} alt={alt} onClose={closed} onPointerMove={track} />, document.body)}
    </>
  )
}

const stop = (e: SyntheticEvent) => e.stopPropagation()

function ImageViewer({
  src,
  alt,
  onClose,
  onPointerMove,
}: {
  src: string
  alt: string
  onClose: () => void
  onPointerMove: (e: PointerEvent) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  // The open check covers StrictMode running this twice.
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    // In React a portal's events still reach its parents, so these go no further: a click would flip a
    // flashcard or pick a choice, and closing would also close a card dialog around the image.
    <dialog
      ref={ref}
      className="viewer"
      aria-label="Image"
      onClose={(e) => {
        stop(e)
        onClose()
      }}
      onAnimationEnd={stop}
      onPointerMove={onPointerMove}
      // Any click closes it: the ✕, the image or around it.
      onClick={(e) => {
        stop(e)
        ref.current?.close()
      }}
    >
      <IconButton label="Close" className="viewer-close">
        <CrossIcon />
      </IconButton>
      <img src={src} alt={alt} />
    </dialog>
  )
}
