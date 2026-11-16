import { describe, expect, it } from 'vitest'
import { emptyLibrary } from '../model'
import { decodeLibrary } from './format'
import { sameFile, saveInPlace, type FileRef } from './fileStorage'

type Fake = { handle: FileSystemFileHandle; content: () => Uint8Array | null; writes: () => number }

function fake(options: {
  modified?: number
  permission?: PermissionState
  requested?: PermissionState
  failWrite?: boolean
}): Fake {
  let content: Uint8Array | null = null
  let modified = options.modified ?? 100
  let writes = 0
  const handle = {
    name: 'a.shrimp',
    queryPermission: async () => options.permission ?? 'granted',
    requestPermission: async () => options.requested ?? 'denied',
    getFile: async () => new File([content?.slice() ?? new Uint8Array()], 'a.shrimp', { lastModified: modified }),
    isSameEntry: async (other: unknown) => other === handle,
    createWritable: async () => {
      let pending: Uint8Array | null = null
      return {
        write: async (data: Uint8Array) => {
          writes++
          if (options.failWrite) throw new Error('disk full')
          pending = data
        },
        close: async () => {
          content = pending
          modified += 1
        },
        abort: async () => undefined,
      }
    },
  } as unknown as FileSystemFileHandle
  return { handle, content: () => content, writes: () => writes }
}

describe('saveInPlace', () => {
  it('saves, and the bytes reopen', async () => {
    const f = fake({})
    const result = await saveInPlace(f.handle, emptyLibrary(), 100)
    expect(result.status).toBe('saved')
    if (result.status === 'saved') {
      expect(result.file.modified).toBe(101)
      expect(result.file.size).toBeGreaterThan(0)
      expect(result.file.handle).toBe(f.handle)
    }
    expect(() => decodeLibrary(f.content()!)).not.toThrow()
  })

  it('saves when nothing was seen yet', async () => {
    expect((await saveInPlace(fake({}).handle, emptyLibrary(), null)).status).toBe('saved')
  })

  it('writes nothing when the file changed', async () => {
    const f = fake({ modified: 200 })
    expect(await saveInPlace(f.handle, emptyLibrary(), 100)).toEqual({ status: 'changed', modified: 200 })
    expect(f.writes()).toBe(0)
  })

  it('writes over a changed file when forced', async () => {
    expect((await saveInPlace(fake({ modified: 200 }).handle, emptyLibrary(), 100, true)).status).toBe('saved')
  })

  it('asks for permission once, and stops when denied', async () => {
    const granted = fake({ permission: 'prompt', requested: 'granted' })
    expect((await saveInPlace(granted.handle, emptyLibrary(), null)).status).toBe('saved')
    const denied = fake({ permission: 'prompt', requested: 'denied' })
    expect((await saveInPlace(denied.handle, emptyLibrary(), null)).status).toBe('denied')
    expect(denied.writes()).toBe(0)
    expect((await saveInPlace(fake({ permission: 'denied' }).handle, emptyLibrary(), null)).status).toBe('denied')
  })

  it('leaves the old content when the write fails', async () => {
    const f = fake({ failWrite: true })
    expect(await saveInPlace(f.handle, emptyLibrary(), null)).toEqual({ status: 'error', message: 'disk full' })
    expect(f.content()).toBeNull()
  })
})

describe('sameFile', () => {
  const ref = (over: Partial<FileRef>): FileRef => ({ name: 'a.shrimp', handle: null, size: 1, modified: 2, ...over })

  it('compares handles when both have one', async () => {
    const a = fake({}).handle
    const b = fake({}).handle
    expect(await sameFile(ref({ handle: a }), ref({ handle: a }))).toBe(true)
    expect(await sameFile(ref({ handle: a }), ref({ handle: b }))).toBe(false)
  })

  it('else compares name, size and modified time', async () => {
    expect(await sameFile(ref({}), ref({}))).toBe(true)
    expect(await sameFile(ref({}), ref({ size: 2 }))).toBe(false)
    expect(await sameFile(ref({}), ref({ modified: 3 }))).toBe(false)
    expect(await sameFile(ref({}), ref({ name: 'b.shrimp' }))).toBe(false)
    expect(await sameFile(ref({ handle: fake({}).handle }), ref({}))).toBe(true)
  })
})
