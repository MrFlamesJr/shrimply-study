import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { redirect, usePlace, useRoute } from './route'
import type { StudyOptions, ThemeId } from './model'
import { useLibrary } from './state/useLibrary'
import { fileStorage, loadGuide } from './storage/fileStorage'
import { loadTheme, saveTheme } from './storage/themePref'
import { TopBar } from './layout/TopBar'
import { Sidebar, useSidebarOpen } from './layout/Sidebar'
import { useKeydown } from './hooks/useKeydown'
import { HomeScreen } from './screens/HomeScreen'
import { CourseScreen } from './screens/CourseScreen'
import { QuizScreen } from './screens/QuizScreen'
import { EditScreen } from './screens/EditScreen'
import { StudyScreen } from './screens/StudyScreen'
import { DebugScreen } from './screens/DebugScreen'
import { DebugBar } from './screens/debug/DebugBar'
import { Toasts, useToasts } from './components/Toasts'
import { BackToTop } from './components/BackToTop'
import { askConfirm } from './components/ConfirmDialog'

export function App() {
  const toasts = useToasts()
  const lib = useLibrary(fileStorage, toasts.notify, askConfirm)
  const route = useRoute()
  const [prefs, setPrefs] = useState<StudyOptions>({ format: 'flashcards', side: 'term', shuffle: true })
  // Ids of the groups folded shut, for this visit only (not in the file). Kept here so they survive Edit and Done.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen()
  const [debugBar, setDebugBar] = useState(false)
  // The theme is `data-theme` on <html> (set from the remembered one in main.tsx). Set before the re-render,
  // so anything that reads computed styles while rendering (the debug page's tokens) sees the new theme.
  const [theme, setTheme] = useState(loadTheme)
  const chooseTheme = (id: ThemeId) => {
    document.documentElement.dataset.theme = id
    saveTheme(id)
    setTheme(id)
  }

  // The course and quiz the address names (renames followed). One that is gone (deleted, an old link) leads to the nearest
  // page that still exists, its course or home, with a note saying what was not found.
  const { course, quiz, missing } = usePlace(lib.library, route)
  const lost = lib.ready ? missing : undefined
  useEffect(() => {
    if (!lost || !('course' in route)) return
    const name = lost === 'quiz' && 'quiz' in route ? route.quiz : route.course
    toasts.notify('info', `Couldn't find the ${lost} "${name}"`)
    redirect(course ? { name: 'course', course: course.name } : { name: 'home' })
  }, [lost])

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

  useKeydown((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void lib.download()
    }
  })

  if (!lib.ready) return null
  return (
    <>
      {route.name === 'study' ? (
        quiz && <StudyScreen key={quiz.id + route.format} lib={lib} notify={toasts.notify} quizId={quiz.id} format={route.format} prefs={prefs} />
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
          <TopBar lib={lib} page={route.name} course={course} quiz={quiz} />
          <main className="page">
            {/* Keyed by id, not the address, so a rename keeps the screen (and the name field's focus). */}
            {route.name === 'home' && <HomeScreen lib={lib} guide={loadGuide} />}
            {route.name === 'course' && course && <CourseScreen key={course.id} lib={lib} courseId={course.id} />}
            {route.name === 'quiz' && quiz && (
              <QuizScreen lib={lib} quizId={quiz.id} prefs={prefs} setPrefs={setPrefs} collapsed={collapsed} setCollapsed={setCollapsed} />
            )}
            {route.name === 'edit' && quiz && (
              <EditScreen key={quiz.id} lib={lib} quizId={quiz.id} notify={toasts.notify} collapsed={collapsed} setCollapsed={setCollapsed} />
            )}
            {route.name === 'debug' && (
              <DebugScreen lib={lib} notify={toasts.notify} debugBar={debugBar} setDebugBar={setDebugBar} />
            )}
          </main>
          <BackToTop scroller={window} />
        </div>
      )}
      {/* Outside the route switch so running timers survive navigation. */}
      <Toasts toasts={toasts.toasts} dismiss={toasts.dismiss} />
      {debugBar && <DebugBar onClose={() => setDebugBar(false)} />}
    </>
  )
}
