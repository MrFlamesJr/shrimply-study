import { useEffect, useRef, useState } from 'react'
import { emptyLibrary, isTermCard, newId } from '../model'
import type { Card, Course, Group, Library, Quiz, Sides } from '../model'
import { addSideType, deleteSideType, renameSideType, samePair } from '../logic/sides'
import { freeName } from '../logic/names'
import { plural } from '../logic/plural'
import { keepBrokenBackup, onBackupWritten, readBackup, writeBackup } from '../storage/browserBackup'
import type { Backup } from '../storage/browserBackup'
import * as google from '../storage/googleDrive'
import type { DriveFile, DriveSource } from '../storage/googleDrive'
export type { DriveFile, DriveSource }
import type { StorageAdapter } from '../storage/StorageAdapter'
import type { Notify } from '../components/Toasts'

/** Shows a question with a confirm button; resolves true when confirmed. */
export type Ask = (question: string, confirmLabel: string, options?: { title?: string; danger?: boolean }) => Promise<boolean>

// Google Drive (see storage/googleDrive). Errors show as toasts; the calls resolve false or null then.
export type DriveApi = {
  /** False until Google Drive is set up on this site. */
  setUp: boolean
  /** The Drive file this library came from or was last saved to; null when none. */
  file: DriveSource | null
  /** True while this tab is signed in with Google (about an hour). Each tab signs in on its own, with any account. */
  signedIn(): boolean
  /**
   * The file is the signed-in user's own, as Google said. Signed out, nobody can tell (`file.mine` only remembers
   * that this browser saved it), so no text claims it is "yours" then.
   */
  yours: boolean
  /** Its file has changes on Google Drive that are not here (found by `refresh`); `pull` brings them. */
  newer: boolean
  /**
   * Saving goes into the file itself: signed in, and Google said it is the user's own. Otherwise (someone else's, or
   * signed out, as nobody can tell then) a save is a copy (`saveCopy`), asked for.
   */
  savesInto: boolean
  /** Signs out in this tab only. */
  signOut(): void
  /** The signed-in account's email address. */
  account(): Promise<string | null>
  /** Loads Google's sign-in script ahead of a click, so the popup opens at once. */
  prepare(): void
  /** Signs in with Google (a popup). */
  signIn(): Promise<boolean>
  /** Whether the signed-in user can save to `file` (false for someone else's file). */
  canSave(): Promise<boolean | null>
  /** Opens a Drive file: a shared one (no sign-in), or `own`, one from `list`. Asks before replacing courses or changes. */
  open(id: string, own?: boolean): Promise<boolean>
  /**
   * Looks at the shared file without asking anything: its name, whether it is in the bin or still shared, and whether
   * it has changes (`newer`). Quiet when Google can't be reached.
   */
  refresh(): Promise<void>
  /** Brings the file's version on Google Drive here, after a warning that it replaces the courses (and changes) here. */
  pull(): Promise<boolean>
  /** Saves the library to `file`. Asks first when the file changed elsewhere. */
  save(): Promise<boolean>
  /**
   * Saves the library as the user's own copy of `file`, under its name, in their Drive; the copy becomes `file`. Signed
   * out, it signs in first, and when the file turns out to be the user's own it saves into it instead of making a
   * second file of it.
   */
  saveCopy(): Promise<boolean>
  /** Saves the library as a new file in the signed-in user's Drive, which becomes its `file`. */
  saveNew(name: string): Promise<boolean>
  /** Sets `file` to "Anyone with the link can view". */
  share(): Promise<boolean>
  /** The libraries this app saved to the signed-in user's Drive. */
  list(): Promise<DriveFile[] | null>
  /** Asks, then moves one of them to the bin in the user's Drive (restorable there for 30 days). */
  remove(file: DriveFile): Promise<boolean>
  /**
   * Google's file picker, for .shrimp files the app didn't save itself (uploaded, copied in Drive, sent by someone):
   * the picked ones join `list` for good. Resolves how many libraries were added (null after an error).
   */
  pick(): Promise<number | null>
}

// Everything the UI can read or do with the library. Screens only use this.
export type LibraryApi = {
  /** False until the browser backup has been read. Show nothing before then: the library is still empty. */
  ready: boolean
  library: Library
  /**
   * Counts the times the whole library was replaced (a file, a Drive library or a pull opened, or a new one started).
   * A page of the old library is then gone on purpose, not a bad address (App moves on quietly).
   */
  replaced: number
  /**
   * True when there are edits since the last download or open, or, for the user's own Drive file, since the last save
   * to Drive (a download is then just an extra copy).
   */
  hasChanges: boolean
  loadLabel: string
  saveLabel: string
  loadHint: string
  saveHint: string
  findCourse(id: string): Course | undefined
  findQuiz(id: string): { course: Course; quiz: Quiz } | undefined
  /** Creates "New course" (or "New course 2" and so on: names are unique) and returns it. It stays a draft until renamed or given a quiz. */
  addCourse(): Course
  /** Call when leaving a course page: a draft course is dropped as if it was never created. */
  leaveCourse(id: string): void
  renameCourse(id: string, name: string): void
  deleteCourse(id: string): void
  /** Creates "New quiz" (or "New quiz 2" and so on) in the course and returns it. */
  addQuiz(courseId: string): Quiz
  renameQuiz(id: string, name: string): void
  deleteQuiz(id: string): void
  setCards(quizId: string, cards: Card[], groups?: Group[]): void
  /** Own side types (see model `Library.sideTypes`). */
  addSideType(pair: Sides): void
  renameSideType(from: Sides, to: Sides): void
  deleteSideType(pair: Sides): void
  /** Replaces the card with the same id. */
  updateCard(quizId: string, card: Card): void
  /**
   * Asks to confirm when there are unsaved changes. `from` loads the library (default: the adapter's picker; null
   * means nothing was picked). Resolves true when a library was loaded.
   */
  open(from?: () => Promise<Library | null>): Promise<boolean>
  /**
   * Starts an empty library tied to no file and no Drive file, so the next save makes a new one. Asks first when there
   * are courses or unsaved changes. Files and Google Drive stay as they are.
   */
  newLibrary(): Promise<boolean>
  download(): Promise<void>
  /** The .shrimp file on this device the library was opened from or last downloaded to; null when none. */
  fileName: string | null
  drive: DriveApi
}

// Marks a deletion so hasChanges stays true.
const LIBRARY_SENTINEL = '__library__'
// The backup is the whole library, images included, so it waits for a pause in the edits.
const BACKUP_DELAY = 300

// `file`: the local file's name (see `fileName`). Once the library is on Drive, `drive` names where it is instead.
type State = { library: Library; changedIds: Set<string>; drive: DriveSource | null; file: string | null }
// What Google says about a Drive file for the signed-in user.
type Owner = Awaited<ReturnType<typeof google.ownFile>>

const mapCourses = (lib: Library, fn: (course: Course) => Course): Library => ({
  ...lib,
  courses: lib.courses.map(fn),
})

const mapQuiz = (lib: Library, quizId: string, fn: (quiz: Quiz) => Quiz): Library =>
  mapCourses(lib, (c) => ({ ...c, quizzes: c.quizzes.map((q) => (q.id === quizId ? fn(q) : q)) }))

type Startup = { state: State; message?: Parameters<Notify> }

const emptyState = (): State => ({ library: emptyLibrary(), changedIds: new Set(), drive: null, file: null })
const fromBackup = (b: Backup): State => ({ library: b.library, changedIds: new Set(b.changedIds), drive: b.drive, file: b.file })

// How to keep unsaved changes: where the library lives.
const keepAction = (drive: DriveSource | null) => (drive?.mine ? 'save to Google Drive' : 'download your .shrimp file')
// Where a Drive library comes from, after its name.
// A Drive file in its owner's bin: it still opens, until it is deleted for good.
// "Your" only when signed in and Google said so (`yours`).
export const binNote = (drive: DriveSource, yours: boolean) =>
  yours
    ? `"${drive.name}" is in the bin in your Google Drive. Restore it there to keep it: the bin deletes it for good after 30 days.`
    : `"${drive.name}" is in its owner's bin on Google Drive. It still works here, but within 30 days it may be deleted for good and its link will stop working.`
const driveFrom = (drive: DriveSource, yours = false) =>
  yours ? 'from your Google Drive' : drive.shared ? 'shared on Google Drive' : 'from Google Drive'

async function startFromBackup(): Promise<Startup> {
  const empty = emptyState()
  try {
    const backup = await readBackup()
    // Only a real library is worth a message.
    if (!backup || backup.library.courses.length === 0) return { state: empty }
    // The backup is the library as it was left, so the message names the library, not the backup.
    const what = backup.drive ? `: "${backup.drive.name}" ${driveFrom(backup.drive)}` : ' with your courses'
    const unsaved = backup.changedIds.length > 0 ? ` Your changes aren't saved yet: ${keepAction(backup.drive)} to keep them.` : ''
    return { state: fromBackup(backup), message: ['info', `Picked up where you left off${what}.${unsaved}`] }
  } catch {
    // Keep the unreadable text: the next backup write would overwrite it.
    await keepBrokenBackup().catch(() => undefined)
    return {
      state: empty,
      message: [
        'warning',
        'The courses kept in this browser could not be read, so you start with an empty library. Open your .shrimp file or Google Drive library again.',
      ],
    }
  }
}

const errorText = (err: unknown) => (err instanceof Error ? ` ${err.message}` : '')

export function useLibrary(adapter: StorageAdapter, notify: Notify, ask: Ask): LibraryApi {
  const [state, setState] = useState<State>(emptyState)
  const [ready, setReady] = useState(false)
  // This tab's Google sign-in, as state, so what the page says follows signing in and out.
  const [signed, setSigned] = useState(google.signedIn)
  // Changes on Google Drive not here yet, found by the quiet look at the file on start (this visit only).
  const [newer, setNewer] = useState(false)
  const { library, changedIds, drive, file } = state
  const [replaced, setReplaced] = useState(0)
  // The whole library replaced: counted, so its gone pages aren't taken for bad addresses.
  const replaceAll = (next: State) => {
    setState(next)
    setReplaced((n) => n + 1)
  }
  const yours = signed && !!drive?.mine
  const savesInto = yours
  const hasChanges = changedIds.size > 0
  // Courses created here and not edited since. Kept in memory only, so a reload keeps them.
  const drafts = useRef(new Set<string>())

  // The state as the backup holds it already (read at the start, or written by another tab): not written again, so
  // two tabs never echo each other's writes back and forth.
  const stored = useRef<State>(undefined)
  // An edit here is waiting out BACKUP_DELAY before it is written.
  const waiting = useRef(false)
  // The browser refused the last backup write, and the user was told (once, until a write works again).
  const backupFailed = useRef(false)

  // Runs twice under StrictMode; the toast stack collapses identical messages.
  useEffect(() => {
    void startFromBackup().then((startup) => {
      stored.current = startup.state
      setState(startup.state)
      setReady(true)
      if (startup.message) notify(...startup.message)
    })
  }, [])

  useEffect(() => {
    const s = stored.current
    if (!ready || (s && s.library === library && s.changedIds === changedIds && s.drive === drive && s.file === file)) return
    waiting.current = true
    const timer = setTimeout(() => {
      waiting.current = false
      void writeBackup({ library, changedIds: [...changedIds], drive, file }).then((ok) => {
        if (ok) backupFailed.current = false
        // Only when there are changes to lose, and once: not on every edit.
        else if (changedIds.size > 0 && !backupFailed.current) {
          backupFailed.current = true
          notify('warning', `This browser could not keep a copy of your changes, so ${keepAction(drive)} before you close the page.`)
        }
      })
    }, BACKUP_DELAY)
    return () => {
      clearTimeout(timer)
      waiting.current = false
    }
  }, [ready, library, changedIds, drive, file])

  // Another tab changed the library (all tabs share the backup): this tab takes it up, so the next edit here builds on
  // it instead of writing over it. Its own Google sign-in stays (each tab signs in on its own, asked for). Unless an
  // edit here is still waiting to be written: that edit is never dropped, its write goes out next and the other tab
  // takes it up instead.
  useEffect(() => {
    if (!ready) return
    return onBackupWritten(() => {
      if (waiting.current) return
      readBackup().then(
        (backup) => {
          if (!backup || waiting.current) return
          stored.current = fromBackup(backup)
          replaceAll(stored.current)
        },
        () => undefined, // unreadable: this tab keeps what it has
      )
    })
  }, [ready])

  useEffect(() => {
    if (!hasChanges) return
    // Browsers show their own text in this prompt and ignore ours. The timer only runs if the page is still
    // open, so the reminder comes as a toast once the user chooses to stay (or behind the prompt in some browsers).
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      setTimeout(() => notify('warning', `Don't forget to ${keepAction(drive)} to keep your changes.`))
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasChanges, drive?.mine])

  // `update` must be pure: React may run it twice.
  const change = (ids: string[], update: (lib: Library) => Library) =>
    setState((s) => ({ ...s, library: update(s.library), changedIds: new Set([...s.changedIds, ...ids]) }))

  // Removes a draft course and its unsaved mark, so hasChanges is as it was before it was created.
  const dropDraft = (id: string) => {
    drafts.current.delete(id)
    setState((s) => ({
      ...s,
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
  // A side type edit marks the library and every quiz and course with a card that uses the type.
  const sideUserIds = (pair: Sides) => [
    LIBRARY_SENTINEL,
    ...library.courses.flatMap((c) =>
      c.quizzes.flatMap((q) => (q.cards.some((card) => isTermCard(card) && card.sides && samePair(card.sides, pair)) ? [q.id, c.id] : [])),
    ),
  ]

  // A closed sign-in popup is nothing to report.
  const report = (err: unknown, lead = '') => {
    if (!(err instanceof google.SignInClosed)) notify('error', `${lead}${err instanceof Error ? err.message : ''}`.trim())
  }
  const losing = () => (hasChanges ? ', and your unsaved changes' : '')
  // Replacing what is here asks first, when there is anything to lose, saying where the library comes from.
  const replaceOk = (name: string, own: boolean) =>
    library.courses.length === 0 && !hasChanges
      ? Promise.resolve(true)
      : own
        ? ask(`Opening "${name}" from your Google Drive replaces the courses in this browser${losing()}.`, 'Open', {
            title: 'Open from Google Drive?',
          })
        : ask(
            `The link you opened shares "${name}" from Google Drive. Opening it replaces the courses in this browser${losing()}.`,
            'Open',
            { title: 'Open a shared library?' },
          )
  // What Google last said about the library's Drive file: whether it is the user's own (shows the top row's Save to
  // Drive), and its name (renamed in Drive, it keeps its id).
  const patchDrive = (id: string, patch: Partial<DriveSource>) =>
    setState((s) => (s.drive?.id === id ? { ...s, drive: { ...s.drive, ...patch } } : s))
  // Saved: unmarked, unless it was edited while it uploaded (what is saved is the library as it was).
  // Once on Drive, a local file's name no longer says where the library is.
  // A save signs in on the way when needed (the top row's), so the page knows it is signed in from then on.
  const saved = (saving: Library, to: DriveSource) => {
    setState((s) => ({ ...s, changedIds: s.library === saving ? new Set() : s.changedIds, drive: to, file: null }))
    setSigned(google.signedIn())
  }
  // Google's answer about the file, as kept with it: whether it is the user's own, its name now and whether it is in the bin.
  const learned = (now: Owner): Partial<DriveSource> => ({
    mine: now.canEdit,
    ...(now.name && { name: now.name }),
    ...(now.trashed !== undefined && { trashed: now.trashed }),
  })
  // Whose the file is, asked quietly: only with a token that needs no popup, so "Your" and the top row's Save to Drive
  // stay right (a shared link to the user's own file is theirs to save into, not to copy).
  const checkOwner = (id: string) => {
    if (signed && google.hasFreshToken()) void google.ownFile(id).then((now) => patchDrive(id, learned(now)), () => undefined)
  }

  // One save at a time: a second click, or Ctrl+S, while one runs does nothing (it would upload twice, and the second
  // would take the first for a change made elsewhere).
  const saving = useRef(false)
  const oneAtATime =
    <A extends unknown[]>(action: (...args: A) => Promise<boolean>) =>
    async (...args: A) => {
      if (saving.current) return false
      saving.current = true
      try {
        return await action(...args)
      } finally {
        saving.current = false
      }
    }

  // Into the file, which Google just said is the user's own (`now`). Asks first when it changed elsewhere.
  const saveInto = async (to: DriveSource, now: Owner) => {
    const name = now.name ?? to.name
    const changed = `"${name}" changed on Google Drive since you last opened or saved it here, maybe on another device. Saving replaces it with the courses you have here.`
    if (now.md5 !== to.md5 && !(await ask(changed, 'Replace', { title: 'Changed on Google Drive' }))) return false
    const md5 = await google.updateDriveFile(to.id, library)
    saved(library, { ...to, md5, mine: true, name })
    notify('info', `Saved "${name}" to your Google Drive.`)
    return true
  }
  // A new file in the user's Drive. `lost`: the name of the file it was meant to go into, which is no longer there.
  const saveNew = async (name: string, lost?: string) => {
    try {
      const made = await google.createDriveFile(library, name)
      saved(library, made)
      if (lost) {
        notify('warning', `"${lost}" is no longer in your Google Drive (deleted there, or another account is signed in), so this library was saved as a new file, "${made.name}".`)
      } else {
        // From someone else's file: saving now goes to this copy.
        notify('info', drive ? `Saved your own copy to Google Drive as "${made.name}".` : `Saved "${made.name}" to your Google Drive.`)
      }
      return true
    } catch (err) {
      report(err, 'Not saved. ')
      return false
    }
  }
  const save = async () => {
    if (!drive) return false
    try {
      const now = await google.ownFile(drive.id)
      if (now.canEdit) return await saveInto(drive, now)
      // Google can't find it for this account: deleted for good, or another account signed in. A new file instead.
      patchDrive(drive.id, { mine: false })
      return await saveNew(drive.name, drive.name)
    } catch (err) {
      report(err, 'Not saved. ')
      return false
    }
  }
  // Signed out, nobody could tell whose it is; signed in, a link may have opened the user's own file. So Google is asked
  // first (signing in when needed), and the user's own file is saved into, not made a second file of.
  const saveCopy = async () => {
    if (!drive) return false
    try {
      const now = await google.ownFile(drive.id)
      setSigned(true)
      patchDrive(drive.id, learned(now))
      if (!now.canEdit) return await saveNew(drive.name)
      if (hasChanges) return await saveInto(drive, now)
      notify('info', `No changes to save in "${now.name ?? drive.name}".`)
      return false
    } catch (err) {
      report(err, 'Not saved. ')
      return false
    }
  }

  const driveApi: DriveApi = {
    setUp: google.driveSetUp,
    file: drive,
    signedIn: () => signed,
    yours,
    newer,
    savesInto,
    signOut() {
      google.signOut()
      setSigned(false)
    },
    async account() {
      try {
        return await google.accountEmail()
      } catch (err) {
        report(err)
        return null
      }
    },
    prepare: () => void google.prepareSignIn().catch(() => undefined),
    async signIn() {
      try {
        await google.signIn()
        setSigned(true)
        // Whose the library's file is, now that Google can say (the sidebar shows it).
        if (drive) void driveApi.canSave()
        return true
      } catch (err) {
        report(err)
        return false
      }
    },
    async canSave() {
      if (!drive) return false
      try {
        const now = await google.ownFile(drive.id)
        patchDrive(drive.id, learned(now))
        return now.canEdit
      } catch (err) {
        report(err)
        return null
      }
    },
    async open(id, own = false) {
      if (!google.driveSetUp) {
        notify('error', "Google Drive isn't set up on this site yet.")
        return false
      }
      // Its link opened again: bring its changes, if any (asking first, as they replace these).
      if (!own && drive?.id === id) return driveApi.pull()
      try {
        const { library: loaded, source } = await google.readDriveFile(id, own)
        if (!(await replaceOk(source.name, own))) return false
        replaceAll({ library: loaded, changedIds: new Set(), drive: source, file: null })
        setNewer(false)
        if (own) setSigned(true)
        else checkOwner(id)
        notify('info', `Opened "${source.name}" ${driveFrom(source, own)}.`)
        // It opens (a link works until the file is deleted for good), but nobody should count on it.
        if (source.trashed) notify('warning', binNote(source, own))
        return true
      } catch (err) {
        report(err, 'Could not open this Google Drive file. ')
        return false
      }
    },
    async refresh() {
      // Still signed in after a reload: whose the file is, as Google says now.
      if (google.driveSetUp && drive) checkOwner(drive.id)
      if (!google.driveSetUp || !drive?.shared) return
      let now: Awaited<ReturnType<typeof google.driveNow>>
      try {
        now = await google.driveNow(drive.id)
      } catch {
        return // offline or busy: the next start looks again
      }
      if (now === 'gone') {
        notify('info', `"${drive.name}" is no longer shared on Google Drive, so it gets no more changes. Your courses here stay as they are.`)
        patchDrive(drive.id, { shared: false })
        return
      }
      // Renamed, or moved to the bin or back, in Drive: only what is known about the file changes, never the library.
      if (now.name !== drive.name || now.trashed !== drive.trashed) patchDrive(drive.id, { name: now.name, trashed: now.trashed })
      if (now.trashed && !drive.trashed) notify('warning', binNote({ ...drive, name: now.name }, yours))
      setNewer(now.md5 !== drive.md5)
    },
    async pull() {
      if (!drive) return false
      try {
        // The file as it is now (shared: no sign-in), then the warning, as pulling replaces what is here.
        const { library: loaded, source } = await google.readDriveFile(drive.id, !drive.shared)
        const changed = source.md5 !== drive.md5
        if (!changed && !hasChanges) {
          setNewer(false)
          notify('info', `You already have the newest version of "${source.name}".`)
          return false
        }
        const question = changed
          ? `"${source.name}" has changes on Google Drive. Pulling them replaces the courses in this browser${losing()}.`
          : `"${source.name}" has no new changes on Google Drive. Pulling it again replaces your unsaved changes here.`
        if (!(await ask(question, 'Pull', { title: 'Pull changes' }))) return false
        replaceAll({ library: loaded, changedIds: new Set(), drive: { ...source, shared: drive.shared, mine: drive.mine }, file: null })
        setNewer(false)
        notify('info', `Pulled the newest version of "${source.name}" from Google Drive.`)
        return true
      } catch (err) {
        report(err, 'Could not pull the changes. ')
        return false
      }
    },
    save: oneAtATime(save),
    saveCopy: oneAtATime(saveCopy),
    saveNew: oneAtATime((name: string) => saveNew(name)),
    async share() {
      if (!drive) return false
      try {
        await google.shareDriveFile(drive.id)
        setState((s) => ({ ...s, drive: s.drive && { ...s.drive, shared: true } }))
        return true
      } catch (err) {
        report(err)
        return false
      }
    },
    async list() {
      try {
        return await google.listDriveFiles()
      } catch (err) {
        report(err)
        return null
      }
    },
    async pick() {
      try {
        const picked = await google.pickDriveFiles()
        setSigned(true)
        const libraries = picked.filter((f) => google.isLibraryName(f.name))
        const others = picked.filter((f) => !google.isLibraryName(f.name))
        if (libraries.length) notify('info', `Added ${plural(libraries.length, 'library', 'libraries')} to your list.`)
        if (others.length) notify('warning', `Not a .shrimp file, so not added: ${others.map((f) => `"${f.name}"`).join(', ')}.`)
        return libraries.length
      } catch (err) {
        report(err, 'Could not open the file picker. ')
        return null
      }
    },
    async remove(file) {
      const question = `Move "${file.name}" to the bin in your Google Drive? Anyone with its link can no longer open it. You can restore it from the bin for 30 days.`
      if (!(await ask(question, 'Move to bin', { title: 'Delete from Google Drive?', danger: true }))) return false
      try {
        await google.trashDriveFile(file.id)
        // The library here stays, no longer tied to the file.
        setState((s) => (s.drive?.id === file.id ? { ...s, drive: null } : s))
        notify('info', `Moved "${file.name}" to the bin in your Google Drive.`)
        return true
      } catch (err) {
        report(err, 'Not deleted. ')
        return false
      }
    },
  }

  return {
    drive: driveApi,
    fileName: file,
    replaced,
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
      const course: Course = { id: newId(), name: freeName('New course', library.courses.map((c) => c.name)), quizzes: [] }
      drafts.current.add(course.id)
      change([course.id], (lib) => ({ ...lib, courses: [...lib.courses, course] }))
      return course
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
      const taken = findCourse(courseId)?.quizzes.map((q) => q.name) ?? []
      const quiz: Quiz = { id: newId(), name: freeName('New quiz', taken), groups: [], cards: [] }
      change([quiz.id, courseId], (lib) =>
        mapCourses(lib, (c) => (c.id === courseId ? { ...c, quizzes: [...c.quizzes, quiz] } : c)),
      )
      return quiz
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
    addSideType(pair) {
      change([LIBRARY_SENTINEL], (lib) => ({ ...lib, sideTypes: addSideType(lib.sideTypes ?? [], pair) }))
    },
    renameSideType(from, to) {
      change(sideUserIds(from), (lib) => renameSideType(lib, from, to))
    },
    deleteSideType(pair) {
      change(sideUserIds(pair), (lib) => deleteSideType(lib, pair))
    },
    updateCard(quizId, card) {
      change(quizIds(quizId), (lib) =>
        mapQuiz(lib, quizId, (q) => ({ ...q, cards: q.cards.map((c) => (c.id === card.id ? card : c)) })),
      )
    },

    async open(from) {
      if (hasChanges && !(await ask('You have unsaved changes. Opening a file replaces them.', 'Open file'))) return false
      try {
        // Only the picker names a file; another loader (the guide, debug samples) leaves the library without one.
        const loaded = from ? await from().then((lib) => lib && { library: lib, name: null }) : await adapter.load()
        if (!loaded) return false
        // A file opened here is no longer the Drive file.
        replaceAll({ library: loaded.library, changedIds: new Set(), drive: null, file: loaded.name })
        return true
      } catch (err) {
        notify('error', `This file could not be opened.${errorText(err)}`)
        return false
      }
    },
    async newLibrary() {
      // A dangerous step: first exactly what is lost (or that nothing is), then that the file it came from stays.
      const name = drive?.name ?? file
      const lost = !name
        ? 'Your courses are not saved in any file. Starting a new library deletes them for good. To keep them, cancel and download your .shrimp file first.'
        : hasChanges
          ? `You have changes that are not saved in "${name}" yet. Starting a new library deletes them for good. To keep them, cancel and ${keepAction(drive)} first.`
          : `Everything here is saved in "${name}", so nothing is lost.`
      const after = `The new library starts empty. When you save it, it becomes a new .shrimp file${name ? ` and "${name}" is left as it is` : ''}.`
      const danger = !name || hasChanges
      if (
        (library.courses.length > 0 || hasChanges) &&
        !(await ask(`${lost}\n\n${after}`, 'Start new', { title: 'Start a new library?', danger }))
      )
        return false
      replaceAll(emptyState())
      return true
    },
    async download() {
      try {
        // The user's own Drive file stays marked until it is saved to Drive: a download is only a copy.
        // Named after the local file it was opened from or last downloaded to, else after its Drive file.
        const name = await adapter.save(library, file ?? drive?.name)
        if (name !== null) setState((s) => (s.drive?.mine ? s : { ...s, changedIds: new Set(), file: name }))
      } catch (err) {
        notify('error', `Download stopped.${errorText(err)}`)
      }
    },
  }
}
