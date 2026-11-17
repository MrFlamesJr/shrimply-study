import type { Library } from '../model'

// The only seam between the workspace and where libraries are stored as files: useWorkspace calls nothing else for
// them. A database adapter later implements this same interface.

/** A local file a library is tied to. `handle` is null where the browser can't write back (Firefox, Safari). */
export type FileRef = { name: string; handle: FileSystemFileHandle | null; size: number; modified: number }

/** One picked file: its library and file, or why it could not be read. */
export type Opened = { ok: true; library: Library; file: FileRef } | { ok: false; name: string; error: string }

export type SaveResult =
  | { status: 'saved'; file: FileRef }
  /** The file has another modified time than expected: someone else wrote it. */
  | { status: 'changed'; modified: number }
  /** The browser has not allowed writing to the file (and `prompt` was not asked for, or was refused). */
  | { status: 'denied' }
  /** The file was moved or deleted. */
  | { status: 'missing' }
  | { status: 'error'; message: string }

/** What a quiet look at a tied file found. It never asks the browser for anything. */
export type Look =
  | { status: 'ok'; library: Library; file: FileRef }
  | { status: 'missing' }
  /** Reading is not allowed right now (the browser needs a click). */
  | { status: 'permission' }
  | { status: 'error'; message: string }

export interface StorageAdapter {
  openLabel: string // button text, e.g. "Open file"
  openHint: string // button tooltip
  downloadLabel: string // button text, e.g. "Download"
  downloadHint: string // button tooltip
  /** Whether an opened file stays tied to its file and saves into it (Chrome, Edge); else it opens as a copy. */
  readonly savesInPlace: boolean
  /**
   * Picks files to open (one only with `multiple: false`): null when nothing was picked. Where the browser can keep
   * the file, each comes with its handle. A file that can't be read is reported in its place, never thrown.
   */
  openFiles(o?: { multiple?: boolean }): Promise<Opened[] | null>
  /**
   * Writes the library into the file it is tied to. `expected` is the modified time last seen: when the file has
   * another one nothing is written ('changed'), unless `force`. Write permission is only asked for with `prompt`
   * (in a click); otherwise a file the browser has not allowed is 'denied'.
   */
  saveInPlace(
    handle: FileSystemFileHandle,
    library: Library,
    expected: number | null,
    o?: { force?: boolean; prompt?: boolean },
  ): Promise<SaveResult>
  /** Reads a tied file as it is now, without asking permission. */
  look(handle: FileSystemFileHandle): Promise<Look>
  /**
   * A copy as a file (Download), under `name` when given. Resolves the saved file's name (as far as the browser says),
   * or null when the user cancelled. Never ties the library to the file.
   */
  download(library: Library, name?: string): Promise<string | null>
  /** True when both are the same file. */
  sameFile(a: FileRef, b: FileRef): Promise<boolean>
}
