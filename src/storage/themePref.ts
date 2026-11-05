import { THEMES, type ThemeId } from '../model'

// The chosen theme, remembered in this browser (not in the library file). Storage can be blocked or
// empty (private window, cleared site data), so it falls back to the default theme.
const KEY = 'shrimply-theme'

export function loadTheme(): ThemeId {
  try {
    const id = localStorage.getItem(KEY)
    return THEMES.find((t) => t.id === id)?.id ?? THEMES[0].id
  } catch {
    return THEMES[0].id
  }
}

export function saveTheme(id: ThemeId) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Not remembered; the theme still applies until the page closes.
  }
}
