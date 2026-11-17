// The app's windows: the main window and popups. All state lives in the main window; a popup is a blank same-origin
// page that the main window renders into (see Popout.tsx). This file opens, styles, tracks and closes them.
const popups = new Map<string, Window>()
const listeners = new Set<() => void>()
const polls = new Map<Window, number>()
const mounted = new WeakMap<Window, Promise<HTMLElement>>()
// The path of the page each popup was opened at: a reloaded popup is taken over once a new document is loaded there.
const paths = new WeakMap<Window, string>()
const focusers = new WeakMap<Window, () => void>()
/** The name prefix of a window opened for a popup, so a host can tell a controlled popup (opener alive) from a pasted address. */
export const POPUP_PREFIX = 'pop-'
let active: Window | null = null
// Names this page load, so a popup can tell that its opener was reloaded or navigated away.
const APP_ID = Math.random().toString(36).slice(2)
;(window as unknown as { __kitApp: string }).__kitApp = APP_ID

function notify() {
  for (const cb of [...listeners]) cb()
}

function forget(win: Window) {
  mounted.delete(win)
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
  paths.set(win, new URL(url, window.location.href).pathname)
  // The same id gives the same window back: it is already watched.
  if (!polls.has(win)) {
    trackFocus(win)
    polls.set(
      win,
      window.setInterval(() => {
        if (win.closed) forget(win)
      }, 500),
    )
  }
  notify()
  return win
}

/** Keeps `active` right from this document on; one listener per popup, so the same document is never counted twice. */
function trackFocus(win: Window) {
  let focused = focusers.get(win)
  if (!focused) {
    focused = () => {
      active = win
      notify()
    }
    focusers.set(win, focused)
  }
  win.addEventListener('focus', focused)
}

const ROOT_ATTRIBUTES = ['data-theme', 'lang', 'class', 'style']

// Loaded: a finished document that is not `previous` (a reload's old one) and, once the popup page's path is known,
// is at that path (a host's own page that redirects to the popup page is not it yet). Rejects when the window closes
// or `timeout` ms pass.
function waitLoaded(win: Window, previous?: Document, timeout?: number): Promise<void> {
  const path = paths.get(win)
  const until = timeout === undefined ? Infinity : Date.now() + timeout
  return new Promise((resolve, reject) => {
    const check = () => {
      if (win.closed) return reject(new Error('The popup was closed before it loaded'))
      if (Date.now() > until) return reject(new Error('No new page came to the popup'))
      if (
        win.document !== previous &&
        win.document.readyState === 'complete' &&
        win.location.href !== 'about:blank' &&
        (path === undefined || win.location.pathname === path)
      )
        return resolve()
      window.setTimeout(check, 25)
    }
    check()
  })
}

/** Resolves when a popup that is unloading (a reload) has a new document at the popup page; rejects if the window closes or none comes within a few seconds. */
export function waitReloaded(win: Window, previous: Document): Promise<void> {
  return waitLoaded(win, previous, 5000)
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

/** A script running in the popup's own realm closes it when its opener is gone (a closed, reloaded or navigated main window). */
function watchOpener(win: Window) {
  const script = win.document.createElement('script')
  script.textContent = `(function(){var id=${JSON.stringify(APP_ID)};setInterval(function(){var o=window.opener;var gone=true;try{gone=!o||o.closed||o.__kitApp!==id}catch(e){}if(gone)window.close()},500)})()`
  win.document.head.appendChild(script)
}

/** Mounts once per popup document: a second call (a remount) gets the same root. */
export function mountPopup(win: Window, o: { title: string; address?: string }): Promise<HTMLElement> {
  const done = mounted.get(win)
  if (done) {
    return done.then((root) => {
      // A root of the document the popup has since left stays connected to that document, so ask which one is current.
      if (root.isConnected && root.ownerDocument === win.document) {
        setPopupTitle(win, o.title)
        if (o.address !== undefined) setPopupAddress(win, o.address)
        return root
      }
      // The popup navigated to a new document since: mount that one.
      mounted.delete(win)
      return mountPopup(win, o)
    })
  }
  const made = (async () => {
    await waitLoaded(win)
    followOpener(win)
    trackFocus(win)
    setPopupTitle(win, o.title)
    if (o.address !== undefined) setPopupAddress(win, o.address)
    watchOpener(win)
    const root = win.document.createElement('div')
    win.document.body.appendChild(root)
    return root
  })()
  mounted.set(win, made)
  made.catch(() => mounted.delete(win))
  return made
}

export function setPopupTitle(win: Window, title: string): void {
  win.document.title = title
}

/** Sets the popup's address bar to `url` (same origin as the popup) without loading anything: the popup stays as it is. */
export function setPopupAddress(win: Window, url: string): void {
  const next = new URL(url, win.location.href).href
  if (win.location.href !== next) win.history.replaceState(null, '', next)
}

/** Calls `cb` once when the popup's current document goes away (closed, or reloaded or navigated). */
export function onPopupUnload(win: Window, cb: () => void): () => void {
  const fire = () => cb()
  win.addEventListener('pagehide', fire, { once: true })
  return () => win.removeEventListener('pagehide', fire)
}

/** Calls `cb` once when the popup window is closed. */
export function onPopupClosed(win: Window, cb: () => void): () => void {
  let done = false
  const stop = () => {
    window.clearInterval(poll)
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
