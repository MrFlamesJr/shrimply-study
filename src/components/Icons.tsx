import { svgParts } from '../logic/svgIcon'
import arrowUp from '../icons/arrow-up.svg?raw'
import browser from '../icons/browser.svg?raw'
import check from '../icons/check.svg?raw'
import chevronDown from '../icons/chevron-down.svg?raw'
import chevronsLeft from '../icons/chevrons-left.svg?raw'
import cloud from '../icons/cloud.svg?raw'
import cross from '../icons/cross.svg?raw'
import eraser from '../icons/eraser.svg?raw'
import fileIcon from '../icons/file.svg?raw'
import grip from '../icons/grip.svg?raw'
import image from '../icons/image.svg?raw'
import info from '../icons/info.svg?raw'
import pencil from '../icons/pencil.svg?raw'
import play from '../icons/play.svg?raw'
import plus from '../icons/plus.svg?raw'
import pull from '../icons/pull.svg?raw'
import shrimp from '../icons/shrimp.svg?raw'
import trash from '../icons/trash.svg?raw'
import tumbleweed from '../icons/tumbleweed.svg?raw'
import upload from '../icons/upload.svg?raw'

// Hand-drawn icons, one SVG file each in src/icons/. Each is drawn inline (never an <img>), so it takes the text
// color (currentColor) and the theme's tokens (the shrimp's var(--brand-*)) and CSS can size it; hidden from screen
// readers.
const icon = (file: string) => {
  const { props, inner } = svgParts(file)
  return () => <svg {...props} aria-hidden dangerouslySetInnerHTML={{ __html: inner }} />
}

export const PencilIcon = icon(pencil)

export const ChevronDownIcon = icon(chevronDown)

// Six dots in two columns: a handle to drag a sequence's step by.
export const GripIcon = icon(grip)

// Thicker than the others (back to top).
export const ArrowUpIcon = icon(arrowUp)

// Pulling changes from Google Drive: an arrow down into a tray.
export const PullIcon = icon(pull)

// Saving to Google Drive: an arrow up out of a tray (Pull's counterpart).
export const UploadIcon = icon(upload)

export const CheckIcon = icon(check)

// Two chevrons pointing left.
export const ChevronsLeftIcon = icon(chevronsLeft)

// The sidebar's open file: a .shrimp file on this device, a library on Google Drive (a plain cloud, never Google's
// logo), or one kept only in this browser (a browser window).
export const FileIcon = icon(fileIcon)

export const CloudIcon = icon(cloud)

export const BrowserIcon = icon(browser)

export const PlusIcon = icon(plus)

export const CrossIcon = icon(cross)

// A bin with a lid: deletes a card (a ✕ badge only removes an image).
export const TrashIcon = icon(trash)

// A tilted eraser on a line: removes a field that can go (an explanation, answer or step; a ✕ removes a blank, which
// is not a field, and a ✕ badge an image).
export const EraserIcon = icon(eraser)

// A framed picture: a sun over a hill.
export const ImageIcon = icon(image)

// An "i" in a circle: how something works.
export const InfoIcon = icon(info)

// A tumbleweed spinning along in the wind: a ball with a swirl inside, two spin marks round it and gusts with curled ends
// behind it. Nothing here (the sidebar with no courses).
export const TumbleweedIcon = icon(tumbleweed)

export const PlayIcon = icon(play)

// The brand mark, also public/favicon.svg. Filled shapes, not a line icon: the outline takes the text color.
export const ShrimpIcon = icon(shrimp)
