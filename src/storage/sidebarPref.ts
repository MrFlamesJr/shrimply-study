// Whether the user closed the sidebar on a wide screen, remembered in this browser, so a reload keeps it closed (asked
// for). Small screens always start with it closed, as there it covers the page. Blocked storage remembers nothing: it
// starts open again.
const KEY = 'shrimply-sidebar-closed'

export function loadSidebarClosed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveSidebarClosed(closed: boolean) {
  try {
    if (closed) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Not remembered; the next visit starts open.
  }
}
