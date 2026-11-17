import {
  migrateBackup,
  parseDocRecord,
  parseWorkspaceRecord,
  docRecordText,
  textHash,
  type DocRecord,
  type WorkspaceRecord,
} from './workspaceRecord'

export type { DocRecord, WorkspaceRecord }

// IndexedDB: localStorage only holds a few MB, too little once cards have images. `library.v1` is the single backup
// of the version before files (one JSON text), read once to become a document (see `migrate`); never written now.
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
        // A write is committed at once rather than when the page next goes idle: one started as the page goes away
        // (pagehide) lands, where an idle page never comes and the unfinished transaction is dropped with it. Never a
        // read: Chromium may then finish it before a large value read is ready in `req.result`.
        if (mode === 'readwrite') tx.commit?.()
      }),
  )
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

/** For the debug page: deletes the stored backup. */
export async function clearBackup(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY))
  for (const key of await workspaceKeys()) await run('readwrite', (store) => store.delete(key))
}

/** For the debug page's reset to first visit: every record the backup holds (the workspace, every document, the closed files, the notes), not just the live ones. */
export async function clearAll(): Promise<void> {
  await run('readwrite', (store) => store.clear())
}

/** For the debug page: stores text that is not a backup (the single one and every document's), to test the startup warning. */
export async function breakBackup(): Promise<void> {
  await run('readwrite', (store) => store.put('{ broken', KEY))
  for (const key of await workspaceKeys()) if (key.startsWith(DOC)) await run('readwrite', (store) => store.put('{ broken', key))
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
// The fingerprint (textHash) of the last library.v1 text that became a document, or was found broken and kept aside.
const MIGRATED = 'migrated.v1'

// The keys of the workspace's records (not the old backup's, not the broken copies).
async function workspaceKeys(): Promise<string[]> {
  if (!(await openDb().catch(() => null))) return []
  const keys = await run('readonly', (store) => store.getAllKeys())
  return keys.filter(
    (k): k is string => typeof k === 'string' && (k === WORKSPACE_KEY || k === MIGRATED || k.startsWith(DOC) || k.startsWith(HANDLE)),
  )
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

/** One document as stored now (another tab may have written it); null when there is none. Rejects when it can't be read. */
export async function readDoc(id: string): Promise<DocRecord | null> {
  if (!(await openDb().catch(() => null))) return null
  const raw: unknown = await run('readonly', (store) => store.get(DOC + id))
  return typeof raw === 'string' ? parseDocRecord(raw) : null
}

/** Resolves false when the browser refused to store it. */
export const writeWorkspace = (rec: WorkspaceRecord): Promise<boolean> =>
  put(WORKSPACE_KEY, JSON.stringify(rec), { workspace: true })

/** The file handle kept for a document (another tab may have stored it); null when there is none or it can't be read. */
export async function readHandle(id: string): Promise<FileSystemFileHandle | null> {
  if (!(await openDb().catch(() => null))) return null
  const handle: unknown = await run('readonly', (store) => store.get(HANDLE + id)).catch(() => undefined)
  return (handle as FileSystemFileHandle | undefined) ?? null
}

/** Keeps (or, with null, forgets) the file handle of a document. */
export async function writeHandle(id: string, handle: FileSystemFileHandle | null): Promise<void> {
  if (!(await openDb().catch(() => null))) return
  if (handle) await run('readwrite', (store) => store.put(handle, HANDLE + id))
  else await run('readwrite', (store) => store.delete(HANDLE + id))
}

/** Forgets a document and its file handle. Closing a browser library does not call this: only Delete from this browser, closing a file on this device and Sign out do. */
export async function deleteDoc(id: string): Promise<void> {
  if (!(await openDb().catch(() => null))) return
  await run('readwrite', (store) => store.delete(DOC + id))
  await run('readwrite', (store) => store.delete(HANDLE + id))
  workspaceTabs?.postMessage({ tab, doc: id })
}

/** A note for the user: library.v1 changed after it had become a document (an older version of the app in another tab). */
export const OLDER_TAB_NOTE = 'Changes made in another tab with an older version of the app were opened as their own file.'

export type ReadWorkspace = {
  workspace: WorkspaceRecord | null
  docs: DocRecord[]
  /** The file handle of each document tied to a file on this device. */
  handles: Record<string, FileSystemFileHandle>
  /** Documents (or library.v1) that could not be read, copied aside. */
  broken: string[]
  /** Documents in `docs` the browser refused to store (a migrated library.v1): write them again. */
  unstored: string[]
  /** Things to tell the user. */
  notes: string[]
}

/**
 * Everything the workspace kept. Nothing stored (or storage blocked) reads as an empty workspace. A document that can't
 * be read is copied aside to broken.doc.<id> and its id listed in broken; the others still load. Docs are the stored
 * records, plus library.v1 (the single backup, always left as it is) as a document whenever its text is new: see
 * `migrate`.
 */
export async function readWorkspace(): Promise<ReadWorkspace> {
  const none: ReadWorkspace = { workspace: null, docs: [], handles: {}, broken: [], unstored: [], notes: [] }
  if (!(await openDb().catch(() => null))) return none
  const get = (key: string): Promise<unknown> => run('readonly', (store) => store.get(key))
  // A copy aside that fails (storage full) loses nothing: the original stays where it is.
  const putAside = (key: string, value: unknown): Promise<boolean> => run('readwrite', (store) => store.put(value, key)).then(() => true, () => false)
  const rawWorkspace = await get(WORKSPACE_KEY).catch(() => undefined)
  let workspace: WorkspaceRecord | null = null
  if (typeof rawWorkspace === 'string') {
    try {
      workspace = parseWorkspaceRecord(rawWorkspace)
    } catch {
      await putAside('broken.' + WORKSPACE_KEY, rawWorkspace)
    }
  }
  const keys = await run('readonly', (store) => store.getAllKeys())
  const ids = keys.filter((k): k is string => typeof k === 'string' && k.startsWith(DOC)).map((k) => k.slice(DOC.length))
  const order = workspace?.docs ?? []
  const wanted = [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))]
  const read: ReadWorkspace = { ...none, workspace }
  for (const id of wanted) {
    let raw: unknown
    try {
      raw = await get(DOC + id)
      if (raw === undefined) continue // closed in another tab since
      if (typeof raw !== 'string') throw new Error('The document record is malformed.')
      read.docs.push(parseDocRecord(raw))
    } catch {
      if (typeof raw === 'string') await putAside(BROKEN_DOC + id, raw)
      read.broken.push(id)
      continue
    }
    const handle = await get(HANDLE + id).catch(() => undefined)
    if (handle) read.handles[id] = handle as FileSystemFileHandle
  }
  await migrate(read, ids, rawWorkspace !== undefined, get, putAside).catch(() => undefined) // library.v1 stays: tried again next start
  return read
}

/**
 * library.v1 as a document, once per text. MIGRATED holds the fingerprint of the last text taken; a new one (the first
 * start of this version, or changes an older version of the app wrote since in another tab) becomes the document
 * `v1-<fingerprint>`, the same id in every tab, so a retry or two tabs at once write one record. A document already
 * stored under that id is never overwritten (it may have been edited since). The fingerprint is written only once the
 * document is stored, so a refused write is tried again next start; a document closed since stays closed.
 */
async function migrate(
  read: ReadWorkspace,
  ids: string[],
  hadWorkspace: boolean,
  get: (key: string) => Promise<unknown>,
  putAside: (key: string, value: unknown) => Promise<boolean>,
): Promise<void> {
  const old = await get(KEY)
  if (typeof old !== 'string') return
  const hash = textHash(old)
  const marker = await get(MIGRATED)
  if (marker === hash) return
  const id = `v1-${hash}`
  let rec: DocRecord
  try {
    rec = migrateBackup(old, id)
  } catch {
    // Kept aside as before (the debug page offers it), and told once.
    if (await keepBrokenBackup().then(() => true, () => false)) await putAside(MIGRATED, hash)
    read.broken.push(KEY)
    return
  }
  // Already a document: under this id, or (an earlier build of this version gave it a random id) with the same courses.
  const same = JSON.stringify(rec.library)
  if (ids.includes(id) || read.docs.some((d) => JSON.stringify(d.library) === same)) {
    await putAside(MIGRATED, hash)
    return
  }
  read.docs.push(rec)
  if (await writeDoc(rec)) await putAside(MIGRATED, hash)
  else read.unstored.push(id)
  // Not the first start of this version: an older one changed library.v1 since (a retry is not news).
  if (marker !== undefined || (hadWorkspace && !(read.workspace?.docs ?? []).includes(id))) read.notes.push(OLDER_TAB_NOTE)
}
