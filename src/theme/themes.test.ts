import { describe, expect, it } from 'vitest'
import { THEMES } from '../model'
import main from '../main.tsx?raw'
import shared from './tokens.css?raw'

// Every theme is made the same way: one file, one block, the template's tokens and section comments in the same order.
const files = import.meta.glob<string>('./theme-*.css', { query: '?raw', import: 'default', eager: true })
// Line endings don't count (an editor may save a file with CRLF).
const css = (id: string) => (files[`./theme-${id}.css`] ?? '').replace(/\r\n/g, '\n')
const tokens = (text: string) => [...text.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1])
// The section comments inside the block (the one about the theme sits above it).
const sections = (text: string) => [...text.slice(text.indexOf('{')).matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0])
const calm = css('calm')

describe('themes', () => {
  it('has one file per theme in THEMES, each imported in main.tsx after tokens.css', () => {
    expect(Object.keys(files).sort()).toEqual(THEMES.map((t) => `./theme-${t.id}.css`).sort())
    expect(tokens(calm).length).toBeGreaterThan(40)
    expect(tokens(shared).length).toBeGreaterThan(40)
    for (const t of THEMES) expect(main.indexOf(`import './theme/theme-${t.id}.css'`)).toBeGreaterThan(main.indexOf(`import './theme/tokens.css'`))
  })

  it.each(THEMES.map((t) => t.id))('%s has one block with the same tokens and sections as Calm', (id) => {
    const text = css(id)
    expect(text).toContain(`:root[data-theme="${id}"] {`)
    expect(text.match(/\{/g)).toHaveLength(1)
    expect(tokens(text)).toEqual(tokens(calm))
    expect(sections(text)).toEqual(sections(calm))
  })

  // Each theme places its colors by its own scheme; a color left at Calm's value is one nobody chose (--ink is black
  // in every theme).
  const hexes = (text: string) =>
    [...text.matchAll(/^\s*(--[\w-]+)\s*:\s*(#[0-9a-f]+)\s*;/gim)].map(([, name, value]) => [name, value.toLowerCase()] as const)
  it.each(THEMES.filter((t) => t.id !== 'calm').map((t) => t.id))('%s never copies one of Calm\'s colors', (id) => {
    const own = new Map(hexes(css(id)))
    expect(hexes(calm).filter(([name, value]) => name !== '--ink' && own.get(name) === value)).toEqual([])
  })

  it('never sets a token that tokens.css derives or defines', () => {
    const own = tokens(shared)
    expect(tokens(calm).filter((n) => own.includes(n))).toEqual([])
  })
})
