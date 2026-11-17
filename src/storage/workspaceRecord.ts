import type { Library } from '../model'
import { checkLibrary } from './format'
import type { DriveSource } from './googleDrive'

/**
 * One open document as the browser keeps it. `legacyName` is only read: an older record tied the library to a local
 * file, and it now restores as a browser library under that file's name.
 */
export type DocRecord = {
  id: string
  library: Library
  dirty: boolean
  drive: DriveSource | null
  legacyName?: string
}

/** A file closed but kept in the browser (its record stays): enough to list it and open it again. */
export type ClosedFile = { id: string; name: string; drive: DriveSource | null }

/** The open documents in order; the screen's layout, the Explorer and the rest are the workspace's own JSON. */
export type WorkspaceRecord = {
  version: 1
  docs: string[]
  closed: ClosedFile[]
  layout: unknown
  explorer: unknown
  ui: unknown
}

// A bad Drive note only loses the link to the file, never the library.
const readDrive = (d: unknown): DriveSource | null => {
  const s = d as DriveSource | null
  return s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.md5 === 'string' && typeof s.shared === 'boolean'
    ? { id: s.id, name: s.name, md5: s.md5, shared: s.shared, mine: s.mine === true, trashed: s.trashed === true, ...(typeof s.owner === 'string' && { owner: s.owner }) }
    : null
}

// An old file note (and an old backup's file name) only gives the library a name.
const readLegacyName = (f: unknown): string | undefined => {
  const name = typeof f === 'string' ? f : (f as { name?: unknown } | null)?.name
  return typeof name === 'string' && name !== '' ? name : undefined
}

// A bad entry is skipped; a missing or bad list is empty.
const readClosed = (list: unknown): ClosedFile[] => {
  if (!Array.isArray(list)) return []
  return list.flatMap((c: unknown) => {
    const s = c as { id?: unknown; name?: unknown; drive?: unknown } | null
    if (!s || typeof s.id !== 'string' || s.id === '' || typeof s.name !== 'string') return []
    return [{ id: s.id, name: s.name, drive: readDrive(s.drive) }]
  })
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
    ...legacy(readLegacyName(data.legacyName ?? data.file)),
  }
}

const legacy = (legacyName: string | undefined) => (legacyName === undefined ? {} : { legacyName })

export const docRecordText = (rec: DocRecord): string => JSON.stringify(rec)

export function parseWorkspaceRecord(text: string): WorkspaceRecord {
  const data = JSON.parse(text)
  if (!data || data.version !== 1) throw new Error('The workspace record is of an unknown version.')
  if (!Array.isArray(data.docs) || !data.docs.every((id: unknown) => typeof id === 'string')) {
    throw new Error('The workspace record is malformed.')
  }
  return {
    version: 1,
    docs: data.docs,
    closed: readClosed(data.closed),
    layout: data.layout ?? null,
    explorer: data.explorer ?? null,
    ui: data.ui ?? null,
  }
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
    ...legacy(readLegacyName(data.file)),
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
