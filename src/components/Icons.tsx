import { svgParts } from '../logic/svgIcon'
import arrowUp from '../icons/arrow-up.svg?raw'
import browser from '../icons/browser.svg?raw'
import check from '../icons/check.svg?raw'
import chevronDown from '../icons/chevron-down.svg?raw'
import chevronsLeft from '../icons/chevrons-left.svg?raw'
import chevronsUp from '../icons/chevrons-up.svg?raw'
import cloud from '../icons/cloud.svg?raw'
import cloudAlert from '../icons/cloud-alert.svg?raw'
import cloudOff from '../icons/cloud-off.svg?raw'
import copy from '../icons/copy.svg?raw'
import link from '../icons/link.svg?raw'
import course from '../icons/course.svg?raw'
import cross from '../icons/cross.svg?raw'
import dock from '../icons/dock.svg?raw'
import drive from '../icons/drive.svg?raw'
import eraser from '../icons/eraser.svg?raw'
import fileIcon from '../icons/file.svg?raw'
import folder from '../icons/folder.svg?raw'
import grip from '../icons/grip.svg?raw'
import image from '../icons/image.svg?raw'
import info from '../icons/info.svg?raw'
import more from '../icons/more.svg?raw'
import openMark from '../icons/open.svg?raw'
import pencil from '../icons/pencil.svg?raw'
import play from '../icons/play.svg?raw'
import plus from '../icons/plus.svg?raw'
import pull from '../icons/pull.svg?raw'
import quiz from '../icons/quiz.svg?raw'
import refresh from '../icons/refresh.svg?raw'
import save from '../icons/save.svg?raw'
import share from '../icons/share.svg?raw'
import shrimp from '../icons/shrimp.svg?raw'
import spinner from '../icons/spinner.svg?raw'
import split from '../icons/split.svg?raw'
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

// Pulling changes from Google Drive, or downloading a copy: an arrow down into a tray.
export const PullIcon = icon(pull)

// Saving an open file where it lives: a floppy disk.
export const SaveIcon = icon(save)

// Saving to Google Drive: an arrow up out of a tray (Pull's counterpart).
export const UploadIcon = icon(upload)

export const CheckIcon = icon(check)

// Two chevrons pointing left.
export const ChevronsLeftIcon = icon(chevronsLeft)

// Two chevrons pointing up: the Explorer's Collapse all.
export const ChevronsUpIcon = icon(chevronsUp)

// A folder: the Explorer's Open file.
export const FolderIcon = icon(folder)

// An arrow turning back on itself: the Explorer's Refresh Google Drive.
export const RefreshIcon = icon(refresh)

// The sidebar's open file: a .shrimp file on this device, a library on Google Drive (a plain cloud, never Google's
// logo), or one kept only in this browser (a browser window).
export const FileIcon = icon(fileIcon)

export const CloudIcon = icon(cloud)

// A cloud with a slash (signed out: nothing reaches Google Drive) and a cloud with a mark (a save is paused).
export const CloudOffIcon = icon(cloudOff)

export const CloudAlertIcon = icon(cloudAlert)

// Share (a link), and Make a copy (two sheets).
export const LinkIcon = icon(link)

// Sharing a library: three dots joined by two lines.
export const ShareIcon = icon(share)

// Google Drive: its triangle as three bands (never Google's logo).
export const DriveIcon = icon(drive)

export const CopyIcon = icon(copy)

export const BrowserIcon = icon(browser)

// The sidebar tree's levels under a file: a course (a closed book) and a quiz (two stacked cards).
export const CourseIcon = icon(course)

export const QuizIcon = icon(quiz)

export const PlusIcon = icon(plus)

// A pane cut in two: split a tab group.
export const SplitIcon = icon(split)

// Three dots: a group's menu.
export const MoreIcon = icon(more)

// An arrow coming back into a window: dock a popped-out window into the main one.
export const DockIcon = icon(dock)

// An arrow leaving a square's corner: a link that opens a page in a tab of its own (What's new).
export const OpenIcon = icon(openMark)

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

// Three quarters of a ring, one stroke with round ends: the loading spinner, turned by its `.spinner` box. A path, not a
// border with one side see-through, whose joins Chromium draws as a thin tick that turns with the ring.
export const SpinnerIcon = icon(spinner)

// A tumbleweed spinning along in the wind: a ball with a swirl inside, two spin marks round it and gusts with curled ends
// behind it. Nothing here. Not shown anywhere now; kept for later (asked for).
export const TumbleweedIcon = icon(tumbleweed)

export const PlayIcon = icon(play)

// The brand mark, also public/favicon.svg. Filled shapes, not a line icon: the outline takes the text color.
export const ShrimpIcon = icon(shrimp)
