import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyLibrary } from '../model'
import { encodeLibrary } from './format'
import { fileStorage, openFiles } from './fileStorage'

// The file input is faked: clicking it answers with the given files.
function stubPicker(files: File[]) {
  const input: { files?: File[]; style: object; listeners: Record<string, () => void> } = { style: {}, listeners: {} }
  vi.stubGlobal('document', {
    createElement: () => ({
      files: undefined as File[] | undefined,
      style: {},
      addEventListener(type: string, fn: () => void) {
        input.listeners[type] = fn
      },
      click() {
        this.files = files
        input.listeners.change?.()
      },
    }),
  })
}

describe('openFiles', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports a file that can not be read in its place and opens the others', async () => {
    const good = new File([encodeLibrary(emptyLibrary()).slice()], 'good.shrimp')
    const bad = new File(['not a zip'], 'bad.shrimp')
    stubPicker([bad, good])
    const opened = await openFiles()
    expect(opened?.map((o) => o.ok)).toEqual([false, true])
    expect(opened?.[0]).toMatchObject({ ok: false, name: 'bad.shrimp' })
    expect(opened?.[1]).toMatchObject({ ok: true, name: 'good.shrimp' })
  })

  it('is null when nothing was picked', async () => {
    stubPicker([])
    expect(await openFiles()).toBeNull()
  })
})

describe('fileStorage', () => {
  it('has the labels and only open and download', () => {
    expect(Object.keys(fileStorage).sort()).toEqual(
      ['download', 'downloadHint', 'downloadLabel', 'openFiles', 'openHint', 'openLabel'],
    )
  })
})
