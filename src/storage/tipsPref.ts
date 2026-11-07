// Whether the quiz page's "How studying works" box is whole or minimized, remembered in this browser (not in the
// library file). It starts minimized (asked for), so only opening it is stored. Storage can be blocked or empty
// (private window, cleared site data), so it falls back to minimized.
const KEY = 'shrimply-tips-open'

export function loadTipsOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveTipsOpen(open: boolean) {
  try {
    if (open) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Not remembered; it stays as it is until the page closes.
  }
}
