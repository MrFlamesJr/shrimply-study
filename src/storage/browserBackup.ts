import { newId, type Library } from '../model'
import { checkLibrary } from './format'
import type { DriveSource } from './googleDrive'
import {
  migrateBackup,
  parseDocRecord,
  parseWorkspaceRecord,
  readDrive,
  docRecordText,
  type DocRecord,
  type WorkspaceRecord,
} from './workspaceRecord'

export type { DocRecord, WorkspaceRecord }

/**
 * `drive`: the Google Drive file the library came from or was saved to (none in older backups). `file`: the name of
 * the .shrimp file it was opened from or last downloaded to (none in older backups).
 */
export type Backup = { library: Library; changedIds: string[]; drive: DriveSource | null; file: string | null }

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
  for (const key of await workspaceKeys()) await run('readwrite', (store) => store.delete(key))
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
  let size = typeof raw === 'string' ? raw.length : 0
  for (const key of await workspaceKeys()) {
    const text: unknown = await run('readonly', (store) => store.get(key))
    if (typeof text === 'string') size += text.length
  }
  return size
}

// ---- Many documents: one record each beside the single backup above (same database and version) ----

const WORKSPACE_KEY = 'workspace.v1'
const DOC = 'doc.'
const HANDLE = 'handle.'
const BROKEN_DOC = 'broken.doc.'

// The keys of the workspace's records (not the old backup's, not the broken copies).
async function workspaceKeys(): Promise<string[]> {
  if (!(await openDb().catch(() => null))) return []
  const keys = await run('readonly', (store) => store.getAllKeys())
  return keys.filter((k): k is string => typeof k === 'string' && (k === WORKSPACE_KEY || k.startsWith(DOC) || k.startsWith(HANDLE)))
}

const tab = Math.random().toString(36).slice(2)
const workspaceTabs = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('shrimply-workspace')

type Written = { doc?: string; workspace?: true }

/** Calls the function each time another tab wrote a document or the workspace. Returns the function that stops it. */
export function onWorkspaceWritten(taken: (msg: Written) => void): () => void {
  const listener = (event: MessageEvent) => {
    const { tab: from, ...msg } = event.data as Written & { tab: string }
    if (from !== tab) taken(msg)
  }
  workspaceTabs?.addEventListener('message', listener)
  return () => workspaceTabs?.removeEventListener('message', listener)
}

async function put(key: string, value: unknown, msg: Written): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(value, key))
    workspaceTabs?.postMessage({ tab, ...msg })
    return true
  } catch {
    return false
  }
}

/** Resolves false when the browser refused to store it (for example, storage is full). */
export const writeDoc = (rec: DocRecord): Promise<boolean> => put(DOC + rec.id, docRecordText(rec), { doc: rec.id })

/** Resolves false when the browser refused to store it. */
export const writeWorkspace = (rec: WorkspaceRecord): Promise<boolean> =>
  put(WORKSPACE_KEY, JSON.stringify(rec), { workspace: true })

/** Keeps (or, with null, forgets) the file handle of a document. */
export async function writeHandle(id: string, handle: FileSystemFileHandle | null): Promise<void> {
  if (!(await openDb().catch(() => null))) return
  if (handle) await run('readwrite', (store) => store.put(handle, HANDLE + id))
  else await run('readwrite', (store) => store.delete(HANDLE + id))
}

/** Forgets a document and its file handle. */
export async function deleteDoc(id: string): Promise<void> {
  if (!(await openDb().catch(() => null))) return
  await run('readwrite', (store) => store.delete(DOC + id))
  await run('readwrite', (store) => store.delete(HANDLE + id))
  workspaceTabs?.postMessage({ tab, doc: id })
}

/**
 * Everything the workspace kept. Nothing stored (or storage blocked) reads as an empty workspace. A document that can't
 * be read is copied aside to broken.doc.<id> and its id listed in broken. With no workspace yet, the single
 * backup (library.v1, left as it is) becomes the first document.
 */
export async function readWorkspace(): Promise<{
  workspace: WorkspaceRecord | null
  docs: DocRecord[]
  handles: Record<string, FileSystemFileHandle>
  broken: string[]
}> {
  const none = { workspace: null, docs: [], handles: {}, broken: [] }
  if (!(await openDb().catch(() => null))) return none
  const get = (key: string): Promise<unknown> => run('readonly', (store) => store.get(key))
  const rawWorkspace = await get(WORKSPACE_KEY)
  if (rawWorkspace === undefined) {
    const old = await get(KEY)
    if (typeof old !== 'string') return none
    let rec: DocRecord
    try {
      rec = migrateBackup(old, newId())
    } catch {
      // Kept aside as before (the debug page offers it), never overwritten.
      await keepBrokenBackup()
      return { ...none, broken: [KEY] }
    }
    const workspace: WorkspaceRecord = { version: 1, docs: [rec.id], layout: null, explorer: null, ui: null }
    // The workspace only names the document once it is stored; else the next start migrates library.v1 again.
    if (await writeDoc(rec)) await writeWorkspace(workspace)
    return { workspace, docs: [rec], handles: {}, broken: [] }
  }
  let workspace: WorkspaceRecord | null = null
  if (typeof rawWorkspace === 'string') {
    try {
      workspace = parseWorkspaceRecord(rawWorkspace)
    } catch {
      await run('readwrite', (store) => store.put(rawWorkspace, 'broken.' + WORKSPACE_KEY))
    }
  }
  const keys = await run('readonly', (store) => store.getAllKeys())
  const ids = keys.filter((k): k is string => typeof k === 'string' && k.startsWith(DOC)).map((k) => k.slice(DOC.length))
  const order = workspace?.docs ?? []
  const wanted = [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))]
  const docs: DocRecord[] = []
  const handles: Record<string, FileSystemFileHandle> = {}
  const broken: string[] = []
  for (const id of wanted) {
    const raw = await get(DOC + id)
    try {
      if (typeof raw !== 'string') throw new Error('The document record is malformed.')
      docs.push(parseDocRecord(raw))
    } catch {
      if (typeof raw === 'string') await run('readwrite', (store) => store.put(raw, BROKEN_DOC + id))
      broken.push(id)
      continue
    }
    const handle = await get(HANDLE + id)
    if (handle) handles[id] = handle as FileSystemFileHandle
  }
  return { workspace, docs, handles, broken }
}
