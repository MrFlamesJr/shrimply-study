import { describe, expect, it } from 'vitest'
import { isViewOnly, needsAttention, saveStatus, statusText, type SaveDoc, type SaveStatus } from './autosave'

const library = {}
const doc = (o: Partial<SaveDoc> = {}): SaveDoc => ({ library, saved: library, drive: { mine: true }, problem: null, ...o })
const on = { signedIn: true, busy: false, online: true }

describe('saveStatus', () => {
  it('a browser library and a view-only one never save', () => {
    expect(saveStatus(doc({ drive: null }), on)).toBe('browser')
    expect(saveStatus(doc({ drive: { mine: false } }), on)).toBe('viewOnly')
    // Signed out, every Drive file is view only, the user's own too.
    expect(saveStatus(doc(), { ...on, signedIn: false })).toBe('viewOnly')
  })
  it('the user\'s own file: saved, pending, saving, offline', () => {
    expect(saveStatus(doc(), on)).toBe('saved')
    expect(saveStatus(doc({ saved: {} }), on)).toBe('pending')
    expect(saveStatus(doc({ saved: null }), on)).toBe('pending')
    expect(saveStatus(doc({ saved: {} }), { ...on, busy: true })).toBe('saving')
    expect(saveStatus(doc({ saved: {} }), { ...on, online: false })).toBe('offline')
    expect(saveStatus(doc(), { ...on, online: false })).toBe('saved')
  })
  it('a paused save says its problem, until it saves again', () => {
    expect(saveStatus(doc({ saved: {}, problem: 'conflict' }), on)).toBe('conflict')
    expect(saveStatus(doc({ saved: {}, problem: 'signIn' }), on)).toBe('signIn')
    expect(saveStatus(doc({ saved: {}, problem: 'error' }), { ...on, busy: true })).toBe('saving')
  })
})

describe('statusText and needsAttention', () => {
  const all: SaveStatus[] = ['saved', 'pending', 'saving', 'viewOnly', 'browser', 'signIn', 'offline', 'conflict', 'error']
  it('names each status', () => {
    expect(all.map(statusText)).toEqual([
      'Saved',
      'Saving…',
      'Saving…',
      'View only',
      '',
      'Not saved: sign in again',
      'Offline: not saved yet',
      'Changed on Google Drive',
      'Not saved: trying again soon',
    ])
  })
  it('only the problems need the user', () => {
    expect(all.filter(needsAttention)).toEqual(['signIn', 'offline', 'conflict', 'error'])
  })
  it('isViewOnly', () => {
    expect(isViewOnly({ drive: null }, false)).toBe(false)
    expect(isViewOnly({ drive: { mine: true } }, true)).toBe(false)
    expect(isViewOnly({ drive: { mine: true } }, false)).toBe(true)
    expect(isViewOnly({ drive: { mine: false } }, true)).toBe(true)
  })
})
