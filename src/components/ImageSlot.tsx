import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { IMAGE_TYPES } from '../model'
import { ImageIcon } from './Icons'

const TYPES = Object.values(IMAGE_TYPES)
// Longest side of a stored image: bigger ones are scaled down. Text in a diagram still reads at this size.
const MAX_SIDE = 1600

/**
 * The image as a data URL, made smaller where it can be: scaled down to MAX_SIDE, and saved as WebP when that is
 * smaller (or the browser's fallback, PNG). GIFs (they may move) and SVGs stay as they are.
 */
async function readImage(file: Blob): Promise<string> {
  let blob = file
  if (file.type !== 'image/gif' && file.type !== 'image/svg+xml') {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
    if (encoded && (scale < 1 || encoded.size < file.size)) blob = encoded
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const imageIn = (data: DataTransfer) => [...data.files].find((f) => TYPES.includes(f.type))

type Props = {
  src?: string
  /** What the image belongs to, for the buttons' names: "Add an image to <label>". */
  label: string
  onChange: (src: string | undefined) => void
  /** The field the image goes with. */
  children: ReactNode
}

/**
 * A field with room for one image beside it: a small button that picks one, or once set, its square thumbnail
 * (click to replace) with a remove badge hanging over its corner. Both take the same square and the badge takes
 * no room, so the field never moves. Pasting or dropping an image on the field sets it too; pasted text stays text.
 */
export function ImageSlot({ src, label, onChange, children }: Props) {
  const input = useRef<HTMLInputElement>(null)
  // Reading an image takes a moment and the card may change meanwhile, so the result goes to the newest onChange.
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  })
  // How many images are being read: a spinner takes the slot's square until they are done.
  const [loading, setLoading] = useState(0)
  // A file that can't be read as an image is ignored.
  const use = (file: File | undefined) => {
    if (!file) return
    setLoading((n) => n + 1)
    readImage(file)
      .then((s) => latest.current(s), () => {})
      .finally(() => setLoading((n) => n - 1))
  }
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault() // a dropped file would otherwise open in the tab
    use(imageIn(e.dataTransfer))
  }

  return (
    <span
      className="image-slot"
      onPaste={(e) => {
        const file = e.clipboardData.getData('text/plain') ? undefined : imageIn(e.clipboardData)
        if (!file) return
        e.preventDefault()
        use(file)
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={onDrop}
    >
      {children}
      {loading > 0 ? (
        <span className="image-loading" role="status" aria-label="Loading image" title="Loading image">
          <span className="spinner" />
        </span>
      ) : src ? (
        <span className="image-set">
          <button
            type="button"
            className="thumb-btn"
            title="Replace image"
            aria-label={`Replace the image of ${label}`}
            onClick={() => input.current?.click()}
          >
            <img className="thumb" src={src} alt="" />
          </button>
          <button
            type="button"
            className="image-remove"
            title="Remove image"
            aria-label={`Remove the image of ${label}`}
            onClick={() => onChange(undefined)}
          >
            ✕
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="icon-btn"
          title="Add an image (or paste or drop one on the field)"
          aria-label={`Add an image to ${label}`}
          onClick={() => input.current?.click()}
        >
          <ImageIcon />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={TYPES.join(',')}
        hidden
        onChange={(e) => {
          use(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </span>
  )
}
