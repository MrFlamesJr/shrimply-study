import { themeTokens } from './themeTokens'

export function TokensSection() {
  // The values in the active theme, derived colors filled in from its base colors.
  const root = getComputedStyle(document.documentElement)
  return (
    <section className="debug-section">
      <h2>Theme tokens</h2>
      <p className="muted">Every custom property on :root in the current theme, with a swatch when the value is a color.</p>
      <ul className="debug-tokens">
        {themeTokens().map(([name]) => {
          const value = root.getPropertyValue(name).trim()
          return (
            <li key={name}>
              {CSS.supports('color', value) ? <span className="swatch" style={{ background: `var(${name})` }} /> : <span />}
              <code>{name}</code>
              <span className="muted">{value}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
