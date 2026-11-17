import type { Library } from '../model'

// The only seam between the workspace and where libraries are stored as files: useWorkspace calls nothing else for
// them. A database adapter later implements this same interface.

/** One picked file: its library and name, or why it could not be read. */
export type Opened = { ok: true; library: Library; name: string } | { ok: false; name: string; error: string }

export interface StorageAdapter {
  openLabel: string // button text, e.g. "Open file"
  openHint: string // button tooltip
  downloadLabel: string // button text, e.g. "Download"
  downloadHint: string // button tooltip
  /** Picks files to open: null when nothing was picked. A file that can't be read is reported in its place, never thrown. */
  openFiles(): Promise<Opened[] | null>
  /**
   * A copy as a file (Download), under `name` when given. Resolves the saved file's name (as far as the browser says),
   * or null when the user cancelled. Never ties the library to the file.
   */
  download(library: Library, name?: string): Promise<string | null>
}
