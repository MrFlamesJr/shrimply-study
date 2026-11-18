import { describe, expect, it } from 'vitest'
import { closedNote, whereLine, whereWithStatus } from './whereLine'

const drive = (shared: boolean, trashed = false) => ({ shared, trashed })
describe('whereLine', () => {
  it('names the place', () => {
    // A browser library says it can be lost (asked for).
    expect(whereLine({ drive: null, yours: false, signedIn: false })).toBe('Only in this browser: can be lost')
    expect(whereLine({ drive: null, yours: false, signedIn: true })).toBe('Only in this browser: can be lost')
  })
  it('names the file on this device', () => {
    expect(whereLine({ drive: null, yours: false, signedIn: false, file: 'biology.shrimp' })).toBe('On this device · biology.shrimp')
  })
  it('says whose Drive only when signed in', () => {
    expect(whereLine({ drive: drive(true), yours: true, signedIn: true })).toBe('Your Google Drive')
    expect(whereLine({ drive: drive(true), yours: false, signedIn: true })).toBe("Someone else's Google Drive")
    expect(whereLine({ drive: drive(true), yours: false, signedIn: false })).toBe('Shared on Google Drive')
    expect(whereLine({ drive: drive(false), yours: false, signedIn: false })).toBe('On Google Drive')
  })
  it('notes the bin', () => {
    expect(whereLine({ drive: drive(false, true), yours: true, signedIn: true })).toBe('Your Google Drive, in the bin')
  })
})

describe('closedNote', () => {
  it('names the closed library, and under More info where it is and how to open it again', () => {
    expect(closedNote({ name: 'Bio.shrimp', drive: { id: 'x' } }, true)).toEqual({
      text: 'Closed "Bio.shrimp".',
      detail: "It's in your Google Drive: open it again from the Explorer.",
    })
    expect(closedNote({ name: 'Bio.shrimp', drive: { id: 'x' } }, false).detail).toBe("It's on Google Drive: open it again from the Explorer, or from its link.")
    expect(closedNote({ name: 'Bio', drive: null, file: { name: 'Bio.shrimp' } }, false).detail).toBe("It's on this device: open it again with Open.")
    expect(closedNote({ name: 'Bio', drive: null }, false).detail).toBe("It's still in this browser: open it again from the Explorer.")
  })
  it('cuts a long name at 40', () => {
    const name = 'The mitochondria is the powerhouse of the cell and makes most of its ATP.shrimp'
    expect(closedNote({ name, drive: null }, false).text).toBe('Closed "The mitochondria is the powerhouse of…".')
  })
})

describe('whereWithStatus', () => {
  it('adds the status when it has words', () => {
    expect(whereWithStatus('Your Google Drive', 'saved')).toBe('Your Google Drive · Saved')
    expect(whereWithStatus('Your Google Drive', 'pending')).toBe('Your Google Drive · Saving…')
  })
  it('leaves the place alone when the status has none', () => {
    expect(whereWithStatus('Only in this browser', 'browser')).toBe('Only in this browser')
  })
})
