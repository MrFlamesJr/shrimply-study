import { describe, expect, it } from 'vitest'
import { lastAfter, startSession } from './session'

describe('startSession', () => {
  it('keeps the tab own sign-in', () => {
    expect(startSession({ account: 'b' }, { account: 'a' })).toEqual({ session: { account: 'b' }, copy: false })
    expect(startSession({ signedOut: true }, { account: 'a' })).toEqual({ session: { signedOut: true }, copy: false })
  })
  it('takes the last chosen account and keeps it', () => {
    expect(startSession(null, { account: 'a', token: 1 })).toEqual({ session: { account: 'a', token: 1 }, copy: true })
  })
  it('starts signed out with nothing chosen', () => {
    expect(startSession(null, null)).toEqual({ session: {}, copy: true })
  })
})

describe('lastAfter', () => {
  it('writes a chosen account', () => expect(lastAfter('choose', { account: 'b' }, { account: 'a' })).toEqual({ account: 'b' }))
  it('renews only the same account', () => {
    expect(lastAfter('renew', { account: 'b' }, { account: 'a' })).toBeUndefined()
    expect(lastAfter('renew', { account: 'a', token: 2 }, { account: 'a', token: 1 })).toEqual({ account: 'a', token: 2 })
  })
  it('signs out of the last chosen only when it holds this account', () => {
    expect(lastAfter('out', { account: 'a' }, { account: 'a' })).toBeNull()
    expect(lastAfter('out', { account: 'a' }, { account: 'b' })).toBeUndefined()
  })
})
