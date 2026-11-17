import type { Library } from '../model'
import { decodeLibrary, encodeLibrary } from './format'
import type { FileRef, Opened, SaveResult, StorageAdapter } from './StorageAdapter'
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
    showOpenFilePicker?(options: { multiple: boolean; types: PickerType[] }): Promise<FileSystemFileHandle[]>
  }
  interface FileSystemHandle {
    queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
    requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  }
}

const PICKER_TYPES: PickerType[] = [{ description: 'Shrimply Study library', accept: { 'application/zip': ['.shrimp'] } }]

// Getting the file can fail too (deleted since it was picked, a cloud file that won't download): reported like a broken one.
async function readFile(getFile: () => Promise<File>, name: string, handle: FileSystemFileHandle | null): Promise<Opened> {
  try {
    const file = await getFile()
    const library = decodeLibrary(new Uint8Array(await file.arrayBuffer()))
    return { ok: true, library, file: { name: file.name, handle, size: file.size, modified: file.lastModified } }
  } catch (err) {
    return { ok: false, name, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Null when nothing was picked. A broken file is reported in its place, never thrown (a failing picker throws). */
export async function openFiles(): Promise<Opened[] | null> {
  if (window.showOpenFilePicker) {
    let handles: FileSystemFileHandle[]
    try {
      handles = await window.showOpenFilePicker({ multiple: true, types: PICKER_TYPES })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      throw err
    }
    if (handles.length === 0) return null
    return Promise.all(handles.map((handle) => readFile(() => handle.getFile(), handle.name, handle)))
  }
  const files = await pickFiles()
  if (files.length === 0) return null
  return Promise.all(files.map((file) => readFile(async () => file, file.name, null)))
}

/**
 * Writes the library into the file it came from. `expected` is the modified time last seen: when the file has another
 * one, nothing is written ('changed') unless `force`. The file is only replaced when the write closes.
 */
export async function saveInPlace(
  handle: FileSystemFileHandle,
  library: Library,
  expected: number | null,
  force = false,
): Promise<SaveResult> {
  try {
    let permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
    if (permission === 'prompt') permission = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied'
    if (permission !== 'granted') return { status: 'denied' }
    const current = await handle.getFile()
    if (expected !== null && current.lastModified !== expected && !force) {
      return { status: 'changed', modified: current.lastModified }
    }
    const bytes = encodeChecked(library)
    const writable = await handle.createWritable()
    try {
      await writable.write(bytes.slice())
      await writable.close()
    } catch (err) {
      await writable.abort?.().catch(() => undefined)
      throw err
    }
    const written = await handle.getFile()
    return { status: 'saved', file: { name: handle.name, handle, size: written.size, modified: written.lastModified } }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/** True when both are the same file on disk (or, with no handles, by name, size and modified time). */
export async function sameFile(a: FileRef, b: FileRef): Promise<boolean> {
  if (a.handle && b.handle) return a.handle.isSameEntry(b.handle)
  return a.name === b.name && a.size === b.size && a.modified === b.modified
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

/** Save as: the picked file is kept (a handle) where the browser allows, else a download. Null when cancelled. */
async function saveAs(library: Library, suggestedName?: string): Promise<FileRef | null> {
  const bytes = encodeChecked(library)
  const name = saveName(suggestedName)
  if (window.showSaveFilePicker) {
    const handle = await pickAndWrite(bytes, name)
    if (!handle) return null
    const written = await handle.getFile()
    return { name: handle.name, handle, size: written.size, modified: written.lastModified }
  }
  download(bytes, name)
  return { name, handle: null, size: bytes.length, modified: Date.now() }
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
  loadLabel: 'Open file',
  saveLabel: 'Download',
  loadHint: 'Open .shrimp files. Each opens beside the files already open.',
  saveHint: 'Download a copy of this library as a .shrimp file',
  openFiles,
  saveInPlace,
  saveAs,
  download: downloadCopy,
  sameFile,
}
