import type { Library } from '../model'

// The only seam between the workspace and where libraries are stored as files: useWorkspace calls nothing else for
// them. A database adapter later implements this same interface.

/** A local file a library is tied to. `handle` is null where the browser can't write back (Firefox, Safari). */
export type FileRef = { name: string; handle: FileSystemFileHandle | null; size: number; modified: number }

/** One picked file: its library, or why it could not be read. */
export type Opened = { ok: true; library: Library; file: FileRef } | { ok: false; name: string; error: string }

export type SaveResult =
  | { status: 'saved'; file: FileRef }
  | { status: 'changed'; modified: number }
  | { status: 'denied' }
  | { status: 'error'; message: string }

export interface StorageAdapter {
  loadLabel: string // button text, e.g. "Open file"
  saveLabel: string // button text, e.g. "Download"
  loadHint: string // button tooltip
  saveHint: string // button tooltip
  /** Picks files to open: null when nothing was picked. A file that can't be read is reported in its place, never thrown. */
  openFiles(): Promise<Opened[] | null>
  /**
   * Writes the library into the file it is tied to. `expected` is the modified time last seen: when the file has
   * another one, nothing is written ('changed') unless `force`.
   */
  saveInPlace(handle: FileSystemFileHandle, library: Library, expected: number | null, force?: boolean): Promise<SaveResult>
  /** Save as: the picked file, kept (with a handle) where the browser allows, else a download. Null when cancelled. */
  saveAs(library: Library, suggestedName?: string): Promise<FileRef | null>
  /**
   * A copy as a file (Download), under `name` when given. Resolves the saved file's name (as far as the browser says),
   * or null when the user cancelled. Never ties the library to the file.
   */
  download(library: Library, name?: string): Promise<string | null>
  /** True when both are the same file. */
  sameFile(a: FileRef, b: FileRef): Promise<boolean>
}
