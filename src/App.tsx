import { useEffect, useRef, useState } from 'react'
import { parseHash, redirect, useRoute, type Route } from './route'
import type { StudyOptions } from './model'
import { useLibrary } from './state/useLibrary'
import { fileStorage } from './storage/fileStorage'
import { TopBar } from './layout/TopBar'
import { Sidebar } from './layout/Sidebar'
import { HomeScreen } from './screens/HomeScreen'
import { CourseScreen } from './screens/CourseScreen'
import { QuizScreen } from './screens/QuizScreen'
import { EditScreen } from './screens/EditScreen'
import { StudyScreen } from './screens/StudyScreen'
import { DebugScreen } from './screens/DebugScreen'
import { Toasts, useToasts } from './components/Toasts'

/** The last study options, preselected the next time a round starts. */
export type Prefs = StudyOptions

export function App() {
  const toasts = useToasts()
  const lib = useLibrary(fileStorage, toasts.notify)
  const route = useRoute()
  const [prefs, setPrefs] = useState<Prefs>({ format: 'flashcards', side: 'term', shuffle: true })
  const [sidebarOpen, setSidebarOpen] = useState(() => matchMedia('(min-width: 800px)').matches)
  // Crossing the breakpoint (resizing or zooming the window) gives the sidebar that size's default: open beside
  // the page on wide screens, closed on small ones, where it covers the page.
  useEffect(() => {
    const wide = matchMedia('(min-width: 800px)')
    const onChange = () => setSidebarOpen(wide.matches)
    wide.addEventListener('change', onChange)
    return () => wide.removeEventListener('change', onChange)
  }, [])

  const isMissing = (r: Route) =>
    (r.name === 'course' && !lib.findCourse(r.id)) ||
    ((r.name === 'quiz' || r.name === 'edit' || r.name === 'study') && !lib.findQuiz(r.id))
  const missing = lib.ready && isMissing(route)
  useEffect(() => {
    // Re-check the live hash: after a delete, go() may already point somewhere valid.
    if (missing && isMissing(parseHash(location.hash))) redirect({ name: 'home' })
  }, [missing])

  // Leaving a course page drops the course if it is a never-edited draft. A ref, not an effect cleanup,
  // so StrictMode's mount-unmount-mount doesn't drop it on arrival.
  const courseId = route.name === 'course' ? route.id : undefined
  const lastCourseId = useRef(courseId)
  useEffect(() => {
    const left = lastCourseId.current
    lastCourseId.current = courseId
    if (left && left !== courseId) lib.leaveCourse(left)
  }, [courseId])

  useEffect(() => {
    document.title = lib.hasChanges ? '* Shrimply Study' : 'Shrimply Study'
  }, [lib.hasChanges])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void lib.download()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!lib.ready) return null
  return (
    <>
      {route.name === 'study' ? (
        <StudyScreen key={route.id + route.format} lib={lib} quizId={route.id} format={route.format} prefs={prefs} />
      ) : (
        <div className="app">
          <Sidebar lib={lib} route={route} open={sidebarOpen} setOpen={setSidebarOpen} />
          <TopBar lib={lib} route={route} />
          <main className="page">
            {route.name === 'home' && <HomeScreen lib={lib} />}
            {route.name === 'course' && <CourseScreen key={route.id} lib={lib} courseId={route.id} />}
            {route.name === 'quiz' && <QuizScreen lib={lib} quizId={route.id} prefs={prefs} setPrefs={setPrefs} />}
            {route.name === 'edit' && <EditScreen key={route.id} lib={lib} quizId={route.id} notify={toasts.notify} />}
            {route.name === 'debug' && <DebugScreen notify={toasts.notify} />}
          </main>
        </div>
      )}
      {/* Outside the route switch so running timers survive navigation. */}
      <Toasts toasts={toasts.toasts} dismiss={toasts.dismiss} />
    </>
  )
}
