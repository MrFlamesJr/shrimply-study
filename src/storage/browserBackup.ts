import type { Library } from '../model'
import { checkLibrary } from './format'

export type Backup = { library: Library; changedIds: string[] }

// One JSON text in IndexedDB: localStorage only holds a few MB, too little once cards have images.
const DB = 'studyquiz'
const STORE = 'backup'
const KEY = 'library.v1'

let opened: Promise<IDBDatabase> | undefined

// Runs one request in its own transaction and resolves with its result once the transaction is done.
function run<T>(mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  opened ??= new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  return opened.then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = request(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req.result)
        tx.onerror = tx.onabort = () => reject(tx.error ?? req.error)
      }),
  )
}

/** Null when nothing is stored. Rejects when the stored backup cannot be read. */
export async function readBackup(): Promise<Backup | null> {
  const raw: unknown = await run('readonly', (store) => store.get(KEY))
  if (typeof raw !== 'string') return null
  const data = JSON.parse(raw)
  const { changedIds } = data
  if (!Array.isArray(changedIds) || !changedIds.every((id) => typeof id === 'string')) {
    throw new Error('The backup data is malformed.')
  }
  return { library: checkLibrary(data.library, 'stored'), changedIds }
}

/** Resolves false when the browser refused to store it (for example, storage is full). */
export async function writeBackup(backup: Backup): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(JSON.stringify(backup), KEY))
    return true
  } catch {
    return false
  }
}
