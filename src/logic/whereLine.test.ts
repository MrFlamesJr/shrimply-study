import { describe, expect, it } from 'vitest'
import { closedNote, whereLine } from './whereLine'

const drive = (shared: boolean, trashed = false) => ({ shared, trashed })
describe('whereLine', () => {
  it('names the place', () => {
    expect(whereLine({ drive: null, yours: false, signedIn: false })).toBe('Only in this browser')
    expect(whereLine({ drive: null, yours: false, signedIn: true })).toBe('Only in this browser')
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
  it('says where the closed library is and how to open it again', () => {
    expect(closedNote({ name: 'Bio.shrimp', drive: { id: 'x' } }, true)).toBe('Closed "Bio.shrimp". It\'s in your Google Drive: open it again from the Explorer.')
    expect(closedNote({ name: 'Bio.shrimp', drive: { id: 'x' } }, false)).toBe(
      'Closed "Bio.shrimp". It\'s on Google Drive: open it again from the Explorer, or from its link.',
    )
    expect(closedNote({ name: 'Bio', drive: null }, false)).toBe('Closed "Bio". It\'s still in this browser: open it again from the Explorer.')
  })
})
