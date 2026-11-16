import { describe, expect, it } from 'vitest'

// Every source file of the kit, as text (vite reads them, so no node types are needed).
const files = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

const ALLOWED = ['react', 'react-dom', 'react-dom/client']
const FROM = /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm

/** Every import specifier in the source. */
function specifiers(source: string): string[] {
  return [...source.matchAll(FROM)].map((m) => m[1] ?? m[2] ?? m[3])
}

/** Does a relative specifier from `file` (a path like './a/b.ts') stay inside the kit folder? */
function insideKit(file: string, spec: string): boolean {
  const parts = file.split('/').slice(1, -1)
  for (const p of spec.split('/')) {
    if (p === '..') {
      if (parts.length === 0) return false
      parts.pop()
    } else if (p !== '.') parts.push(p)
  }
  return true
}

/** The specifiers of a file that the kit rules refuse (test files may also import vitest). */
function violations(file: string, source: string): string[] {
  const test = /\.test\.tsx?$/.test(file)
  return specifiers(source).filter((s) => {
    if (ALLOWED.includes(s) || s.endsWith('.css')) return false
    if (s.startsWith('.')) return !insideKit(file, s)
    return !(test && s === 'vitest')
  })
}

describe('kit boundary', () => {
  it('finds the kit files', () => expect(Object.keys(files).length).toBeGreaterThan(5))

  it('reads the specifiers of every import form', () => {
    const src = "import a from 'react'\nimport { b,\n c } from './x'\nexport * from './y'\nimport './z.css'\nconst m = " + "import('../w')"
    expect(specifiers(src)).toEqual(['react', './x', './y', './z.css', '../w'])
  })

  it('resolves relative paths against the kit folder', () => {
    expect(insideKit('./a.ts', './b')).toBe(true)
    expect(insideKit('./a/b.ts', '../c')).toBe(true)
    expect(insideKit('./a.ts', '../logic/x')).toBe(false)
    expect(insideKit('./a/b.ts', '../../x')).toBe(false)
  })

  it('refuses outside imports', () => {
    expect(violations('./a.ts', "import x from 'lodash'\nimport y from '../model'")).toEqual(['lodash', '../model'])
    expect(violations('./a.ts', "import x from 'vitest'")).toEqual(['vitest'])
    expect(violations('./a.test.ts', "import x from 'vitest'")).toEqual([])
  })

  for (const [file, source] of Object.entries(files)) {
    it(`${file} imports only react, react-dom and the kit`, () => expect(violations(file, source)).toEqual([]))
  }
})
