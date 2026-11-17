import { describe, expect, it } from 'vitest'
import { windowNav } from './route'

describe('windowNav', () => {
  it('holds the screen\'s own route', () => {
    expect(windowNav({ name: 'home' }).route).toEqual({ name: 'home' })
  })
})
