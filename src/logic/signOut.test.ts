import { describe, expect, it } from 'vitest'
import { hiddenNote, saveAllThenSignOut } from './signOut'

const run = async (fails: string[]) => {
  const done: string[] = []
  const failed = await saveAllThenSignOut(
    [
      { id: 'a', dirty: true },
      { id: 'b', dirty: false },
      { id: 'c', dirty: true },
    ],
    {
      save: async (id) => (done.push(`save ${id}`), !fails.includes(id)),
      close: (ids) => done.push(`close ${ids.join(' ')}`),
      signOut: () => done.push('sign out'),
    },
  )
  return { failed, done }
}

describe('save all and sign out', () => {
  it('saves the files with changes, then closes them all and signs out', async () => {
    expect(await run([])).toEqual({ failed: [], done: ['save a', 'save c', 'close a b c', 'sign out'] })
  })
  it('closes nothing and stays signed in when a save fails, naming the ones that failed', async () => {
    expect(await run(['a'])).toEqual({ failed: ['a'], done: ['save a', 'save c'] })
  })
})

describe('the hidden files note', () => {
  it('never says "your" signed out, and names another account signed in', () => {
    expect(hiddenNote(1, false)).toBe('1 Google Drive file is hidden until you sign in.')
    expect(hiddenNote(2, false)).toBe('2 Google Drive files are hidden until you sign in.')
    expect(hiddenNote(2, true)).toBe('2 Google Drive files of another Google account are hidden. Sign out, then sign in with that account to see them.')
  })
})
