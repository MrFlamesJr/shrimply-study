import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { goToNew, href, parseHash, redirect, usePlace, useRoute, type Route } from './route'
import { emptyLibrary, type StudyOptions, type ThemeId } from './model'
import { useWorkspace } from './state/useWorkspace'
import { isEditable, isMac, matches } from './kit/shortcuts'
import { fileStorage, loadGuide } from './storage/fileStorage'
import { loadTheme, saveTheme } from './storage/themePref'
import { loadTipsOpen, saveTipsOpen } from './storage/tipsPref'
import { loadStudyOptions, saveStudyOptions } from './storage/studyPref'
import { loadSeenRelease, saveSeenRelease } from './storage/welcomePref'
import { RELEASES } from './releaseNotes'
import { TopBar } from './layout/TopBar'
import { Sidebar, useSidebarOpen } from './layout/Sidebar'
import { useKeydown } from './hooks/useKeydown'
import { useSpellcheckOnFocus } from './hooks/useSpellcheckOnFocus'
import { HomeScreen } from './screens/HomeScreen'
import { CourseScreen } from './screens/CourseScreen'
import { QuizScreen } from './screens/QuizScreen'
import { EditScreen } from './screens/EditScreen'
import { StudyScreen } from './screens/StudyScreen'
import { DebugScreen } from './screens/DebugScreen'
import { DebugBar } from './screens/debug/DebugBar'
import { ChangelogScreen } from './screens/ChangelogScreen'
import { WorkbenchDemo } from './kit/demo/WorkbenchDemo'
import { Toasts, useToasts } from './components/Toasts'
import { BackToTop } from './components/BackToTop'
import { askChoice, askConfirm } from './components/ConfirmDialog'
import { DriveDialog } from './components/DriveDialog'

// The library shown while no file is open (home is then the welcome page).
const NO_LIBRARY = emptyLibrary()
// Pages that belong to no file: they stay when the last file closes.
const OWN_PAGES: Route['name'][] = ['debug', 'changelog', 'workbench']

// The page shown always belongs to the active file: switching files shows the page its tab was on (written into the
// address bar at once, so the next render already reads it), and with no file left, home.
function showTab(to: Route | null) {
  const here = parseHash(location.hash)
  const next = to ?? (OWN_PAGES.includes(here.name) ? here : { name: 'home' })
  if (location.hash !== href(next)) location.replace(href(next))
}

export function App() {
  const toasts = useToasts()
  const ws = useWorkspace(fileStorage, toasts.notify, askConfirm, askChoice, showTab)
  // The active file's library; null when no file is open.
  const lib = ws.active ? ws.doc(ws.active) : null
  const route = useRoute()
  // The active file's tab keeps the page it shows (the address bar's), so switching back to it shows that page again.
  // A Drive link is never kept: it would open again.
  const hash = location.hash
  useEffect(() => {
    if (ws.ready && route.name !== 'drive') ws.setRoute(route)
  }, [ws.ready, hash])
  // The study options (mode, side, order), remembered in this browser so a reload or a new tab keeps them.
  const [prefs, setPrefs] = useState(loadStudyOptions)
  const choosePrefs = (options: StudyOptions) => {
    saveStudyOptions(options)
    setPrefs(options)
  }
  // Ids of the groups folded shut, for this visit only (not in the file). Kept here so they survive Edit and Done.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen()
  const [debugBar, setDebugBar] = useState(false)
  // The theme is `data-theme` on <html> (set from the remembered one in main.tsx). Set before the re-render,
  // so anything that reads computed styles while rendering (the debug page's tokens) sees the new theme.
  const [theme, setTheme] = useState(loadTheme)
  // The quiz page's "How studying works" box: whole, or minimized to its title (remembered in this browser).
  const [tipsOpen, setTipsOpen] = useState(loadTipsOpen)
  const toggleTips = (open: boolean) => {
    saveTipsOpen(open)
    setTipsOpen(open)
  }
  // Home is the welcome page whenever the library is empty, and also on a first visit and once after each release
  // (`RELEASES`; the last one shown is remembered in this browser). Shown counts as seen; it ends with its main
  // button, a library it opened, or leaving home. Landing elsewhere keeps it for the next visit.
  const [welcome, setWelcome] = useState(() => loadSeenRelease() !== RELEASES[0].name)
  const welcoming = welcome && route.name === 'home'
  useEffect(() => {
    if (welcoming) saveSeenRelease(RELEASES[0].name)
    else setWelcome(false)
  }, [welcoming])
  const chooseTheme = (id: ThemeId) => {
    document.documentElement.dataset.theme = id
    saveTheme(id)
    setTheme(id)
  }

  // The course and quiz the address names (renames followed). One that is gone (deleted, an old link) leads to the nearest
  // page that still exists, its course or home, with a note saying what was not found.
  const { course, quiz, missing } = usePlace(lib?.library ?? NO_LIBRARY, route)
  const lost = ws.ready ? missing : undefined
  // A library just replaced (pulled, reloaded, taken from another tab) takes its pages with it on purpose: then the
  // move is quiet.
  const replaced = { doc: ws.active, count: lib?.replaced ?? 0 }
  const seenReplaced = useRef(replaced)
  useEffect(() => {
    const replacedSince = seenReplaced.current.doc === replaced.doc && seenReplaced.current.count !== replaced.count
    seenReplaced.current = replaced
    if (!lost || !('course' in route)) return
    const name = lost === 'quiz' && 'quiz' in route ? route.quiz : route.course
    if (!replacedSince) toasts.notify('info', `Couldn't find the ${lost} "${name}"`)
    redirect(course ? { name: 'course', course: course.name } : { name: 'home' })
  }, [lost, replaced.doc, replaced.count])

  // Leaving a course page (or its file) drops the course if it is a never-edited draft. A ref, not an effect cleanup,
  // so StrictMode's mount-unmount-mount doesn't drop it on arrival.
  const courseId = route.name === 'course' ? course?.id : undefined
  const lastCourse = useRef({ doc: ws.active, course: courseId })
  useEffect(() => {
    const left = lastCourse.current
    lastCourse.current = { doc: ws.active, course: courseId }
    if (left.doc && left.course && (left.course !== courseId || left.doc !== ws.active)) ws.doc(left.doc).leaveCourse(left.course)
  }, [courseId, ws.active])

  // A new course goes into the active file, or into a new one when none is open.
  const newCourse = () => {
    const into = lib ?? ws.doc(ws.newDoc())
    const made = into.addCourse()
    goToNew(made.id, { name: 'course', course: made.name })
  }

  // The page scrolls the window, so a new page would open at the last one's scroll position. A layout
  // effect, so the new page never paints scrolled down. By id, so renaming the page's course or quiz keeps it.
  const page = [route.name, course?.id, quiz?.id].join('/')
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  const unsaved = ws.docs.some((d) => d.dirty)
  useEffect(() => {
    document.title = unsaved ? '* Shrimply Study' : 'Shrimply Study'
  }, [unsaved])

  // A shared Google Drive link opens its library as a file beside the others (or shows the one it is open in, bringing
  // its changes after asking), then goes home, which shows underneath meanwhile. Any other start takes a quiet look at
  // each open Drive file, once (asks nothing: their changes come only when pulled).
  // Refs, so StrictMode's second run does nothing twice.
  const [driveOpen, setDriveOpen] = useState(false)
  // Google's file picker is a layer on the page, so the Drive dialog (on top of everything) closes while it shows, then
  // opens again with the picked files in its list.
  const pickFromDrive = async () => {
    setDriveOpen(false)
    await ws.drive.pick()
    setDriveOpen(true)
  }
  const driveId = route.name === 'drive' ? route.id : undefined
  const handledLink = useRef<string>(undefined)
  const checkedDrive = useRef(false)
  useEffect(() => {
    if (!ws.ready) return
    if (!driveId) {
      handledLink.current = undefined
      if (!checkedDrive.current) for (const d of ws.docs) if (d.where === 'drive') void ws.doc(d.id).drive.refresh()
    } else if (handledLink.current !== driveId) {
      handledLink.current = driveId
      void ws.openDrive(driveId).then(() => redirect({ name: 'home' }))
    }
    checkedDrive.current = true
  }, [ws.ready, driveId])

  useKeydown((e) => {
    // Ctrl+S saves the active file where it lives (see LibraryApi.save).
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      // Held down, the key repeats: one save is enough.
      if (e.repeat) return
      if (lib) void lib.save()
    }
    // Undo and redo, app-wide; inside a text field the browser's own (that field's typing).
    const mac = isMac(navigator.platform)
    const undoing = matches(e, 'Mod+Z', mac)
    const redoing = matches(e, 'Mod+Shift+Z', mac) || (!mac && matches(e, 'Ctrl+Y', mac))
    if ((undoing || redoing) && !isEditable(e.target)) {
      e.preventDefault()
      if (undoing) ws.undo()
      else ws.redo()
    }
    // Ctrl+Alt+Shift+D shows or hides the debug bar on any page. By `code`, as Ctrl+Alt is AltGr on some layouts.
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyD' && !e.repeat) {
      e.preventDefault()
      setDebugBar((on) => !on)
    }
  })
  useSpellcheckOnFocus()

  if (!ws.ready) return null
  return (
    <>
      {route.name === 'study' ? (
        lib && quiz && <StudyScreen key={quiz.id + route.format} lib={lib} notify={toasts.notify} quizId={quiz.id} format={route.format} prefs={prefs} />
      ) : route.name === 'changelog' ? (
        <ChangelogScreen />
      ) : route.name === 'workbench' ? (
        <WorkbenchDemo />
      ) : (
        <div className="app">
          <Sidebar
            ws={ws}
            lib={lib}
            current={quiz?.id ?? course?.id}
            open={sidebarOpen}
            setOpen={setSidebarOpen}
            theme={theme}
            setTheme={chooseTheme}
            onDrive={() => setDriveOpen(true)}
            onNewCourse={newCourse}
          />
          <TopBar
            lib={lib}
            openFile={() => void ws.openFile()}
            loadLabel={ws.loadLabel}
            loadHint={ws.loadHint}
            page={route.name}
            course={course}
            quiz={quiz}
            onDrive={() => setDriveOpen(true)}
          />
          <main className="page">
            {/* Keyed by id, not the address, so a rename keeps the screen (and the name field's focus). */}
            {(route.name === 'home' || route.name === 'drive') && (
              <HomeScreen
                lib={lib}
                driveSetUp={ws.drive.setUp}
                loadLabel={ws.loadLabel}
                loadHint={ws.loadHint}
                openFile={async () => (await ws.openFile()) !== null}
                openGuide={async () => (await ws.openLibrary(loadGuide, 'Guide')) !== null}
                newCourse={newCourse}
                welcome={welcome}
                endWelcome={() => setWelcome(false)}
                openDrive={() => setDriveOpen(true)}
              />
            )}
            {route.name === 'course' && lib && course && <CourseScreen key={course.id} lib={lib} courseId={course.id} />}
            {route.name === 'quiz' && lib && quiz && (
              <QuizScreen lib={lib} quizId={quiz.id} prefs={prefs} setPrefs={choosePrefs}collapsed={collapsed} setCollapsed={setCollapsed} tipsOpen={tipsOpen} setTipsOpen={toggleTips} />
            )}
            {route.name === 'edit' && lib && quiz && (
              <EditScreen key={quiz.id} lib={lib} quizId={quiz.id} notify={toasts.notify} collapsed={collapsed} setCollapsed={setCollapsed} />
            )}
            {route.name === 'debug' && (
              <DebugScreen
                lib={lib}
                ensureDoc={() => lib ?? ws.doc(ws.newDoc({ name: 'debug' }))}
                openLibrary={(load, name) => ws.openLibrary(load, name, { name: 'debug' })}
                newDoc={() => ws.newDoc({ name: 'debug' })}
                signOut={ws.drive.signOut}
                notify={toasts.notify}
                debugBar={debugBar}
                setDebugBar={setDebugBar}
              />
            )}
          </main>
          <BackToTop scroller={window} />
          {driveOpen && (
            <DriveDialog
              drive={lib?.drive ?? ws.drive}
              hasDoc={!!lib}
              hasChanges={!!lib?.hasChanges}
              onClose={() => setDriveOpen(false)}
              onOpened={() => setWelcome(false)}
              onPick={() => void pickFromDrive()}
            />
          )}
        </div>
      )}
      {/* Outside the route switch so running timers survive navigation. */}
      <Toasts toasts={toasts.toasts} dismiss={toasts.dismiss} />
      {debugBar && <DebugBar onClose={() => setDebugBar(false)} theme={theme} setTheme={chooseTheme} />}
    </>
  )
}
