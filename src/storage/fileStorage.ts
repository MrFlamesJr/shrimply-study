import type { Library } from '../model'
import { decodeLibrary, encodeLibrary } from './format'
import type { StorageAdapter } from './StorageAdapter'
import guideUrl from '../../samples/how-to-use.shrimp?url'
import { fileNameProblem } from '../logic/names'

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.shrimp'
    input.style.display = 'none'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

async function load(): Promise<{ library: Library; name: string } | null> {
  const file = await pickFile()
  if (!file) return null
  return { library: decodeLibrary(new Uint8Array(await file.arrayBuffer())), name: file.name }
}

export async function fetchLibrary(url: string): Promise<Library> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The file could not be fetched (${response.status}).`)
  return decodeLibrary(new Uint8Array(await response.arrayBuffer()))
}

/** The bundled guide (samples/how-to-use.shrimp), offered on the first visit. */
export const loadGuide = () => fetchLibrary(guideUrl)

// Not in TypeScript's DOM types yet (Chromium browsers only).
declare global {
  interface Window {
    showSaveFilePicker?(options: {
      suggestedName: string
      types: { description: string; accept: Record<string, string[]> }[]
    }): Promise<{ name: string; createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }> }>
  }
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

/**
 * Resolves the file's name: the one picked in the save dialog, or the suggested one for a plain download (the browser
 * may still add a number to it). Null when the user cancelled the save.
 */
async function save(library: Library, suggested?: string): Promise<string | null> {
  const bytes = encodeLibrary(library)
  // A backup is read without name checks, so make sure what is written opens again. The error names the spot.
  decodeLibrary(bytes)
  const name = saveName(suggested)
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'Shrimply Study library', accept: { 'application/zip': ['.shrimp'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(bytes)
      await writable.close()
      return handle.name
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null
      throw err
    }
  }
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link) // Firefox needs the link in the document
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

export const fileStorage: StorageAdapter = {
  loadLabel: 'Open file',
  saveLabel: 'Download',
  loadHint: 'Open a .shrimp file. It replaces the library in this browser.',
  saveHint: 'Save your library as a .shrimp file',
  load,
  save,
}
