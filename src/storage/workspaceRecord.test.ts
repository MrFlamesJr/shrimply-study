import v1Backup from './fixtures/v1-backup.json?raw'
import v2Backup from './fixtures/v2-backup.json?raw'
import { describe, expect, it } from 'vitest'
import { checkLibrary } from './format'
import { docRecordText, migrateBackup, parseDocRecord, parseWorkspaceRecord, textHash } from './workspaceRecord'

const fixtures: Record<string, string> = { 'v1-backup.json': v1Backup, 'v2-backup.json': v2Backup }
const fixture = (name: string) => fixtures[name]

describe('migrateBackup', () => {
  for (const name of ['v1-backup.json', 'v2-backup.json']) {
    it(`turns ${name} into a document`, () => {
      const text = fixture(name)
      const rec = migrateBackup(text, 'new-id')
      const data = JSON.parse(text)
      expect(rec.id).toBe('new-id')
      expect(rec.dirty).toBe(data.changedIds.length > 0)
      expect(() => checkLibrary(rec.library, 'stored')).not.toThrow()
      expect(rec.legacyName).toBe(typeof data.file === 'string' ? data.file : undefined)
    })
  }

  it('is dirty only with changed ids', () => {
    const data = JSON.parse(fixture('v2-backup.json'))
    expect(migrateBackup(JSON.stringify({ ...data, changedIds: [] }), 'a').dirty).toBe(false)
    expect(migrateBackup(JSON.stringify({ ...data, changedIds: ['x'] }), 'a').dirty).toBe(true)
  })

  it('keeps the old file name as legacyName', () => {
    const data = JSON.parse(fixture('v2-backup.json'))
    expect(migrateBackup(JSON.stringify({ ...data, file: 'a.shrimp' }), 'a').legacyName).toBe('a.shrimp')
  })

  it('throws on broken text', () => {
    expect(() => migrateBackup('{ broken', 'a')).toThrow()
    expect(() => migrateBackup('{"library":{},"changedIds":3}', 'a')).toThrow('malformed')
  })
})

describe('doc records', () => {
  it('round trips', () => {
    const rec = migrateBackup(fixture('v2-backup.json'), 'd1')
    const full = { ...rec, legacyName: 'a.shrimp' }
    expect(parseDocRecord(docRecordText(full))).toEqual(full)
  })

  it('reads a file note (its name also as legacyName) and drops the owner', () => {
    const { legacyName: _, ...rec } = migrateBackup(fixture('v2-backup.json'), 'd1')
    const old = JSON.stringify({ ...rec, file: { name: 'b.shrimp', size: 5, modified: 7 }, owner: 'me@x.org' })
    const read = parseDocRecord(old)
    expect(read.legacyName).toBe('b.shrimp')
    expect(read.file).toEqual({ name: 'b.shrimp', size: 5, modified: 7 })
    expect(read).not.toHaveProperty('owner')
    // A note without a name is no note.
    const bad = parseDocRecord(JSON.stringify({ ...rec, file: { size: 1 } }))
    expect(bad.legacyName).toBeUndefined()
    expect(bad.file).toBeUndefined()
  })

  it('round trips a file note', () => {
    const rec = { ...migrateBackup(fixture('v2-backup.json'), 'd1'), file: { name: 'a.shrimp', size: 3, modified: 9 } }
    expect(parseDocRecord(docRecordText(rec)).file).toEqual(rec.file)
  })

  it('throws on a broken record', () => {
    expect(() => parseDocRecord('nope')).toThrow()
    expect(() => parseDocRecord('{"id":"a","dirty":false,"library":{"version":99}}')).toThrow()
    expect(() => parseDocRecord('{"dirty":false}')).toThrow()
  })
})

describe('workspace records', () => {
  it('parses and keeps layout, explorer and ui as they are', () => {
    const text = JSON.stringify({ version: 1, docs: ['a', 'b'], layout: { x: 1 }, explorer: [2], ui: 'u' })
    expect(parseWorkspaceRecord(text)).toEqual({
      version: 1,
      docs: ['a', 'b'],
      closed: [],
      layout: { x: 1 },
      explorer: [2],
      ui: 'u',
    })
  })

  it('reads the closed files strictly, skipping bad entries', () => {
    const drive = { id: 'g', name: 'g.shrimp', md5: 'm', shared: false }
    const text = JSON.stringify({
      version: 1,
      docs: [],
      closed: [{ id: 'a', name: 'A', drive }, { id: 'b', name: 'B' }, { id: 3, name: 'C' }, { name: 'D' }, { id: 'e' }, null, 'x'],
    })
    expect(parseWorkspaceRecord(text).closed).toEqual([
      { id: 'a', name: 'A', drive: { id: 'g', name: 'g.shrimp', md5: 'm', shared: false, mine: false, trashed: false } },
      { id: 'b', name: 'B', drive: null },
    ])
  })

  it('reads a missing or bad closed list as empty', () => {
    expect(parseWorkspaceRecord('{"version":1,"docs":[]}').closed).toEqual([])
    expect(parseWorkspaceRecord('{"version":1,"docs":[],"closed":5}').closed).toEqual([])
  })

  it('still parses an old ui.owners, which stays in ui for the caller to ignore', () => {
    expect(() => parseWorkspaceRecord('{"version":1,"docs":[],"ui":{"owners":{"a":"x@y.z"}}}')).not.toThrow()
  })

  it('refuses other versions and bad docs', () => {
    expect(() => parseWorkspaceRecord('{"version":2,"docs":[]}')).toThrow()
    expect(() => parseWorkspaceRecord('{"version":1,"docs":[1]}')).toThrow()
  })
})

describe('textHash', () => {
  it('gives the same text the same 14 hex digits, and another text others', () => {
    expect(textHash(v2Backup)).toMatch(/^[0-9a-f]{14}$/)
    expect(textHash(v2Backup)).toBe(textHash(v2Backup.slice()))
    expect(textHash(v2Backup)).not.toBe(textHash(v2Backup + ' '))
    expect(textHash('')).not.toBe(textHash('a'))
  })
})
