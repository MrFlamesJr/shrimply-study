import { describe, expect, it } from 'vitest'
import { svgParts } from './svgIcon'

const icons = import.meta.glob<string>('../icons/*.svg', { query: '?raw', import: 'default', eager: true })

describe('svgParts', () => {
  it('turns the root attributes into React props and keeps the markup inside', () => {
    const file = `<svg xmlns="http://www.w3.org/2000/svg" width="18" viewBox="0 0 24 24" stroke-width="2" aria-label='x'>
  <path d="M12 20h9"/>
  <path style="fill:var(--brand-head)" d="M1 1"/>
</svg>
`
    expect(svgParts(file)).toEqual({
      props: { width: '18', viewBox: '0 0 24 24', strokeWidth: '2', 'aria-label': 'x' },
      inner: '<path d="M12 20h9"/><path style="fill:var(--brand-head)" d="M1 1"/>',
    })
  })

  it('refuses a file that is no SVG', () => {
    expect(() => svgParts('<div></div>')).toThrow()
  })

  it('reads every icon file', () => {
    expect(Object.keys(icons).length).toBeGreaterThan(10)
    for (const [path, file] of Object.entries(icons)) {
      const { props, inner } = svgParts(file)
      expect(file, path).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
      expect(props.viewBox, path).toMatch(/^0 0 [\d.]+ [\d.]+$/)
      expect(inner, path).toMatch(/^<\w[\s\S]*>$/)
    }
  })
})
