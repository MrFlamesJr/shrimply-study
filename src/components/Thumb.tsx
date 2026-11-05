import { ZoomImage } from './ZoomImage'

/**
 * A card side's image as a small square preview, to go next to its text wherever that text shows. A click opens
 * it big; `hover` where a click already does something else (a choice), so resting the pointer opens it.
 */
export function Thumb({ src, alt, hover }: { src?: string; alt: string; hover?: boolean }) {
  return src ? <ZoomImage src={src} alt={alt} className="thumb" hover={hover} /> : null
}
