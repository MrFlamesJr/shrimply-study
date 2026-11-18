// Whether the user has right-clicked in the Explorer once: then its one-line tip ("Right-click anything...") stays away,
// remembered in this browser. Blocked storage remembers nothing, so the tip shows again next visit.
const KEY = 'shrimply-explorer-tip-seen'

export function loadExplorerTipSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveExplorerTipSeen() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Not remembered; it stays gone until the page closes.
  }
}
