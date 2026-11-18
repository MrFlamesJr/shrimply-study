import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetPrefs } from './resetPrefs'

const fake = (items: Record<string, string>) => ({
  ...items,
  removeItem(key: string) {
    delete (this as Record<string, unknown>)[key]
  },
})

describe('resetPrefs', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('forgets every shrimply- key in local and session storage and leaves the others', () => {
    const local = fake({ 'shrimply-theme': 'calm', other: '1' })
    const session = fake({ 'shrimply-google-sign-in': 'x', keep: '2' })
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', session)
    resetPrefs()
    expect(Object.keys(local).filter((k) => k !== 'removeItem')).toEqual(['other'])
    expect(Object.keys(session).filter((k) => k !== 'removeItem')).toEqual(['keep'])
  })

  it('stays silent when storage is blocked', () => {
    vi.stubGlobal(
      'localStorage',
      new Proxy({}, {
        ownKeys() {
          throw new Error('blocked')
        },
      }),
    )
    vi.stubGlobal('sessionStorage', fake({ 'shrimply-x': '1' }))
    expect(() => resetPrefs()).not.toThrow()
  })
})
