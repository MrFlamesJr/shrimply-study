import { useEffect, useRef, useState } from 'react'
import { emptyLibrary, newId } from '../model'
import type { Card, Course, Group, Library, Quiz } from '../model'
import { readBackup, writeBackup } from '../storage/browserBackup'
import type { StorageAdapter } from '../storage/StorageAdapter'
import type { Notify } from '../components/Toasts'

// Everything the UI can read or do with the library. Screens only use this.
export type LibraryApi = {
  /** False until the browser backup has been read. Show nothing before then: the library is still empty. */
  ready: boolean
  library: Library
  /** True when there are edits since the last download or open. */
  hasChanges: boolean
  loadLabel: string
  saveLabel: string
  loadHint: string
  saveHint: string
  findCourse(id: string): Course | undefined
  findQuiz(id: string): { course: Course; quiz: Quiz } | undefined
  /** Creates "New course" and returns its id. It stays a draft until renamed or given a quiz. */
  addCourse(): string
  /** Call when leaving a course page: a draft course is dropped as if it was never created. */
  leaveCourse(id: string): void
  renameCourse(id: string, name: string): void
  deleteCourse(id: string): void
  /** Creates "New quiz" in the course and returns its id. */
  addQuiz(courseId: string): string
  renameQuiz(id: string, name: string): void
  deleteQuiz(id: string): void
  setCards(quizId: string, cards: Card[], groups?: Group[]): void
  /** Asks to confirm when there are unsaved changes. Resolves true when a library was loaded. */
  open(): Promise<boolean>
  download(): Promise<void>
}

// Marks a deletion so hasChanges stays true.
const LIBRARY_SENTINEL = '__library__'
// The backup is the whole library, images included, so it waits for a pause in the edits.
const BACKUP_DELAY = 300

type State = { library: Library; changedIds: Set<string> }

const mapCourses = (lib: Library, fn: (course: Course) => Course): Library => ({
  ...lib,
  courses: lib.courses.map(fn),
})

const mapQuiz = (lib: Library, quizId: string, fn: (quiz: Quiz) => Quiz): Library =>
  mapCourses(lib, (c) => ({ ...c, quizzes: c.quizzes.map((q) => (q.id === quizId ? fn(q) : q)) }))

type Startup = { state: State; message?: Parameters<Notify> }

const emptyState = (): State => ({ library: emptyLibrary(), changedIds: new Set() })

async function startFromBackup(): Promise<Startup> {
  const empty = emptyState()
  try {
    const backup = await readBackup()
    // An empty backup is written on every first visit, so only a real library is worth a message.
    if (!backup || backup.library.courses.length === 0) return { state: empty }
    const unsaved = backup.changedIds.length > 0 ? ' Download it to keep your changes in a file.' : ''
    return {
      state: { library: backup.library, changedIds: new Set(backup.changedIds) },
      message: ['info', `Loaded your library from this browser.${unsaved}`],
    }
  } catch {
    return { state: empty, message: ['warning', 'The browser backup could not be read, so the library starts empty.'] }
  }
}

const errorText = (err: unknown) => (err instanceof Error ? ` ${err.message}` : '')

export function useLibrary(adapter: StorageAdapter, notify: Notify): LibraryApi {
  const [state, setState] = useState<State>(emptyState)
  const [ready, setReady] = useState(false)
  const { library, changedIds } = state
  const hasChanges = changedIds.size > 0
  // Courses created here and not edited since. Kept in memory only, so a reload keeps them.
  const drafts = useRef(new Set<string>())

  // Runs twice under StrictMode; the toast stack collapses identical messages.
  useEffect(() => {
    void startFromBackup().then((startup) => {
      setState(startup.state)
      setReady(true)
      if (startup.message) notify(...startup.message)
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      void writeBackup({ library, changedIds: [...changedIds] }).then((ok) => {
        if (!ok) notify('warning', 'Could not save a backup in this browser. Download to keep your changes.')
      })
    }, BACKUP_DELAY)
    return () => clearTimeout(timer)
  }, [ready, library, changedIds])

  useEffect(() => {
    if (!hasChanges) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasChanges])

  // `update` must be pure: React may run it twice.
  const change = (ids: string[], update: (lib: Library) => Library) =>
    setState((s) => ({ library: update(s.library), changedIds: new Set([...s.changedIds, ...ids]) }))

  // Removes a draft course and its unsaved mark, so hasChanges is as it was before it was created.
  const dropDraft = (id: string) => {
    drafts.current.delete(id)
    setState((s) => ({
      library: { ...s.library, courses: s.library.courses.filter((c) => c.id !== id) },
      changedIds: new Set([...s.changedIds].filter((x) => x !== id)),
    }))
  }

  const findCourse = (id: string) => library.courses.find((c) => c.id === id)
  const findQuiz = (id: string) => {
    for (const course of library.courses) {
      const quiz = course.quizzes.find((q) => q.id === id)
      if (quiz) return { course, quiz }
    }
    return undefined
  }
  // Edits to a quiz mark both the quiz and its course.
  const quizIds = (quizId: string) => {
    const found = findQuiz(quizId)
    return found ? [quizId, found.course.id] : [quizId]
  }

  return {
    ready,
    library,
    hasChanges,
    loadLabel: adapter.loadLabel,
    saveLabel: adapter.saveLabel,
    loadHint: adapter.loadHint,
    saveHint: adapter.saveHint,
    findCourse,
    findQuiz,

    addCourse() {
      const id = newId()
      drafts.current.add(id)
      change([id], (lib) => ({ ...lib, courses: [...lib.courses, { id, name: 'New course', quizzes: [] }] }))
      return id
    },
    leaveCourse(id) {
      if (drafts.current.has(id)) dropDraft(id)
    },
    renameCourse(id, name) {
      drafts.current.delete(id)
      change([id], (lib) => mapCourses(lib, (c) => (c.id === id ? { ...c, name } : c)))
    },
    deleteCourse(id) {
      if (drafts.current.has(id)) return dropDraft(id)
      change([LIBRARY_SENTINEL], (lib) => ({ ...lib, courses: lib.courses.filter((c) => c.id !== id) }))
    },
    addQuiz(courseId) {
      drafts.current.delete(courseId)
      const id = newId()
      change([id, courseId], (lib) =>
        mapCourses(lib, (c) =>
          c.id === courseId ? { ...c, quizzes: [...c.quizzes, { id, name: 'New quiz', groups: [], cards: [] }] } : c,
        ),
      )
      return id
    },
    renameQuiz(id, name) {
      change(quizIds(id), (lib) => mapQuiz(lib, id, (q) => ({ ...q, name })))
    },
    deleteQuiz(id) {
      const courseId = findQuiz(id)?.course.id
      change(courseId ? [courseId] : [], (lib) =>
        mapCourses(lib, (c) => ({ ...c, quizzes: c.quizzes.filter((q) => q.id !== id) })),
      )
    },
    setCards(quizId, cards, groups) {
      change(quizIds(quizId), (lib) => mapQuiz(lib, quizId, (q) => ({ ...q, cards, ...(groups && { groups }) })))
    },

    async open() {
      if (hasChanges && !confirm('You have unsaved changes. Opening a file replaces them. Continue?')) return false
      try {
        const loaded = await adapter.load()
        if (!loaded) return false
        setState({ library: loaded, changedIds: new Set() })
        return true
      } catch (err) {
        notify('error', `This file could not be opened.${errorText(err)}`)
        return false
      }
    },
    async download() {
      try {
        await adapter.save(library)
        setState((s) => ({ ...s, changedIds: new Set() }))
      } catch (err) {
        notify('error', `The download failed.${errorText(err)}`)
      }
    },
  }
}
