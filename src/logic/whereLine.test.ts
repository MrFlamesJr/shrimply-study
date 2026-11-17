import { describe, expect, it } from 'vitest'
import { whereLine } from './whereLine'

const drive = (shared: boolean, trashed = false) => ({ shared, trashed })
describe('whereLine', () => {
  it('names the place', () => {
    expect(whereLine({ hasFile: false, drive: null, yours: false, signedIn: false })).toBe('Only in this browser')
    expect(whereLine({ hasFile: true, drive: null, yours: false, signedIn: false })).toBe('On this device')
  })
  it('says whose Drive only when signed in', () => {
    expect(whereLine({ hasFile: false, drive: drive(true), yours: true, signedIn: true })).toBe('Your Google Drive')
    expect(whereLine({ hasFile: false, drive: drive(true), yours: false, signedIn: true })).toBe("Someone else's Google Drive")
    expect(whereLine({ hasFile: false, drive: drive(true), yours: false, signedIn: false })).toBe('Shared on Google Drive')
    expect(whereLine({ hasFile: false, drive: drive(false), yours: false, signedIn: false })).toBe('On Google Drive')
  })
  it('notes the bin', () => {
    expect(whereLine({ hasFile: false, drive: drive(false, true), yours: true, signedIn: true })).toBe('Your Google Drive, in the bin')
  })
})
