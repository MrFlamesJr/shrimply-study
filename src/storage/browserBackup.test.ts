import v2Backup from './fixtures/v2-backup.json?raw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = v2Backup

// A tiny in-memory IndexedDB: one store, requests done at once, transactions complete on the next tick.
function fakeIndexedDb(store: Map<string, unknown>) {
  const request = (result: unknown) => ({ result }) as IDBRequest
  const objectStore = {
    get: (k: string) => request(store.get(k)),
    put: (v: unknown, k: string) => (store.set(k, v), request(k)),
    delete: (k: string) => (store.delete(k), request(undefined)),
    getAllKeys: () => request([...store.keys()]),
  }
  const db = {
    createObjectStore: () => undefined,
    transaction: () => {
      const tx: { oncomplete?: () => void; objectStore: () => typeof objectStore } = { objectStore: () => objectStore }
      setTimeout(() => tx.oncomplete?.())
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
  vi.stubGlobal('indexedDB', fakeIndexedDb(store))
})
afterEach(() => vi.unstubAllGlobals())

describe('readWorkspace', () => {
  it('reads as nothing stored when storage is blocked', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const { readWorkspace } = await import('./browserBackup')
    expect(await readWorkspace()).toEqual({ workspace: null, docs: [], handles: {}, broken: [] })
  })

  it('reads as nothing stored when nothing is', async () => {
    const { readWorkspace } = await import('./browserBackup')
    expect((await readWorkspace()).docs).toEqual([])
  })

  it('moves the single backup into a first document and leaves it as it is', async () => {
    store.set('library.v1', fixture)
    const { readWorkspace } = await import('./browserBackup')
    const first = await readWorkspace()
    expect(first.docs).toHaveLength(1)
    expect(first.workspace?.docs).toEqual([first.docs[0].id])
    expect(store.get('library.v1')).toBe(fixture)
    expect(store.has('doc.' + first.docs[0].id)).toBe(true)
    const second = await readWorkspace()
    expect(second.docs[0].id).toBe(first.docs[0].id)
  })

  it('round trips documents in workspace order, with handles', async () => {
    const { readWorkspace, writeDoc, writeWorkspace, writeHandle, deleteDoc } = await import('./browserBackup')
    const { migrateBackup } = await import('./workspaceRecord')
    const a = migrateBackup(fixture, 'a')
    const b = migrateBackup(fixture, 'b')
    const handle = { name: 'b.shrimp' } as FileSystemFileHandle
    await writeDoc(a)
    await writeDoc(b)
    await writeHandle('b', handle)
    await writeWorkspace({ version: 1, docs: ['b', 'a'], layout: { l: 1 }, explorer: null, ui: null })
    const read = await readWorkspace()
    expect(read.docs.map((d) => d.id)).toEqual(['b', 'a'])
    expect(read.handles).toEqual({ b: handle })
    expect(read.workspace?.layout).toEqual({ l: 1 })
    await deleteDoc('b')
    expect(store.has('handle.b')).toBe(false)
    expect((await readWorkspace()).docs.map((d) => d.id)).toEqual(['a'])
  })

  it('copies an unreadable document aside and lists it', async () => {
    const { readWorkspace, writeWorkspace } = await import('./browserBackup')
    await writeWorkspace({ version: 1, docs: ['x'], layout: null, explorer: null, ui: null })
    store.set('doc.x', '{ broken')
    const read = await readWorkspace()
    expect(read.docs).toEqual([])
    expect(read.broken).toEqual(['x'])
    expect(store.get('broken.doc.x')).toBe('{ broken')
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
