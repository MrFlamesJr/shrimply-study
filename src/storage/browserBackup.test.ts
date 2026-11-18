import v2Backup from './fixtures/v2-backup.json?raw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = v2Backup
// The same backup after an edit in an older version of the app: another course name.
const edited = v2Backup.replace('"name": "Biology"', '"name": "Biology, edited"')

// A tiny in-memory IndexedDB: one store, requests done at once, transactions complete on the next tick. A put to a
// key `failing` picks stores nothing and aborts its transaction (as when storage is full).
let failing: (key: string) => boolean = () => false
function fakeIndexedDb(store: Map<string, unknown>) {
  const request = (result: unknown) => ({ result }) as IDBRequest
  const db = {
    createObjectStore: () => undefined,
    transaction: () => {
      let failed = false
      const objectStore = {
        get: (k: string) => request(store.get(k)),
        put: (v: unknown, k: string) => (failing(k) ? (failed = true) : store.set(k, v), request(k)),
        delete: (k: string) => (store.delete(k), request(undefined)),
        getAllKeys: () => request([...store.keys()]),
      }
      const tx: { oncomplete?: () => void; onabort?: () => void; objectStore: () => typeof objectStore } = { objectStore: () => objectStore }
      setTimeout(() => (failed ? tx.onabort?.() : tx.oncomplete?.()))
      return tx
    },
  }
  return {
    open: () => {
      const req = { result: db } as unknown as IDBOpenDBRequest
      setTimeout(() => req.onsuccess?.(new Event('success')))
      return req
    },
  }
}

let store: Map<string, unknown>

beforeEach(() => {
  vi.resetModules()
  store = new Map()
  failing = () => false
  vi.stubGlobal('indexedDB', fakeIndexedDb(store))
})
afterEach(() => vi.unstubAllGlobals())

const docKeys = () => [...store.keys()].filter((k) => k.startsWith('doc.'))

describe('readWorkspace', () => {
  it('reads as nothing stored when storage is blocked', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { readWorkspace } = await import('./browserBackup')
    expect(await readWorkspace()).toEqual({ workspace: null, docs: [], handles: {}, broken: [], unstored: [], notes: [] })
  })

  it('reads as nothing stored when nothing is', async () => {
    const { readWorkspace } = await import('./browserBackup')
    expect((await readWorkspace()).docs).toEqual([])
  })

  it('moves the single backup into a document once, and leaves it as it is', async () => {
    store.set('library.v1', fixture)
    const { readWorkspace } = await import('./browserBackup')
    const first = await readWorkspace()
    expect(first.docs).toHaveLength(1)
    expect(first.docs[0].id).toMatch(/^v1-[0-9a-f]{14}$/)
    expect(first).toMatchObject({ unstored: [], notes: [], broken: [] })
    expect(store.get('library.v1')).toBe(fixture)
    expect(docKeys()).toEqual(['doc.' + first.docs[0].id])
    const second = await readWorkspace()
    expect(second.docs.map((d) => d.id)).toEqual([first.docs[0].id])
    expect(docKeys()).toHaveLength(1)
  })

  it('shows a migrated document the browser refused to store, flagged, and stores it on the next start', async () => {
    store.set('library.v1', fixture)
    failing = (k) => k.startsWith('doc.')
    const { readWorkspace } = await import('./browserBackup')
    const first = await readWorkspace()
    expect(first.docs).toHaveLength(1)
    expect(first.unstored).toEqual([first.docs[0].id])
    expect(store.has('migrated.v1')).toBe(false)
    failing = () => false
    const second = await readWorkspace()
    expect(second.docs.map((d) => d.id)).toEqual([first.docs[0].id])
    expect(second).toMatchObject({ unstored: [], notes: [] })
    expect(store.has('doc.' + first.docs[0].id)).toBe(true)
    expect(store.has('migrated.v1')).toBe(true)
  })

  it('two tabs migrating at once write one document', async () => {
    store.set('library.v1', fixture)
    const tab1 = await import('./browserBackup')
    vi.resetModules()
    const tab2 = await import('./browserBackup')
    expect(tab1).not.toBe(tab2)
    const [a, b] = await Promise.all([tab1.readWorkspace(), tab2.readWorkspace()])
    expect(a.docs.map((d) => d.id)).toEqual(b.docs.map((d) => d.id))
    expect(docKeys()).toHaveLength(1)
    expect((await tab1.readWorkspace()).docs).toHaveLength(1)
  })

  it('opens what an older version wrote to the single backup since as another document, once, with a note', async () => {
    store.set('library.v1', fixture)
    const { readWorkspace, writeWorkspace } = await import('./browserBackup')
    const first = await readWorkspace()
    await writeWorkspace({ version: 1, docs: [first.docs[0].id], closed: [], layout: null, explorer: null, ui: null })
    store.set('library.v1', edited)
    const second = await readWorkspace()
    expect(second.docs.map((d) => d.library.courses[0].name)).toEqual(['Biology', 'Biology, edited'])
    expect(second.notes).toHaveLength(1)
    const third = await readWorkspace()
    expect(third.docs).toHaveLength(2)
    expect(third.notes).toEqual([])
  })

  it('never brings back a migrated document that was closed', async () => {
    store.set('library.v1', fixture)
    const { readWorkspace, deleteDoc } = await import('./browserBackup')
    const first = await readWorkspace()
    await deleteDoc(first.docs[0].id)
    expect((await readWorkspace()).docs).toEqual([])
    expect(store.get('library.v1')).toBe(fixture)
  })

  it('takes a document an earlier build migrated under another id as the migration', async () => {
    const { migrateBackup } = await import('./workspaceRecord')
    const { readWorkspace, writeDoc } = await import('./browserBackup')
    await writeDoc(migrateBackup(fixture, 'random'))
    store.set('library.v1', fixture)
    expect((await readWorkspace()).docs.map((d) => d.id)).toEqual(['random'])
    expect(store.has('migrated.v1')).toBe(true)
  })

  it('keeps an unreadable single backup aside and says so once', async () => {
    store.set('library.v1', '{ broken')
    const { readWorkspace } = await import('./browserBackup')
    expect((await readWorkspace()).broken).toEqual(['library.v1'])
    expect(store.get('broken.v1')).toBe('{ broken')
    expect((await readWorkspace()).broken).toEqual([])
  })

  it('round trips documents in workspace order', async () => {
    const { readWorkspace, writeDoc, writeWorkspace, deleteDoc } = await import('./browserBackup')
    const { migrateBackup } = await import('./workspaceRecord')
    const a = migrateBackup(fixture, 'a')
    const b = migrateBackup(fixture, 'b')
    await writeDoc(a)
    await writeDoc(b)
    await writeWorkspace({ version: 1, docs: ['b', 'a'], closed: [], layout: { l: 1 }, explorer: null, ui: null })
    const read = await readWorkspace()
    expect(read.docs.map((d) => d.id)).toEqual(['b', 'a'])
    expect(read.workspace?.layout).toEqual({ l: 1 })
    await deleteDoc('b')
    expect((await readWorkspace()).docs.map((d) => d.id)).toEqual(['a'])
  })

  it('copies an unreadable document aside and lists it', async () => {
    const { readWorkspace, writeWorkspace } = await import('./browserBackup')
    await writeWorkspace({ version: 1, docs: ['x'], closed: [], layout: null, explorer: null, ui: null })
    store.set('doc.x', '{ broken')
    const read = await readWorkspace()
    expect(read.docs).toEqual([])
    expect(read.broken).toEqual(['x'])
    expect(store.get('broken.doc.x')).toBe('{ broken')
  })

  it('loads the other documents when copying a broken one aside fails', async () => {
    const { readWorkspace, writeDoc } = await import('./browserBackup')
    const { migrateBackup } = await import('./workspaceRecord')
    await writeDoc(migrateBackup(fixture, 'a'))
    store.set('doc.x', '{ broken')
    store.set('workspace.v1', '{ broken')
    failing = (k) => k.startsWith('broken.')
    const read = await readWorkspace()
    expect(read.docs.map((d) => d.id)).toEqual(['a'])
    expect(read.broken).toEqual(['x'])
    expect(read.workspace).toBeNull()
    expect(store.get('doc.x')).toBe('{ broken')
  })

  it('clearBackup clears the workspace keys too, and backupSize counts them', async () => {
    store.set('library.v1', 'abc')
    store.set('doc.q', 'defg')
    const { clearBackup, backupSize } = await import('./browserBackup')
    expect(await backupSize()).toBe(7)
    await clearBackup()
    expect([...store.keys()]).toEqual([])
  })
})
