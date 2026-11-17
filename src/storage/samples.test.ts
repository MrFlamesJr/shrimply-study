import { describe, expect, it } from 'vitest'
import { checkLibrary, decodeLibrary, encodeLibrary } from './format'

// The project has no Node types (it is a browser app); only this test reads the disk.
// @ts-expect-error node:fs has no types here
const { readFileSync } = (await import('node:fs')) as { readFileSync: (path: string) => Uint8Array }

// Real files must keep opening: decode, write, decode again gives the same library (ids aside).
const FILES = ['edge-cases', 'how-to-use', 'bio130-les-vers']

function withoutIds(value: unknown, groupNames: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => withoutIds(v, groupNames))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) {
      if (key === 'id') continue
      if (key === 'group' && typeof v === 'string') out[key] = groupNames.get(v) ?? v
      else out[key] = withoutIds(v, groupNames)
    }
    return out
  }
  return value
}

function plain(library: unknown): unknown {
  const groupNames = new Map<string, string>()
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      if (Array.isArray(o.groups)) for (const g of o.groups as { id: string; name: string }[]) groupNames.set(g.id, g.name)
      Object.values(o).forEach(collect)
    }
  }
  collect(library)
  return withoutIds(library, groupNames)
}

describe('sample files', () => {
  for (const name of FILES) {
    it(`${name}.shrimp opens and survives a write`, () => {
      const bytes = new Uint8Array(readFileSync(`samples/${name}.shrimp`))
      const library = decodeLibrary(bytes)
      const again = decodeLibrary(encodeLibrary(library))
      expect(plain(again)).toEqual(plain(library))
    })

    it(`${name}.shrimp survives the browser backup (ids kept)`, () => {
      const library = decodeLibrary(new Uint8Array(readFileSync(`samples/${name}.shrimp`)))
      expect(checkLibrary(JSON.parse(JSON.stringify(library)), 'stored')).toEqual(library)
    })
  }
})
