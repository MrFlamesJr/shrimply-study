// The last release whose welcome page this browser showed (its `RELEASES` name), so home greets a returning user
// once after each release (not part of the library file). Storage can be blocked or empty (private window, cleared
// site data), so it then counts as never shown, like a first visit.
const KEY = 'shrimply-seen-release'

export function loadSeenRelease(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveSeenRelease(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Not remembered; the welcome page shows again on the next visit.
  }
}
