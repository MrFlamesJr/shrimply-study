// The app's windows: the main window and popups. All state lives in the main window; a popup is a blank same-origin
// page that the main window renders into (see Popout.tsx). This file opens, styles, tracks and closes them.
const popups = new Map<string, Window>()
const listeners = new Set<() => void>()
const polls = new Map<Window, number>()
let active: Window | null = null

function notify() {
  for (const cb of [...listeners]) cb()
}

function forget(win: Window) {
  for (const [id, w] of popups) if (w === win) popups.delete(id)
  const poll = polls.get(win)
  if (poll !== undefined) {
    window.clearInterval(poll)
    polls.delete(win)
  }
  if (active === win) active = null
  notify()
}

window.addEventListener('focus', () => {
  active = window
  notify()
})
window.addEventListener('pagehide', () => closePopups())

export function openPopup(id: string, url: string, o: { width: number; height: number; left?: number; top?: number }): Window | null {
  const features = ['popup', `width=${o.width}`, `height=${o.height}`]
  if (o.left !== undefined) features.push(`left=${o.left}`)
  if (o.top !== undefined) features.push(`top=${o.top}`)
  const win = window.open(url, id, features.join(','))
  if (!win) return null
  popups.set(id, win)
  win.addEventListener('focus', () => {
    active = win
    notify()
  })
  polls.set(
    win,
    window.setInterval(() => {
      if (win.closed) forget(win)
    }, 500),
  )
  notify()
  return win
}

const ROOT_ATTRIBUTES = ['data-theme', 'lang', 'class', 'style']

function waitLoaded(win: Window): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (win.closed) return reject(new Error('The popup was closed before it loaded'))
      if (win.document.readyState === 'complete' && win.location.href !== 'about:blank') return resolve()
      window.setTimeout(check, 25)
    }
    check()
  })
}

/** Keeps the popup's styles and <html> attributes equal to the opener's. */
function followOpener(win: Window) {
  const clones = new Map<Element, Element>()
  const sync = () => {
    const sources = [...document.head.querySelectorAll('style, link[rel~="stylesheet"]')]
    for (const [source, clone] of clones) {
      if (!sources.includes(source)) {
        clone.remove()
        clones.delete(source)
      }
    }
    for (const source of sources) {
      let clone = clones.get(source)
      if (!clone) {
        clone = win.document.importNode(source, false)
        clones.set(source, clone)
      }
      if (source.nodeName === 'LINK') {
        const href = (source as HTMLLinkElement).href
        if ((clone as HTMLLinkElement).href !== href) (clone as HTMLLinkElement).href = href
      } else if (clone.textContent !== source.textContent) {
        clone.textContent = source.textContent
      }
    }
    const wanted = sources.map((s) => clones.get(s)!)
    const inOrder = wanted.every((c, i) => c.parentNode === win.document.head && (i === 0 || wanted[i - 1].nextElementSibling === c))
    if (!inOrder) for (const c of wanted) win.document.head.appendChild(c)
  }
  const syncRoot = () => {
    const from = document.documentElement
    const to = win.document.documentElement
    for (const name of ROOT_ATTRIBUTES) {
      const value = from.getAttribute(name)
      if (value === null) to.removeAttribute(name)
      else if (to.getAttribute(name) !== value) to.setAttribute(name, value)
    }
  }
  sync()
  syncRoot()
  const head = new MutationObserver(sync)
  head.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'rel'] })
  const root = new MutationObserver(syncRoot)
  root.observe(document.documentElement, { attributes: true, attributeFilter: ROOT_ATTRIBUTES })
  win.addEventListener(
    'pagehide',
    () => {
      head.disconnect()
      root.disconnect()
    },
    { once: true },
  )
}

export async function mountPopup(win: Window, o: { title: string }): Promise<HTMLElement> {
  await waitLoaded(win)
  followOpener(win)
  setPopupTitle(win, o.title)
  const root = win.document.createElement('div')
  win.document.body.appendChild(root)
  return root
}

export function setPopupTitle(win: Window, title: string): void {
  win.document.title = title
}

export function onPopupClosed(win: Window, cb: () => void): () => void {
  let done = false
  const stop = () => {
    window.clearInterval(poll)
    win.removeEventListener('pagehide', fire)
  }
  const fire = () => {
    if (done) return
    done = true
    stop()
    forget(win)
    cb()
  }
  const poll = window.setInterval(() => {
    if (win.closed) fire()
  }, 500)
  win.addEventListener('pagehide', fire)
  return () => {
    done = true
    stop()
  }
}

export function appWindows(): Window[] {
  return [window, ...[...popups.values()].filter((w) => !w.closed)]
}

export function activeWindow(): Window {
  return active && !active.closed ? active : window
}

export function subscribeWindows(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function closePopups(): void {
  for (const win of [...popups.values()]) {
    forget(win)
    if (!win.closed) win.close()
  }
}

export function windowOf(el: Element): Window {
  return el.ownerDocument.defaultView!
}
