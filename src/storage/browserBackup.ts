import type { Library } from '../model'
import { checkLibrary } from './format'
import type { DriveSource } from './googleDrive'

/**
 * `drive`: the Google Drive file the library came from or was saved to (none in older backups). `file`: the name of
 * the .shrimp file it was opened from or last downloaded to (none in older backups).
 */
export type Backup = { library: Library; changedIds: string[]; drive: DriveSource | null; file: string | null }

// A bad Drive note only loses the link to the file, never the library.
const readDrive = (d: unknown): DriveSource | null => {
  const s = d as DriveSource | null
  return s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.md5 === 'string' && typeof s.shared === 'boolean'
    ? { id: s.id, name: s.name, md5: s.md5, shared: s.shared, mine: s.mine === true, trashed: s.trashed === true }
    : null
}

// One JSON text in IndexedDB: localStorage only holds a few MB, too little once cards have images.
const DB = 'studyquiz'
const STORE = 'backup'
const KEY = 'library.v1'
const BROKEN_KEY = 'broken.v1'

let opened: Promise<IDBDatabase> | undefined

// The database, opened once. Rejects when the browser keeps nothing for the site (storage blocked, as in some
// private windows).
function openDb(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  return opened
}

// Runs one request in its own transaction and resolves with its result once the transaction is done.
function run<T>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = request(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = tx.onabort = () => reject(tx.error ?? req.error)
      }),
  )
}

/**
 * Null when nothing is stored, or when this browser keeps nothing for the site (storage blocked, as in some private
 * windows: then there is nothing to read, and nothing broken). Rejects when the stored backup cannot be read.
 */
export async function readBackup(): Promise<Backup | null> {
  // Only storage that can't be opened at all counts as nothing stored: a failed read is a backup that can't be read.
  if (!(await openDb().catch(() => null))) return null
  const raw: unknown = await run('readonly', (store) => store.get(KEY))
  if (typeof raw !== 'string') return null
  const data = JSON.parse(raw)
  const { changedIds } = data
  if (!Array.isArray(changedIds) || !changedIds.every((id) => typeof id === 'string')) {
    throw new Error('The backup data is malformed.')
  }
  // A bad file name only loses the name.
  const file = typeof data.file === 'string' ? data.file : null
  return { library: checkLibrary(data.library, 'stored'), changedIds, drive: readDrive(data.drive), file }
}

/** Copies the stored backup text aside, so an unreadable backup survives the next backup write. */
export async function keepBrokenBackup(): Promise<void> {
  const raw: unknown = await run('readonly', (store) => store.get(KEY))
  if (typeof raw === 'string') await run('readwrite', (store) => store.put(raw, BROKEN_KEY))
}

/** The text kept by `keepBrokenBackup`, null when there is none. */
export async function readBrokenBackup(): Promise<string | null> {
  const raw: unknown = await run('readonly', (store) => store.get(BROKEN_KEY))
  return typeof raw === 'string' ? raw : null
}

// Every tab of the site shares the one backup. A tab that writes it tells the others, which take it up, so no tab
// writes over a change made in another (BroadcastChannel never tells the tab that sent it).
const tabs = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('shrimply-backup')

/** Calls `taken` each time another tab of the site wrote the backup. Returns the function that stops it. */
export function onBackupWritten(taken: () => void): () => void {
  tabs?.addEventListener('message', taken)
  return () => tabs?.removeEventListener('message', taken)
}

/** Resolves false when the browser refused to store it (for example, storage is full). */
export async function writeBackup(backup: Backup): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(JSON.stringify(backup), KEY))
    tabs?.postMessage('written')
    return true
  } catch {
    return false
  }
}

/** For the debug page: deletes the stored backup. */
export async function clearBackup(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY))
}

/** For the debug page: stores text that is not a backup, to test the startup warning. */
export async function breakBackup(): Promise<void> {
  await run('readwrite', (store) => store.put('{ broken', KEY))
}

/** For the debug page: what this site stores in the browser and how much it may store, in bytes; null when unknown. */
export async function storageUse(): Promise<{ used: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage, quota } = await navigator.storage.estimate()
  return usage === undefined || quota === undefined ? null : { used: usage, quota }
}

/** For the debug page: the stored text's length, 0 when nothing is stored. */
export async function backupSize(): Promise<number> {
  const raw: unknown = await run('readonly', (store) => store.get(KEY))
  return typeof raw === 'string' ? raw.length : 0
}
