import { describe, expect, it } from 'vitest'
import type { Route } from '../route'
import { buildTabNav } from './tabNav'

const setup = () => {
  const calls: string[] = []
  let id: string | undefined
  const nav = buildTabNav(
    { name: 'home' },
    { setRoute: (r) => calls.push(`set ${r.name}`), syncAddress: (r, mode) => calls.push(`${mode} ${r.name}`) },
    { get: () => id, set: (v) => (id = v) },
  )
  return { nav, calls }
}
const quiz: Route = { name: 'quiz', course: 'a', quiz: 'b' }

describe('buildTabNav', () => {
  it('keeps the tab\'s route', () => {
    expect(setup().nav.route).toEqual({ name: 'home' })
  })
  it('go sets the route, then pushes the address; redirect replaces it', () => {
    const { nav, calls } = setup()
    nav.go(quiz)
    nav.redirect({ name: 'course', course: 'a' })
    expect(calls).toEqual(['set quiz', 'push quiz', 'set course', 'replace course'])
  })
  it('goToNew leaves the id for the next screen to take once', () => {
    const { nav, calls } = setup()
    nav.goToNew('q1', { name: 'edit', course: 'a', quiz: 'b' })
    expect(calls).toEqual(['set edit', 'push edit'])
    expect(nav.takeCreated('other')).toBe(false)
    expect(nav.takeCreated('q1')).toBe(true)
    expect(nav.takeCreated('q1')).toBe(false)
  })
})
