import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { StudyOptions } from '../model'
import { parseHash, usePlaceFor, type Route } from '../route'
import type { Tab } from '../kit/layout'
import type { DocId, ItemRef } from '../logic/contentOps'
import type { TabData } from '../logic/workbenchActions'
import type { LibraryApi, WorkspaceApi } from '../state/useWorkspace'
import type { askConfirm } from '../components/ConfirmDialog'
import type { Notify } from '../components/Toasts'
import { HomeScreen } from '../screens/HomeScreen'
import { CourseScreen } from '../screens/CourseScreen'
import { QuizScreen } from '../screens/QuizScreen'
import { EditScreen } from '../screens/EditScreen'
import { StudyScreen } from '../screens/StudyScreen'
import { ExplorerPane } from './ExplorerPane'
import { makeTabNav, type TabNavOps } from './tabNav'

/** What every tab's screen shares, from App. */
export type PaneShared = {
  ws: WorkspaceApi
  notify: Notify
  ask: typeof askConfirm
  navOps: TabNavOps
  prefs: StudyOptions
  setPrefs(options: StudyOptions): void
  collapsed: ReadonlySet<string>
  setCollapsed(collapsed: ReadonlySet<string>): void
  tipsOpen: boolean
  setTipsOpen(open: boolean): void
  /** Home is the welcome page (a first visit, or once after a release). */
  welcome: boolean
  endWelcome(): void
  openDrive(): void
  openFile(): Promise<boolean>
  openGuide(): Promise<boolean>
  /** "New course": into the active file (the pane's, once it is pointed at), or a new one. */
  newCourse(): void
  /** The Explorer's: where it opens and edits things, and the node to reveal. */
  openNode(node: ItemRef | { kind: 'doc'; doc: DocId }): void
  editNode(ref: ItemRef): void
  reveal: string | null
  onRevealed(): void
  /** A card to open in its quiz page's card dialog (from the Explorer's Edit), for one tab. */
  openCard: { tab: string; card: string } | null
  onCardOpened(): void
}

type Props = {
  tab: Tab<TabData>
  /** The tab's group, to open a link in a new tab beside it. */
  group: string | null
  /** The tab is the one its group shows. */
  shown: boolean
  /** Shown in the active group: only then do its keys (study) work. */
  active: boolean
  s: PaneShared
}

// Pages of a file a link may name; the app's own pages (changelog, debug) are left to the address bar.
const FILE_PAGES: Route['name'][] = ['home', 'course', 'quiz', 'edit', 'study']

/** One tab's screen: a file's page (its own route and navigation), the Explorer, or the welcome page. */
export function PaneScreen({ tab, group, shown, active, s }: Props) {
  const d = tab.data
  if (d.kind === 'explorer') {
    return (
      <ExplorerPane
        ws={s.ws}
        notify={s.notify}
        ask={s.ask}
        openNode={s.openNode}
        editNode={s.editNode}
        reveal={s.reveal}
        onRevealed={s.onRevealed}
      />
    )
  }
  if (d.kind === 'welcome' || !s.ws.docs.some((x) => x.id === d.doc)) {
    return (
      <div className="page">
        <Home lib={null} s={s} />
      </div>
    )
  }
  return <DocPane tab={tab as Tab<Extract<TabData, { kind: 'doc' }>>} group={group} shown={shown} active={active} s={s} />
}

function Home({ lib, s }: { lib: LibraryApi | null; s: PaneShared }) {
  return (
    <HomeScreen
      lib={lib}
      driveSetUp={s.ws.drive.setUp}
      loadLabel={s.ws.loadLabel}
      loadHint={s.ws.loadHint}
      openFile={s.openFile}
      openGuide={s.openGuide}
      newCourse={s.newCourse}
      welcome={s.welcome}
      endWelcome={s.endWelcome}
      openDrive={s.openDrive}
    />
  )
}

function DocPane({ tab, group, shown, active, s }: Omit<Props, 'tab'> & { tab: Tab<Extract<TabData, { kind: 'doc' }>> }) {
  const { ws } = s
  const lib = ws.doc(tab.data.doc)
  const route = tab.data.route
  const nav = makeTabNav(tab.id, route, s.navOps)
  // The course and quiz the tab's route names (renames followed: the route moves to the new name once the typing
  // pauses). One that is gone (deleted, an old link) leads to the nearest page that still exists, with a note.
  const { course, quiz, missing } = usePlaceFor(lib.library, route, (r) => nav.redirect(r))
  // A library just replaced (pulled, reloaded, taken from another tab) takes its pages with it on purpose: then the
  // move is quiet.
  const seenReplaced = useRef(lib.replaced)
  useEffect(() => {
    const replacedSince = seenReplaced.current !== lib.replaced
    seenReplaced.current = lib.replaced
    if (!missing || !('course' in route)) return
    const name = missing === 'quiz' && 'quiz' in route ? route.quiz : route.course
    if (!replacedSince) s.notify('info', `Couldn't find the ${missing} "${name}"`)
    nav.redirect(course ? { name: 'course', course: course.name } : { name: 'home' })
  }, [missing, lib.replaced])

  // The pane scrolls, and its tabs share it: each tab keeps its own place, and a new page opens at the top. Layout
  // effects, so a page never paints scrolled elsewhere. By id, so renaming the page's course or quiz keeps it.
  const box = useRef<HTMLDivElement>(null)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const scrolled = useRef(0)
  useLayoutEffect(() => setScroller(box.current?.closest<HTMLElement>('.pane-body') ?? null), [])
  useLayoutEffect(() => {
    if (!shown || !scroller) return
    scroller.scrollTop = scrolled.current
    const keep = () => (scrolled.current = scroller.scrollTop)
    scroller.addEventListener('scroll', keep, { passive: true })
    return () => scroller.removeEventListener('scroll', keep)
  }, [shown, scroller])
  const page = [route.name, course?.id, quiz?.id].join('/')
  useLayoutEffect(() => {
    scrolled.current = 0
    if (shown && scroller) scroller.scrollTop = 0
  }, [page])

  // Links to a page of this file go through the tab (the address bar follows only the main window's active tab);
  // Ctrl or the middle button opens it in a new tab beside this one.
  const follow = (e: MouseEvent<HTMLElement>, newTab: boolean) => {
    const link = (e.target as Element).closest?.('a[href^="#/"]')
    if (!link || e.defaultPrevented || e.shiftKey || e.altKey) return
    const to = parseHash(link.getAttribute('href') ?? '')
    if (!FILE_PAGES.includes(to.name)) return
    e.preventDefault()
    if (newTab) ws.openPlace(tab.data.doc, to, { group: group ?? undefined, newTab: true, background: true })
    else nav.go(to)
  }

  let screen: ReactNode = null
  if (route.name === 'course' && course) screen = <CourseScreen key={course.id} lib={lib} courseId={course.id} nav={nav} />
  else if (route.name === 'quiz' && quiz) {
    const card = s.openCard?.tab === tab.id ? s.openCard.card : null
    screen = (
      <QuizScreen
        lib={lib}
        quizId={quiz.id}
        prefs={s.prefs}
        setPrefs={s.setPrefs}
        collapsed={s.collapsed}
        setCollapsed={s.setCollapsed}
        tipsOpen={s.tipsOpen}
        setTipsOpen={s.setTipsOpen}
        nav={nav}
        notify={s.notify}
        undo={ws.undo}
        openCard={card}
        onCardOpened={s.onCardOpened}
      />
    )
  } else if (route.name === 'edit' && quiz) {
    screen = (
      <EditScreen key={quiz.id} lib={lib} quizId={quiz.id} notify={s.notify} undo={ws.undo} collapsed={s.collapsed} setCollapsed={s.setCollapsed} nav={nav} />
    )
  } else if (route.name === 'study' && quiz) {
    return (
      <div ref={box} className="pane-session">
        <StudyScreen key={quiz.id + route.format} lib={lib} notify={s.notify} quizId={quiz.id} format={route.format} prefs={s.prefs} nav={nav} active={active} />
      </div>
    )
  } else if (!('course' in route)) screen = <Home lib={lib} s={s} />

  return (
    <div ref={box} className="page" onClick={(e) => follow(e, e.ctrlKey || e.metaKey)} onAuxClick={(e) => e.button === 1 && follow(e, true)}>
      {screen}
    </div>
  )
}
