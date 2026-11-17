import type { Library } from '../model'
import { checkLibrary } from './format'
import type { DriveSource } from './googleDrive'

/** One open document as the browser keeps it. `file` is the local file it is tied to (the handle is stored apart). */
export type DocRecord = {
  id: string
  library: Library
  dirty: boolean
  drive: DriveSource | null
  file: { name: string; size: number; modified: number } | null
}

/** The open documents in order; the screen's layout, the Explorer and the rest are the workspace's own JSON. */
export type WorkspaceRecord = { version: 1; docs: string[]; layout: unknown; explorer: unknown; ui: unknown }

// A bad Drive note only loses the link to the file, never the library.
const readDrive = (d: unknown): DriveSource | null => {
  const s = d as DriveSource | null
  return s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.md5 === 'string' && typeof s.shared === 'boolean'
    ? { id: s.id, name: s.name, md5: s.md5, shared: s.shared, mine: s.mine === true, trashed: s.trashed === true }
    : null
}

const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0)

// A bad file note only loses the note.
const readFileNote = (f: unknown): DocRecord['file'] => {
  const s = f as { name?: unknown; size?: unknown; modified?: unknown } | null
  return s && typeof s.name === 'string' ? { name: s.name, size: num(s.size), modified: num(s.modified) } : null
}

export function parseDocRecord(text: string): DocRecord {
  const data = JSON.parse(text)
  if (!data || typeof data.id !== 'string' || data.id === '') throw new Error('The document record has no id.')
  if (typeof data.dirty !== 'boolean') throw new Error('The document record is malformed.')
  return {
    id: data.id,
    library: checkLibrary(data.library, 'stored'),
    dirty: data.dirty,
    drive: readDrive(data.drive),
    file: readFileNote(data.file),
  }
}

export const docRecordText = (rec: DocRecord): string => JSON.stringify(rec)

export function parseWorkspaceRecord(text: string): WorkspaceRecord {
  const data = JSON.parse(text)
  if (!data || data.version !== 1) throw new Error('The workspace record is of an unknown version.')
  if (!Array.isArray(data.docs) || !data.docs.every((id: unknown) => typeof id === 'string')) {
    throw new Error('The workspace record is malformed.')
  }
  return { version: 1, docs: data.docs, layout: data.layout ?? null, explorer: data.explorer ?? null, ui: data.ui ?? null }
}

/** The single-library backup (`library.v1`) as a document of the workspace. */
export function migrateBackup(backupText: string, newId: string): DocRecord {
  const data = JSON.parse(backupText)
  const { changedIds } = data
  if (!Array.isArray(changedIds) || !changedIds.every((id) => typeof id === 'string')) {
    throw new Error('The backup data is malformed.')
  }
  return {
    id: newId,
    library: checkLibrary(data.library, 'stored'),
    dirty: changedIds.length > 0,
    drive: readDrive(data.drive),
    file: typeof data.file === 'string' ? { name: data.file, size: 0, modified: 0 } : null,
  }
}

/** A fingerprint of a text (cyrb53, 53 bits as 14 hex digits): the same text always gives the same one. */
export function textHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
