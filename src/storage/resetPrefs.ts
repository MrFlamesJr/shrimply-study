// Forgets every browser preference (the theme, the study options, the sidebar, the welcome page and Explorer tip
// seen) and the Google sign-in (this tab's, and the account chosen last), as on a first visit. Each is one
// localStorage or sessionStorage key starting with this prefix. The browser backup is not touched (`clearAll` is the
// debug page's).
const PREFIX = 'shrimply-'

export function resetPrefs() {
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = globalThis[area]
      for (const key of Object.keys(storage)) if (key.startsWith(PREFIX)) storage.removeItem(key)
    } catch {
      // Blocked storage remembers nothing, so there is nothing to forget.
    }
  }
}
