/** Every custom property declared on a `:root` rule of the live stylesheets, in order, with its first value. */
export function themeTokens(): [name: string, value: string][] {
  const tokens = new Map<string, string>()
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule) || !rule.selectorText.startsWith(':root')) continue
      for (const name of rule.style) {
        if (name.startsWith('--') && !tokens.has(name)) tokens.set(name, rule.style.getPropertyValue(name).trim())
      }
    }
  }
  return [...tokens]
}
