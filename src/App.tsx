import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { addressOf, followRename, href, parseAddress, parseHash, resolve, useRoute, type Found, type Nav, type Route } from './route'
import { emptyLibrary, newId, type StudyOptions, type ThemeId } from './model'
import { useWorkspace, type DocId, type WorkspaceApi } from './state/useWorkspace'
import { MAIN, groupOf, groupsIn, windowOf, type Tab } from './kit/layout'
import { isEditable, isMac, matches } from './kit/shortcuts'
import { openPopup } from './kit/windows'
import { APP_PAGE_TITLE, canSplit, poppedOut, type TabData, type WorkbenchDoc } from './logic/workbenchActions'
import { nodeOf } from './logic/explorerTree'
import type { ItemRef } from './logic/contentOps'
import { fileStorage, loadGuide } from './storage/fileStorage'
import { loadTheme, saveTheme } from './storage/themePref'
import { loadTipsOpen, saveTipsOpen } from './storage/tipsPref'
import { loadExplorerTipSeen, saveExplorerTipSeen } from './storage/explorerTipPref'
import { loadStudyOptions, saveStudyOptions } from './storage/studyPref'
import { loadSeenRelease, saveSeenRelease } from './storage/welcomePref'
import { RELEASES } from './releaseNotes'
import { Sidebar, useSidebarOpen } from './layout/Sidebar'
import { Workbench } from './layout/Workbench'
import { EmptyPane } from './layout/EmptyPane'
import { PaneScreen, type PaneShared } from './layout/PaneScreen'
import type { Crumb } from './layout/PaneHead'
import { makeTabNav, type TabNavOps } from './layout/tabNav'
import { useKeydown } from './hooks/useKeydown'
import { useSpellcheckOnFocus } from './hooks/useSpellcheckOnFocus'
import { HomeScreen } from './screens/HomeScreen'
import { DebugScreen } from './screens/DebugScreen'
import { DebugBar } from './screens/debug/DebugBar'
import { WorkbenchDemo } from './kit/demo/WorkbenchDemo'
import { Toasts, useToasts } from './components/Toasts'
import { askChoice, askConfirm } from './components/ConfirmDialog'
import { DriveDialog } from './components/DriveDialog'

// The app's own pages shown instead of the workbench: debug in the page cell (the workbench kept, hidden), the kit
// demo full screen. What's new (#/_changelog) and the welcome page open as tabs instead.
const OWN_PAGES: Route['name'][] = ['debug', 'workbench']
const HOME: Route = { name: 'home' }
// The window size a popped-out group asks for when its pane can't be measured.
const POPUP = { width: 960, height: 720 }
const BLOCKED = 'Your browser blocked the new window. Allow pop-ups for this site to move panes into their own window.'

type DocNode = ItemRef | { kind: 'doc'; doc: DocId }

// The address of what a tab shows (asked for: the address always names the page on screen): a file's page (naming
// its file while several are shown), the app's own pages by name, and `#/_empty` for no page (an empty group, or a
// hidden file, which never shows in the address).
const addressFor = (ws: WorkspaceApi, tab: Tab<TabData> | null): string =>
  !tab ? href({ name: 'empty' }) : tab.data.kind === 'doc' ? addressOf(tab.data.route, ws.fileKey(tab.data.doc)) : href({ name: tab.data.kind })

export function App() {
  const toasts = useToasts()
  const ws = useWorkspace(fileStorage, toasts.notify, askConfirm, askChoice)
  // The active file (the active tab's, else the last one shown); null when no tab shows one.
  const lib = ws.active ? ws.doc(ws.active) : null
  const hashRoute = useRoute()
  const own = OWN_PAGES.includes(hashRoute.name)

  // The address bar names the page in the main window's focused group (`address`, any kind of tab): switching tabs or
  // groups writes it there (replacing the entry), going somewhere in a tab pushes one (makeTabNav). Each entry names
  // its tab (history.state `{ tab }`), so Back and Forward go to that tab, wherever it is now, on that page
  // (workspace.followHistory); an entry with no tab of its own (a typed address, a reload in a new tab) goes to the
  // file it names, the app's own page it names, or the main window's tab when its file has that page. Pages of the
  // app itself (debug, the kit demo), Drive links and `#/_empty` are left alone.
  const addr = ws.address
  const target = addressFor(ws, addr)
  const addrKey = `${addr?.id ?? ''} ${target}`
  const entryTab = () => {
    const tab = (history.state as { tab?: unknown } | null)?.tab
    return typeof tab === 'string' ? tab : null
  }
  // In the event itself, and at once (flushSync), so a screen that goes is done with (its effects cleaned up) before
  // anything else can reach it. Back and Forward fire popstate (and hashchange); the second finds nothing to do.
  const latest = useRef(ws)
  latest.current = ws
  useEffect(() => {
    const onNav = () => {
      const now = latest.current
      const { route: to, file } = parseAddress(location.hash)
      if (!now.ready || OWN_PAGES.includes(to.name) || to.name === 'drive' || to.name === 'empty') return
      flushSync(() => now.followHistory(entryTab(), to, file))
      // Nothing to change (already there, or nowhere to go): the address names what is shown, as written.
      const shown = latest.current.address
      const canonical = addressFor(latest.current, shown)
      if (location.hash !== canonical) history.replaceState({ tab: shown?.id ?? null }, '', canonical)
    }
    addEventListener('popstate', onNav)
    addEventListener('hashchange', onNav)
    return () => {
      removeEventListener('popstate', onNav)
      removeEventListener('hashchange', onNav)
    }
  }, [])
  const started = useRef(false)
  const lastAddress = useRef<string | null>(null)
  // The tab's page into the address bar, the entry naming the tab, when the tab (or its page) changes; only then, as
  // the address may already show where the user is going before its event arrives. Another tab replaces the entry;
  // the same tab on another page (from the sidebar, the Explorer) adds one, as its own links do. On start the
  // address goes first.
  useEffect(() => {
    if (!ws.ready) return
    const first = !started.current
    started.current = true
    const here = parseAddress(location.hash)
    if (OWN_PAGES.includes(here.route.name) || here.route.name === 'drive') return
    if (first && here.route.name !== 'empty' && ws.followHistory(entryTab(), here.route, here.file)) return
    const id = addr?.id ?? null
    const moved = id !== null && lastAddress.current === id && location.hash !== target
    lastAddress.current = id
    if (moved) history.pushState({ tab: id }, '', target)
    else if (location.hash !== target || entryTab() !== id) history.replaceState({ tab: id }, '', target)
  }, [ws.ready, addrKey])

  const navOps: TabNavOps = {
    setRoute: ws.setTabRoute,
    ownsAddress: (id) => !own && id === ws.address?.id,
    address: (id, route) => {
      const tab = ws.layout.tabs[id]
      return tab?.data.kind === 'doc' ? addressOf(route, ws.fileKey(tab.data.doc)) : href(route)
    },
  }
  const tabNav = (tabId: string, route: Route): Nav => makeTabNav(tabId, route, navOps)

  // The study options (mode, side, order), remembered in this browser so a reload or a new tab keeps them.
  const [prefs, setPrefs] = useState(loadStudyOptions)
  const choosePrefs = (options: StudyOptions) => {
    saveStudyOptions(options)
    setPrefs(options)
  }
  // Ids of the groups folded shut, for this visit only (not in the file). Kept here so they survive Edit and Done.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen()
  // Where the page ground begins, for a theme's backdrop picture (shell.css): a data attribute, not a :has() rule
  // that every change on the page would recheck. Not on the popups' <html>, which have no sidebar.
  useLayoutEffect(() => {
    document.documentElement.dataset.sidebar = sidebarOpen ? 'open' : 'closed'
  }, [sidebarOpen])
  const [debugBar, setDebugBar] = useState(false)
  // The theme is `data-theme` on <html> (set from the remembered one in main.tsx). Set before the re-render,
  // so anything that reads computed styles while rendering (the debug page's tokens) sees the new theme.
  const [theme, setTheme] = useState(loadTheme)
  // The quiz page's "How studying works" box: whole, or minimized to its title (remembered in this browser).
  const [tipsOpen, setTipsOpen] = useState(loadTipsOpen)
  // The Explorer's one-line tip stays until the first right-click there (remembered in this browser).
  const [explorerTipSeen, setExplorerTipSeen] = useState(loadExplorerTipSeen)
  const tipSeen = () => {
    saveExplorerTipSeen()
    setExplorerTipSeen(true)
  }
  const toggleTips = (open: boolean) => {
    saveTipsOpen(open)
    setTipsOpen(open)
  }
  // The welcome page is a tab (the brand opens it). On a first visit and once after each release (`RELEASES`; the
  // last one shown is remembered in this browser) it opens on start, when the visit starts on home; shown counts as
  // seen. Landing elsewhere keeps it for the next visit.
  const welcomed = useRef(false)
  // The address the visit started on (the address bar is rewritten once the workspace is read).
  const startedOn = useRef(parseHash(location.hash).name)
  useEffect(() => {
    if (!ws.ready || welcomed.current) return
    welcomed.current = true
    if (loadSeenRelease() === RELEASES[0].name || startedOn.current !== 'home') return
    saveSeenRelease(RELEASES[0].name)
    ws.showAppPage('welcome')
  }, [ws.ready])
  const chooseTheme = (id: ThemeId) => {
    document.documentElement.dataset.theme = id
    saveTheme(id)
    setTheme(id)
  }

  // A course left by every tab that showed it is dropped if it is a never-edited draft. A ref, not an effect cleanup,
  // so StrictMode's mount-unmount-mount doesn't drop it on arrival.
  const shownCourses = new Set<string>()
  for (const t of Object.values(ws.layout.tabs)) {
    if (t.data.kind !== 'doc' || t.data.route.name !== 'course' || !ws.docs.some((d) => d.id === (t.data as { doc: string }).doc)) continue
    const course = resolve(ws.doc(t.data.doc).library, t.data.route).course
    if (course) shownCourses.add(`${t.data.doc} ${course.id}`)
  }
  const shownKey = [...shownCourses].sort().join('|')
  const lastShown = useRef<string[]>([])
  useEffect(() => {
    const now = shownKey ? shownKey.split('|') : []
    for (const left of lastShown.current) {
      if (now.includes(left)) continue
      const [doc, course] = left.split(' ')
      ws.doc(doc).leaveCourse(course)
    }
    lastShown.current = now
  }, [shownKey])

  // A new course goes into the active file (a new one when none is open) and shows in the active group.
  // A new course in the active file (a new file when none is open), shown in `group` (default: where it opens).
  const newCourse = (group?: string) => {
    const docId = ws.active ?? ws.newDoc()
    const made = ws.doc(docId).addCourse()
    const route = { name: 'course', course: made.name } as const
    const tab = ws.openPlace(docId, route, group ? { group } : undefined)
    if (tab) tabNav(tab, route).goToNew(made.id, route)
  }

  const unsaved = ws.docs.some((d) => d.dirty)
  useEffect(() => {
    document.title = unsaved ? '* Shrimply Study' : 'Shrimply Study'
  }, [unsaved])

  // A shared Google Drive link opens its library as a file beside the others (or shows the one it is open in, bringing
  // its changes after asking), then goes home. Any other start takes a quiet look at each open Drive file, once (asks
  // nothing: their changes come only when pulled). Refs, so StrictMode's second run does nothing twice.
  const [driveOpen, setDriveOpen] = useState(false)
  // Google's file picker is a layer on the page, so the Drive dialog (on top of everything) closes while it shows, then
  // opens again with the picked files in its list.
  const pickFromDrive = async () => {
    setDriveOpen(false)
    await ws.drive.pick()
    setDriveOpen(true)
  }
  const driveId = hashRoute.name === 'drive' ? hashRoute.id : undefined
  const handledLink = useRef<string>(undefined)
  // A re-render once the link is handled (the address changes without an event then).
  const [, setDriveDone] = useState(0)
  const checkedDrive = useRef(false)
  useEffect(() => {
    if (!ws.ready) return
    if (!driveId) {
      handledLink.current = undefined
      if (!checkedDrive.current) for (const d of ws.docs) if (d.where === 'drive') void ws.doc(d.id).drive.refresh()
    } else if (handledLink.current !== driveId) {
      handledLink.current = driveId
      // Then the address shows the tab it opened in (or home when it did not open).
      void ws.openDrive(driveId).then(() => {
        const tab = latest.current.address
        history.replaceState({ tab: tab?.id ?? null }, '', addressFor(latest.current, tab))
        setDriveDone((n) => n + 1)
      })
    }
    checkedDrive.current = true
  }, [ws.ready, driveId])

  // ---- The Explorer ----

  // A node the Explorer is asked to show (from a tab's Reveal in Explorer), and a card to open in its quiz page's
  // card dialog (the Explorer's Edit on a card).
  const [reveal, setReveal] = useState<{ tab: string; node: string } | null>(null)
  const [openCard, setOpenCard] = useState<{ tab: string; card: string } | null>(null)
  // The Explorer acted in: the active tab when it is one, else the one used last (there may be several).
  const explorerTabOf = () => {
    const active = ws.layout.groups[ws.layout.activeGroup]?.active
    const tab = active ? ws.layout.tabs[active] : undefined
    if (tab?.data.kind === 'explorer') return tab
    const last = ws.recent.map((id) => ws.layout.tabs[id]).find((t) => t?.data.kind === 'explorer')
    return last ?? Object.values(ws.layout.tabs).find((t) => t.data.kind === 'explorer')
  }
  /**
   * Shows the Explorer: an Explorer tab, anywhere, is focused (the one used last); with none, it splits on the left
   * of the active group when the window is 1000px or wider and the group has room, else it opens as a tab.
   */
  const showExplorer = (node?: string) => {
    const main = groupsIn(ws.layout, MAIN)
    const beside = main.includes(ws.layout.activeGroup) ? ws.layout.activeGroup : main[0]
    const box = document.querySelector(`.wb-group[data-group="${beside}"]`)?.getBoundingClientRect()
    const hasTabs = Object.keys(ws.layout.tabs).length > 0
    const tab = ws.showExplorer(beside, hasTabs && innerWidth >= 1000 && (!box || canSplit(box, 'row')))
    if (node && tab) setReveal({ tab, node })
    bringForward()
  }
  // The page a node of the Explorer names: a file's home, a course, a quiz page (a card: its quiz page), or with
  // `edit` a quiz's editor.
  const placeOf = (node: DocNode, edit: boolean): Route | null => {
    if (node.kind === 'doc') return HOME
    const course = ws.doc(node.doc).library.courses.find((c) => c.id === node.course)
    if (!course) return null
    if (node.kind === 'course') return { name: 'course', course: course.name }
    const quiz = course.quizzes.find((q) => q.id === node.quiz)
    if (!quiz) return null
    return { name: edit && node.kind === 'quiz' ? 'edit' : 'quiz', course: course.name, quiz: quiz.name }
  }
  // What the Explorer opens goes to the group used last besides its own, or else a new tab beside it.
  const openFromExplorer = (node: DocNode, edit = false) => {
    const route = placeOf(node, edit)
    if (!route) return
    const tab = explorerTabOf()
    const home = tab ? groupOf(ws.layout, tab.id) : null
    const into = ws.recentGroup(home)
    const shown = into ? ws.openPlace(node.doc, route, { group: into }) : ws.openPlace(node.doc, route, { group: home ?? undefined, newTab: true })
    if (shown && edit && node.kind === 'card') setOpenCard({ tab: shown, card: node.card })
    bringForward()
  }
  // The Explorer's node for the place a tab shows.
  const nodeOfTab = (tab: Tab<TabData>): string | null => {
    if (tab.data.kind !== 'doc') return null
    const doc = tab.data.doc
    const { course, quiz } = resolve(ws.doc(doc).library, tab.data.route)
    if (quiz && course) return nodeOf({ kind: 'quiz', doc, course: course.id, quiz: quiz.id })
    if (course) return nodeOf({ kind: 'course', doc, course: course.id })
    return nodeOf({ kind: 'doc', doc })
  }

  // ---- Windows ----

  // Opening a page focuses the tab already showing it, in any window (asked for): its window comes to the front once
  // the focus has moved there (after the render that moves it).
  const [focusAsked, setFocusAsked] = useState(0)
  const bringForward = () => setFocusAsked((n) => n + 1)
  useEffect(() => {
    if (!focusAsked) return
    const win = windowOf(ws.layout, ws.layout.activeGroup)
    if (win && win !== MAIN) popups[win]?.focus()
    else if (win === MAIN && !document.hasFocus()) window.focus()
  }, [focusAsked])

  // The popup of each popped-out window, opened in the click (browsers block it otherwise).
  const [popups, setPopups] = useState<Record<string, Window>>({})
  const popOut = (groupId: string, tabId?: string) => {
    const win = `pop-${newId()}`
    const box = document.querySelector(`.wb-group[data-group="${groupId}"]`)?.getBoundingClientRect()
    const size = box ? { width: Math.round(box.width), height: Math.round(box.height) + 48 } : POPUP
    const opened = openPopup(win, new URL('popout.html', document.baseURI).href, { ...size, left: screenX + 48, top: screenY + 48 })
    if (!opened) return toasts.notify('warning', BLOCKED)
    setPopups((p) => ({ ...p, [win]: opened }))
    if (tabId) ws.popOutTab(tabId, win)
    else ws.popOut(groupId, win)
  }
  const dock = (win: string) => {
    ws.dock(win)
    setPopups((p) => {
      const rest = { ...p }
      delete rest[win]
      return rest
    })
  }
  // A window of the layout with no popup (lost) comes back docked; a popup whose window is gone is let go (the
  // workbench stops rendering it, which closes it).
  const windowsKey = Object.keys(ws.layout.windows).join(' ')
  useEffect(() => {
    for (const w of Object.keys(ws.layout.windows)) if (w !== MAIN && !popups[w]) ws.dock(w)
    if (Object.keys(popups).some((w) => !ws.layout.windows[w])) {
      setPopups((p) => Object.fromEntries(Object.entries(p).filter(([w]) => ws.layout.windows[w])))
    }
  }, [windowsKey, popups])
  const canPopOut = matchMedia('(min-width: 800px) and (pointer: fine)').matches

  // ---- Keys ----

  // Split the active group (Ctrl+\ when the focus is in no group, which handles its own).
  const splitActive = () => {
    const g = ws.layout.activeGroup
    const box = document.querySelector(`.wb-group[data-group="${g}"]`)?.getBoundingClientRect()
    if (!box || canSplit(box, 'row')) ws.split(g, 'row', 'after')
  }
  useKeydown((e) => {
    const mac = isMac(navigator.platform)
    // Ctrl+S saves the active file where it lives (see LibraryApi.save).
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      // Held down, the key repeats: one save is enough.
      if (e.repeat) return
      if (lib) void lib.save()
    }
    // Ctrl+Alt+S saves every file with changes. By `code`, as Ctrl+Alt is AltGr on some layouts: there it only counts
    // outside a text field, where AltGr+S may type a letter.
    const saveAll = (mac ? e.metaKey : e.ctrlKey) && e.altKey && !e.shiftKey && e.code === 'KeyS'
    if (saveAll && (e.key.toLowerCase() === 's' || !isEditable(e.target))) {
      e.preventDefault()
      if (!e.repeat) void ws.saveAll()
    }
    // Undo and redo, app-wide; inside a text field the browser's own (that field's typing).
    const undoing = matches(e, 'Mod+Z', mac)
    const redoing = matches(e, 'Mod+Shift+Z', mac) || (!mac && matches(e, 'Ctrl+Y', mac))
    if ((undoing || redoing) && !isEditable(e.target)) {
      e.preventDefault()
      if (undoing) ws.undo()
      else ws.redo()
    }
    if (matches(e, 'Mod+Shift+E', mac)) {
      e.preventDefault()
      if (!e.repeat) showExplorer()
    }
    if (matches(e, 'Mod+\\', mac) && !e.defaultPrevented && !isEditable(e.target) && !own) {
      e.preventDefault()
      if (!e.repeat) splitActive()
    }
    // Ctrl+Alt+Shift+D shows or hides the debug bar on any page. By `code`, as Ctrl+Alt is AltGr on some layouts.
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyD' && !e.repeat) {
      e.preventDefault()
      setDebugBar((on) => !on)
    }
  })
  useSpellcheckOnFocus()

  // What each tab's page was found as, to follow a rename by id (see crumbs).
  const found = useRef(new Map<string, Found>())

  if (!ws.ready) return null

  // ---- The workbench ----

  const wbDocs: Record<string, WorkbenchDoc> = Object.fromEntries(
    ws.docs.map((d) => [d.id, { name: d.name, dirty: d.dirty, library: ws.doc(d.id).library }]),
  )
  // A hidden file's tabs say only that (asked for: nothing of the user's own Drive files shows signed out).
  for (const t of Object.values(ws.layout.tabs)) {
    if (t.data.kind === 'doc' && ws.isHidden(t.data.doc)) wbDocs[t.data.doc] = { name: 'Hidden file', dirty: false, library: emptyLibrary() }
  }
  // A pane's breadcrumbs: the file (its home, under the file's name as it is now), then the course and quiz the tab's
  // page names, followed by id through a rename (as the page is: the tab's route takes the new name only once the
  // typing pauses). A page that is gone shows the file alone while the pane moves on. None for a study session or
  // the Explorer (each has a head of its own, the same height); the app's own pages are under the app's name.
  const crumbs = (tab: Tab<TabData>): Crumb[] => {
    if (tab.data.kind === 'changelog' || tab.data.kind === 'welcome') return [{ label: 'Shrimply Study', icon: 'app' }, { label: APP_PAGE_TITLE[tab.data.kind] }]
    if (tab.data.kind !== 'doc' || !wbDocs[tab.data.doc]) return []
    if (ws.isHidden(tab.data.doc)) return [{ label: 'Hidden file', icon: 'drive' }]
    const r = tab.data.route
    if (r.name === 'study') return []
    const name = wbDocs[tab.data.doc].name
    const library = wbDocs[tab.data.doc].library
    const where = ws.docs.find((d) => d.id === (tab.data as { doc: string }).doc)?.where
    // The file starts every trail, marked by where it lives, so even a home reads as a trail: file › page.
    if (r.name === 'home') {
      const page = library.courses.length === 0 ? 'Start studying in three steps' : 'Your courses'
      return [{ label: name, icon: where }, { label: page }]
    }
    const named = resolve(library, r)
    if (!named.missing) found.current.set(tab.id, { key: href(r), place: named })
    const { course, quiz } = named.missing ? (followRename(library, r, found.current.get(tab.id))?.place ?? named) : named
    if (!course || (r.name !== 'course' && !quiz)) return [{ label: name, icon: where }]
    const file: Crumb = { label: name, route: HOME, icon: where }
    if (r.name === 'course') return [file, { label: course.name }]
    const up: Crumb = { label: course.name, route: { name: 'course', course: course.name } }
    if (r.name === 'quiz') return [file, up, { label: quiz!.name }]
    return [file, up, { label: quiz!.name, route: { name: 'quiz', course: course.name, quiz: quiz!.name } }, { label: 'Edit' }]
  }

  const shared: PaneShared = {
    ws,
    notify: toasts.notify,
    ask: askConfirm,
    navOps,
    prefs,
    setPrefs: choosePrefs,
    collapsed,
    setCollapsed,
    tipsOpen,
    setTipsOpen: toggleTips,
    explorerTipSeen,
    onExplorerTipSeen: tipSeen,
    openDrive: () => setDriveOpen(true),
    openFile: async () => (await ws.openFile()) !== null,
    openGuide: async () => (await ws.openLibrary(loadGuide, 'Guide')) !== null,
    newCourse,
    openNode: (node) => openFromExplorer(node),
    editNode: (ref) => openFromExplorer(ref, true),
    reveal,
    onRevealed: () => setReveal(null),
    openCard,
    onCardOpened: () => setOpenCard(null),
  }

  // The tree in the sidebar marks the page the active file's tab shows.
  const shownTab = [ws.layout.groups[ws.layout.activeGroup]?.active, ...ws.recent]
    .map((id) => (id ? ws.layout.tabs[id] : undefined))
    .find((t) => t?.data.kind === 'doc' && t.data.doc === ws.active)
  const place = lib && shownTab?.data.kind === 'doc' ? resolve(lib.library, shownTab.data.route) : {}
  const current = place.quiz?.id ?? place.course?.id

  // A study session alone in the main window keeps the full-screen look: the shell steps aside (CSS), and the
  // workbench stays mounted, so nothing else is lost (popped-out windows neither).
  const studyAlone = !own && groupsIn(ws.layout, MAIN).length === 1 && addr?.data.kind === 'doc' && addr.data.route.name === 'study'
  // With no file open and no tab, the page is the welcome page.
  const welcomeOnly = !own && ws.docs.length === 0 && Object.keys(ws.layout.tabs).length === 0
  const fullPage = hashRoute.name === 'workbench'
  // The popped-out windows, newest last: an empty group says how many tabs are in them.
  const popped = poppedOut(ws.layout, (w) => !!popups[w])
  const appClass = ['app', sidebarOpen ? '' : 'is-side-closed', studyAlone ? 'is-session' : ''].filter(Boolean).join(' ')

  return (
    <>
      {hashRoute.name === 'workbench' && <WorkbenchDemo />}
      {/* Full-screen pages of the app take the window, as before (a popped-out window closes meanwhile, and its
          tabs come back docked). */}
      {!fullPage && (
      <div className={appClass}>
        <Sidebar
          ws={ws}
          lib={lib}
          current={current}
          open={sidebarOpen}
          setOpen={setSidebarOpen}
          theme={theme}
          setTheme={chooseTheme}
          onDrive={() => setDriveOpen(true)}
          onNewCourse={() => newCourse()}
          onExplorer={() => showExplorer()}
          onHome={() => {
            ws.showAppPage('welcome')
            bringForward()
          }}
          onWhatsNew={() => {
            ws.showAppPage('changelog')
            bringForward()
          }}
          onFile={(id) => {
            ws.openPlace(id, HOME)
            bringForward()
          }}
          onOpen={(route, newTab) => {
            if (ws.active) ws.openPlace(ws.active, route, newTab ? { newTab: true, background: true } : undefined)
            bringForward()
          }}
        />
        {hashRoute.name === 'debug' && (
          <main className="page own-page">
            <DebugScreen
              lib={lib}
              ensureDoc={() => lib ?? ws.doc(ws.newDoc())}
              openLibrary={(load, name) => ws.openLibrary(load, name)}
              newDoc={() => ws.newDoc()}
              signOut={ws.drive.signOut}
              notify={toasts.notify}
              debugBar={debugBar}
              setDebugBar={setDebugBar}
            />
          </main>
        )}
        {welcomeOnly && (
          <main className="page own-page">
            <HomeScreen
              lib={null}
              nav={null}
              driveSetUp={ws.drive.setUp}
              loadLabel={ws.loadLabel}
              loadHint={ws.loadHint}
              openFile={shared.openFile}
              openGuide={shared.openGuide}
              newCourse={() => newCourse()}
              welcome
              openDrive={() => setDriveOpen(true)}
            />
          </main>
        )}
        <div className="wb-cell" hidden={own || welcomeOnly}>
          <Workbench
            layout={ws.layout}
            docs={wbDocs}
            popups={popups}
            renderTab={(tab, shown) => {
              const group = groupOf(ws.layout, tab.id)
              return <PaneScreen tab={tab} group={group} shown={shown} active={shown && !own && group === ws.layout.activeGroup} s={shared} />
            }}
            crumbs={crumbs}
            onCrumb={(tabId, route) => {
              const tab = ws.layout.tabs[tabId]
              if (tab?.data.kind === 'doc') tabNav(tabId, tab.data.route).go(route)
            }}
            on={{
              activate: ws.activateTab,
              activateGroup: ws.activateGroup,
              close: ws.closeTabs,
              closeOthers: ws.closeOthers,
              closeAll: ws.closeAll,
              move: ws.moveTab,
              split: ws.split,
              duplicate: ws.duplicateTab,
              join: ws.join,
              resize: ws.resize,
              popOut,
              dock,
              saveDoc: (docId) => void ws.doc(docId).save(),
              saveAll: () => void ws.saveAll(),
              revealInExplorer: (tab) => showExplorer(nodeOfTab(tab) ?? undefined),
              copyText: (text) =>
                void navigator.clipboard.writeText(text).then(
                  () => toasts.notify('info', 'Copied the path.'),
                  () => toasts.notify('error', 'Could not copy.'),
                ),
            }}
            canPopOut={canPopOut}
            renderEmpty={(groupId) => (
              <EmptyPane
                docs={ws.docs}
                onExplorer={() => showExplorer()}
                onNewFile={() => void ws.newDoc()}
                onOpenFile={() => void ws.openFile()}
                onOpenDoc={(id) => {
                  ws.openPlace(id, HOME, { group: groupId })
                  bringForward()
                }}
                elsewhere={popped.reduce((n, w) => n + w.tabs.length, 0)}
                onShowElsewhere={() => popups[popped[popped.length - 1]?.win]?.focus()}
                onDockAll={() => popped.forEach((w) => dock(w.win))}
                onWhatsNew={(background) => {
                  ws.showAppPage('changelog', groupId, background)
                  bringForward()
                }}
              />
            )}
          />
        </div>
        {driveOpen && (
          <DriveDialog
            drive={lib?.drive ?? ws.drive}
            hasDoc={!!lib}
            hasChanges={!!lib?.hasChanges}
            onClose={() => setDriveOpen(false)}
            onPick={() => void pickFromDrive()}
          />
        )}
      </div>
      )}
      {/* Outside the shell so running timers survive the app's own pages. */}
      <Toasts toasts={toasts.toasts} dismiss={toasts.dismiss} />
      {debugBar && <DebugBar onClose={() => setDebugBar(false)} theme={theme} setTheme={chooseTheme} />}
    </>
  )
}
