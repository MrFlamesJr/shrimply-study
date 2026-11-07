// Forgets every browser preference (the theme, the study options, the tips box), as on a first visit. Each is one
// localStorage key starting with this prefix. The library and its browser backup are not touched.
const PREFIX = 'shrimply-'

export function resetPrefs() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  } catch {
    // Blocked storage remembers nothing, so there is nothing to forget.
  }
}
