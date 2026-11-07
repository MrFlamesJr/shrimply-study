import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { redirect, usePlace, useRoute } from './route'
import type { StudyOptions, ThemeId } from './model'
import { useLibrary } from './state/useLibrary'
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
import { Toasts, useToasts } from './components/Toasts'
import { BackToTop } from './components/BackToTop'
import { askConfirm } from './components/ConfirmDialog'
import { DriveDialog } from './components/DriveDialog'

export function App() {
  const toasts = useToasts()
  const lib = useLibrary(fileStorage, toasts.notify, askConfirm)
  const route = useRoute()
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
  const { course, quiz, missing } = usePlace(lib.library, route)
  const lost = lib.ready ? missing : undefined
  // A library just replaced (pulled, opened, started anew) takes its pages with it on purpose: then the move is quiet.
  const seenReplaced = useRef(lib.replaced)
  useEffect(() => {
    const replacedSince = seenReplaced.current !== lib.replaced
    seenReplaced.current = lib.replaced
    if (!lost || !('course' in route)) return
    const name = lost === 'quiz' && 'quiz' in route ? route.quiz : route.course
    if (!replacedSince) toasts.notify('info', `Couldn't find the ${lost} "${name}"`)
    redirect(course ? { name: 'course', course: course.name } : { name: 'home' })
  }, [lost, lib.replaced])

  // Leaving a course page drops the course if it is a never-edited draft. A ref, not an effect cleanup,
  // so StrictMode's mount-unmount-mount doesn't drop it on arrival.
  const courseId = route.name === 'course' ? course?.id : undefined
  const lastCourseId = useRef(courseId)
  useEffect(() => {
    const left = lastCourseId.current
    lastCourseId.current = courseId
    if (left && left !== courseId) lib.leaveCourse(left)
  }, [courseId])

  // The page scrolls the window, so a new page would open at the last one's scroll position. A layout
  // effect, so the new page never paints scrolled down. By id, so renaming the page's course or quiz keeps it.
  const page = [route.name, course?.id, quiz?.id].join('/')
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  useEffect(() => {
    document.title = lib.hasChanges ? '* Shrimply Study' : 'Shrimply Study'
  }, [lib.hasChanges])

  // A shared Google Drive link opens its library (asking first when there is anything to lose), then goes home,
  // which shows underneath meanwhile. Any other start takes a quiet look at the library's Drive file, once (asks nothing:
  // its changes come only when pulled).
  // Refs, so StrictMode's second run does nothing twice.
  const [driveOpen, setDriveOpen] = useState(false)
  // Google's file picker is a layer on the page, so the Drive dialog (on top of everything) closes while it shows, then
  // opens again with the picked files in its list.
  const pickFromDrive = async () => {
    setDriveOpen(false)
    await lib.drive.pick()
    setDriveOpen(true)
  }
  const driveId = route.name === 'drive' ? route.id : undefined
  const handledLink = useRef<string>(undefined)
  const checkedDrive = useRef(false)
  useEffect(() => {
    if (!lib.ready) return
    if (!driveId) {
      handledLink.current = undefined
      if (!checkedDrive.current) void lib.drive.refresh()
    } else if (handledLink.current !== driveId) {
      handledLink.current = driveId
      void lib.drive.open(driveId).then(() => redirect({ name: 'home' }))
    }
    checkedDrive.current = true
  }, [lib.ready, driveId])

  useKeydown((e) => {
    // Ctrl+S does what the top row's Drive save does: into the library's Drive file when that is the user's own (when
    // there is something to save), or the user's own copy of someone else's; a download when it has no Drive file.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      // Held down, the key repeats: one save (or download) is enough.
      if (e.repeat) return
      if (!lib.drive.file) void lib.download()
      else if (!lib.drive.savesInto) void lib.drive.saveCopy()
      else if (lib.hasChanges) void lib.drive.save()
      else toasts.notify('info', 'No changes to save.')
    }
    // Ctrl+Alt+Shift+D shows or hides the debug bar on any page. By `code`, as Ctrl+Alt is AltGr on some layouts.
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyD' && !e.repeat) {
      e.preventDefault()
      setDebugBar((on) => !on)
    }
  })
  useSpellcheckOnFocus()

  if (!lib.ready) return null
  return (
    <>
      {route.name === 'study' ? (
        quiz && <StudyScreen key={quiz.id + route.format} lib={lib} notify={toasts.notify} quizId={quiz.id} format={route.format} prefs={prefs} />
      ) : route.name === 'changelog' ? (
        <ChangelogScreen />
      ) : (
        <div className="app">
          <Sidebar
            lib={lib}
            current={quiz?.id ?? course?.id}
            open={sidebarOpen}
            setOpen={setSidebarOpen}
            theme={theme}
            setTheme={chooseTheme}
          />
          <TopBar lib={lib} page={route.name} course={course} quiz={quiz} onDrive={() => setDriveOpen(true)} />
          <main className="page">
            {/* Keyed by id, not the address, so a rename keeps the screen (and the name field's focus). */}
            {(route.name === 'home' || route.name === 'drive') && (
              <HomeScreen
                lib={lib}
                guide={loadGuide}
                welcome={welcome}
                endWelcome={() => setWelcome(false)}
                openDrive={() => setDriveOpen(true)}
              />
            )}
            {route.name === 'course' && course && <CourseScreen key={course.id} lib={lib} courseId={course.id} />}
            {route.name === 'quiz' && quiz && (
              <QuizScreen lib={lib} quizId={quiz.id} prefs={prefs} setPrefs={choosePrefs}collapsed={collapsed} setCollapsed={setCollapsed} tipsOpen={tipsOpen} setTipsOpen={toggleTips} />
            )}
            {route.name === 'edit' && quiz && (
              <EditScreen key={quiz.id} lib={lib} quizId={quiz.id} notify={toasts.notify} collapsed={collapsed} setCollapsed={setCollapsed} />
            )}
            {route.name === 'debug' && (
              <DebugScreen lib={lib} notify={toasts.notify} debugBar={debugBar} setDebugBar={setDebugBar} />
            )}
          </main>
          <BackToTop scroller={window} />
          {driveOpen && (
            <DriveDialog lib={lib} onClose={() => setDriveOpen(false)} onOpened={() => setWelcome(false)} onPick={() => void pickFromDrive()} />
          )}
        </div>
      )}
      {/* Outside the route switch so running timers survive navigation. */}
      <Toasts toasts={toasts.toasts} dismiss={toasts.dismiss} />
      {debugBar && <DebugBar onClose={() => setDebugBar(false)} theme={theme} setTheme={chooseTheme} />}
    </>
  )
}
