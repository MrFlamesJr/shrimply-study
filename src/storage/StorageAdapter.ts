import type { Library } from '../model'

// The only seam between the app and where the library is stored.
// A database adapter later implements this same interface.
export interface StorageAdapter {
  loadLabel: string // button text, e.g. "Open file"
  saveLabel: string // button text, e.g. "Download"
  loadHint: string // button tooltip
  saveHint: string // button tooltip
  /** The library and the picked file's name. Resolves null when the user cancels. Throws on unreadable data. */
  load(): Promise<{ library: Library; name: string } | null>
  /**
   * Saves under `name` (the file it came from) when given. Resolves the saved file's name (as far as the browser
   * says), or null when the user cancelled, so nothing was saved.
   */
  save(library: Library, name?: string): Promise<string | null>
}
