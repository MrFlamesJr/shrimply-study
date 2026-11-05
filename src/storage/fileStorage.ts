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

async function save(library: Library): Promise<void> {
  const url = URL.createObjectURL(new Blob([encodeLibrary(library).slice()], { type: 'application/zip' }))
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const link = document.createElement('a')
  link.href = url
  link.download = `study-library-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.shrimp`
  document.body.append(link) // Firefox needs the link in the document
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const fileStorage: StorageAdapter = {
  loadLabel: 'Open file',
  saveLabel: 'Download',
  loadHint: 'Open a .shrimp file. It replaces the library in this browser.',
  saveHint: 'Save your library as a .shrimp file',
  load,
  save,
}
