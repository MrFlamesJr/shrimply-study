import { describe, expect, it } from 'vitest'
import { comboLabel, isEditable, isMac, matches } from './shortcuts'

const ev = (key: string, m: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) =>
  ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...m })

describe('matches', () => {
  it('Mod is Ctrl off a Mac and Cmd on a Mac', () => {
    expect(matches(ev('s', { ctrlKey: true }), 'Mod+S', false)).toBe(true)
    expect(matches(ev('s', { metaKey: true }), 'Mod+S', false)).toBe(false)
    expect(matches(ev('s', { metaKey: true }), 'Mod+S', true)).toBe(true)
    expect(matches(ev('s', { ctrlKey: true }), 'Mod+S', true)).toBe(false)
  })
  it('needs exactly the modifiers and ignores letter case', () => {
    expect(matches(ev('E', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+E', false)).toBe(true)
    expect(matches(ev('e', { ctrlKey: true }), 'Ctrl+Shift+E', false)).toBe(false)
    expect(matches(ev('e', { ctrlKey: true, shiftKey: true, altKey: true }), 'Ctrl+Shift+E', false)).toBe(false)
    expect(matches(ev('s'), 'Mod+S', false)).toBe(false)
    expect(matches(ev('s', { ctrlKey: true }), 'Mod+Shift+S', false)).toBe(false)
  })
  it('handles named keys and plain keys', () => {
    expect(matches(ev('F2'), 'F2', false)).toBe(true)
    expect(matches(ev('Delete'), 'Delete', true)).toBe(true)
    expect(matches(ev('Delete', { shiftKey: true }), 'Delete', true)).toBe(false)
    expect(matches(ev('ArrowUp', { altKey: true, shiftKey: true }), 'Alt+Shift+ArrowUp', false)).toBe(true)
    expect(matches(ev(' '), 'Space', false)).toBe(true)
  })
})

describe('isEditable', () => {
  const el = (nodeName: string, extra: object = {}) => ({ nodeType: 1, nodeName, ...extra }) as unknown as EventTarget
  it('accepts text-like inputs, textarea, select and contenteditable', () => {
    expect(isEditable(el('INPUT', { type: 'text' }))).toBe(true)
    expect(isEditable(el('INPUT'))).toBe(true)
    expect(isEditable(el('INPUT', { type: 'search' }))).toBe(true)
    expect(isEditable(el('TEXTAREA'))).toBe(true)
    expect(isEditable(el('SELECT'))).toBe(true)
    expect(isEditable(el('DIV', { isContentEditable: true }))).toBe(true)
  })
  it('refuses buttons, checkboxes, other elements, text nodes and null', () => {
    expect(isEditable(el('INPUT', { type: 'checkbox' }))).toBe(false)
    expect(isEditable(el('INPUT', { type: 'BUTTON' }))).toBe(false)
    expect(isEditable(el('DIV'))).toBe(false)
    expect(isEditable({ nodeType: 3, nodeName: '#text' } as unknown as EventTarget)).toBe(false)
    expect(isEditable(null)).toBe(false)
  })
})

describe('comboLabel and isMac', () => {
  it('writes words off a Mac and symbols on one', () => {
    expect(comboLabel('Mod+Shift+E', false)).toBe('Ctrl+Shift+E')
    expect(comboLabel('Mod+Shift+E', true)).toBe('⌘⇧E')
    expect(comboLabel('Alt+Shift+ArrowUp', false)).toBe('Alt+Shift+ArrowUp')
    expect(comboLabel('Alt+Shift+ArrowUp', true)).toBe('⌥⇧↑')
    expect(comboLabel('F2', false)).toBe('F2')
    expect(comboLabel('Mod+s', false)).toBe('Ctrl+S')
  })
  it('isMac reads the platform', () => {
    expect(isMac('MacIntel')).toBe(true)
    expect(isMac('iPhone')).toBe(true)
    expect(isMac('Win32')).toBe(false)
    expect(isMac('Linux x86_64')).toBe(false)
  })
})
