import type { Library } from '../model'

// The only seam between the app and where the library is stored.
// A database adapter later implements this same interface.
export interface StorageAdapter {
  loadLabel: string // button text, e.g. "Open file"
  saveLabel: string // button text, e.g. "Download"
  loadHint: string // button tooltip
  saveHint: string // button tooltip
  /** Resolves null when the user cancels. Throws on unreadable data. */
  load(): Promise<Library | null>
  save(library: Library): Promise<void>
}
