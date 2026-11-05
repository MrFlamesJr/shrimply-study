import type { Library } from '../model'
import { decodeLibrary, encodeLibrary } from './format'
import type { StorageAdapter } from './StorageAdapter'

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

async function load(): Promise<Library | null> {
  const file = await pickFile()
  if (!file) return null
  return decodeLibrary(new Uint8Array(await file.arrayBuffer()))
}

export async function fetchLibrary(url: string): Promise<Library> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`The file could not be fetched (${response.status}).`)
  return decodeLibrary(new Uint8Array(await response.arrayBuffer()))
}

// Not in TypeScript's DOM types yet (Chromium browsers only).
declare global {
  interface Window {
    showSaveFilePicker?(options: {
      suggestedName: string
      types: { description: string; accept: Record<string, string[]> }[]
    }): Promise<{ createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }> }>
  }
}

/** Resolves false when the user cancelled the save. */
async function save(library: Library): Promise<boolean> {
  const bytes = encodeLibrary(library)
  // A backup is read without name checks, so make sure what is written opens again. The error names the spot.
  decodeLibrary(bytes)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const name = `study-library-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.shrimp`
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'Shrimply Study library', accept: { 'application/zip': ['.shrimp'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(bytes)
      await writable.close()
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false
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
  return true
}

export const fileStorage: StorageAdapter = {
  loadLabel: 'Open file',
  saveLabel: 'Download',
  loadHint: 'Open a .shrimp file. It replaces the library in this browser.',
  saveHint: 'Save your library as a .shrimp file',
  load,
  save,
}
