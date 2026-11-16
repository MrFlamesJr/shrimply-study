import v1Backup from './fixtures/v1-backup.json?raw'
import v2Backup from './fixtures/v2-backup.json?raw'
import { describe, expect, it } from 'vitest'
import { checkLibrary } from './format'
import { docRecordText, migrateBackup, parseDocRecord, parseWorkspaceRecord } from './workspaceRecord'

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
      expect(rec.file).toEqual(typeof data.file === 'string' ? { name: data.file, size: 0, modified: 0 } : null)
    })
  }

  it('is dirty only with changed ids', () => {
    const data = JSON.parse(fixture('v2-backup.json'))
    expect(migrateBackup(JSON.stringify({ ...data, changedIds: [] }), 'a').dirty).toBe(false)
    expect(migrateBackup(JSON.stringify({ ...data, changedIds: ['x'] }), 'a').dirty).toBe(true)
  })

  it('keeps the file name with size 0 and modified 0', () => {
    const data = JSON.parse(fixture('v2-backup.json'))
    expect(migrateBackup(JSON.stringify({ ...data, file: 'a.shrimp' }), 'a').file).toEqual({
      name: 'a.shrimp',
      size: 0,
      modified: 0,
    })
  })

  it('throws on broken text', () => {
    expect(() => migrateBackup('{ broken', 'a')).toThrow()
    expect(() => migrateBackup('{"library":{},"changedIds":3}', 'a')).toThrow('malformed')
  })
})

describe('doc records', () => {
  it('round trips', () => {
    const rec = migrateBackup(fixture('v2-backup.json'), 'd1')
    const full = { ...rec, file: { name: 'a.shrimp', size: 5, modified: 7 } }
    expect(parseDocRecord(docRecordText(full))).toEqual(full)
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
    expect(parseWorkspaceRecord(text)).toEqual({ version: 1, docs: ['a', 'b'], layout: { x: 1 }, explorer: [2], ui: 'u' })
  })

  it('refuses other versions and bad docs', () => {
    expect(() => parseWorkspaceRecord('{"version":2,"docs":[]}')).toThrow()
    expect(() => parseWorkspaceRecord('{"version":1,"docs":[1]}')).toThrow()
  })
})
