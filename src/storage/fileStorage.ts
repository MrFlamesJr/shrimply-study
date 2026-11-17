import type { Library } from '../model'
import { decodeLibrary, encodeLibrary } from './format'
import type { Opened, StorageAdapter } from './StorageAdapter'
import guideUrl from '../../samples/how-to-use.shrimp?url'
import { fileNameProblem } from '../logic/names'

function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.shrimp'
    input.multiple = true
    input.style.display = 'none'
    input.addEventListener('change', () => resolve([...(input.files ?? [])]))
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

export async function fetchLibrary(url: string): Promise<Library> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The file could not be fetched (${response.status}).`)
  return decodeLibrary(new Uint8Array(await response.arrayBuffer()))
}

/** The bundled guide (samples/how-to-use.shrimp), offered on the first visit. */
export const loadGuide = () => fetchLibrary(guideUrl)

// Not in TypeScript's DOM types yet (Chromium browsers only).
type PickerType = { description: string; accept: Record<string, string[]> }
declare global {
  interface Window {
    showSaveFilePicker?(options: { suggestedName: string; types: PickerType[] }): Promise<FileSystemFileHandle>
  }
}

const PICKER_TYPES: PickerType[] = [{ description: 'Shrimply Study library', accept: { 'application/zip': ['.shrimp'] } }]

// Reading can fail too (a cloud file that won't download): reported like a broken one.
async function readFile(file: File): Promise<Opened> {
  try {
    const library = decodeLibrary(new Uint8Array(await file.arrayBuffer()))
    return { ok: true, library, name: file.name }
  } catch (err) {
    return { ok: false, name: file.name, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Null when nothing was picked. A broken file is reported in its place, never thrown. */
export async function openFiles(): Promise<Opened[] | null> {
  const files = await pickFiles()
  if (files.length === 0) return null
  return Promise.all(files.map(readFile))
}

/** `suggested` with its .shrimp ending, or a dated name when there is none or it can't be a file name. */
function saveName(suggested?: string): string {
  const base = suggested?.trim().replace(/\.shrimp$/i, '')
  // A Drive file renamed in Drive may have lost its ending, or taken a character a file name can't hold.
  if (base && !fileNameProblem(base)) return `${base}.shrimp`
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `study-library-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.shrimp`
}

// A backup is read without name checks, so make sure what is written opens again. The error names the spot.
function encodeChecked(library: Library): Uint8Array {
  const bytes = encodeLibrary(library)
  decodeLibrary(bytes)
  return bytes
}

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link) // Firefox needs the link in the document
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The save dialog's handle, written; null when the user cancelled.
async function pickAndWrite(bytes: Uint8Array, name: string): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await window.showSaveFilePicker!({ suggestedName: name, types: PICKER_TYPES })
    const writable = await handle.createWritable()
    await writable.write(bytes.slice())
    await writable.close()
    return handle
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

/**
 * Resolves the file's name: the one picked in the save dialog, or the suggested one for a plain download (the browser
 * may still add a number to it). Never keeps a handle. Null when the user cancelled the save.
 */
async function downloadCopy(library: Library, suggested?: string): Promise<string | null> {
  const bytes = encodeChecked(library)
  const name = saveName(suggested)
  if (window.showSaveFilePicker) return (await pickAndWrite(bytes, name))?.name ?? null
  download(bytes, name)
  return name
}

export const fileStorage: StorageAdapter = {
  openLabel: 'Open file',
  openHint: 'Open .shrimp files. Each opens beside the files already open.',
  downloadLabel: 'Download',
  downloadHint: 'Download a copy of this library as a .shrimp file',
  openFiles,
  download: downloadCopy,
}
