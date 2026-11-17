import { useEffect, useRef, useState } from 'react'
import { emptyLibrary, newId } from '../model'
import type { Card, Choice, Course, Group, Library, Quiz, Sides } from '../model'
import { addSideType, deleteSideType, renameSideType } from '../logic/sides'
import { freeName } from '../logic/names'
import { plural } from '../logic/plural'
import { cardsEdit } from '../logic/cardsEdit'
import type { Docs, ItemRef, Target } from '../logic/contentOps'
import type { Notify } from '../logic/pushToast'
import type { Route } from '../logic/routes'
import * as backup from '../storage/browserBackup'
import * as google from '../storage/googleDrive'
import type { DriveFile, DriveSource } from '../storage/googleDrive'
import type { FileRef, StorageAdapter } from '../storage/StorageAdapter'
import { comboLabel, isMac } from '../kit/shortcuts'
import { redoLabel, undoLabel } from '../kit/history'
import type { GroupId, Layout, TabId, WindowId } from '../kit/layout'
import * as W from './workspace'
import type { Clipboard, DocId, DocTab, Explorer, TabData } from './workspace'
export type { DocId, DocTab, DriveFile, DriveSource, FileRef, TabData }

/** Shows a question with a confirm button; resolves true when confirmed. */
export type Ask = (question: string, confirmLabel: string, options?: { title?: string; danger?: boolean }) => Promise<boolean>
/** Shows a question with several answers (and Cancel); resolves the chosen value, null for Cancel. */
export type AskChoice = <V>(question: string, choices: Choice<V>[], options?: { title?: string }) => Promise<V | null>

// Google Drive (see storage/googleDrive). Errors show as toasts; the calls resolve false or null then.
export type DriveApi = {
  /** False until Google Drive is set up on this site. */
  setUp: boolean
  /** The Drive file this library came from or was last saved to; null when none. */
  file: DriveSource | null
  /** True while this tab is signed in with Google (about an hour). Each tab signs in on its own, with any account. */
  signedIn(): boolean
  /** The sign-in has a token that works right now, so a call needs no popup (listing on its own is only safe then). */
  canListQuietly(): boolean
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
  /**
   * Opens a Drive file as a new document beside the others: a shared one (no sign-in), or `own`, one from `list`.
   * Already open, its document becomes active; a shared link opened again also brings its changes (asking first).
   */
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
  /**
   * Reads a library of the user's Drive without opening it (the Explorer shows what is inside). `version` (its last
   * change) keeps a read for the session: the same file at the same version is not read again. Null after an error.
   */
  peek(id: string, version?: string): Promise<Library | null>
}

// Everything the UI can read or do with one open document (library). Screens only use this.
export type LibraryApi = {
  /** False until the browser backup has been read. Show nothing before then: the library is still empty. */
  ready: boolean
  /** The document's id in the workspace. */
  id: DocId
  /** What it is called: its Drive file's name, its .shrimp file's name, or its own ("New library 2"). */
  name: string
  library: Library
  /**
   * Counts the times the whole library was replaced (pulled, reloaded from disk, taken from another tab, loaded as
   * text). A page of the old library is then gone on purpose, not a bad address (App moves on quietly).
   */
  replaced: number
  /** True when the library is not the one last opened or saved (an undo back to it clears it). */
  hasChanges: boolean
  loadLabel: string
  saveLabel: string
  loadHint: string
  saveHint: string
  findCourse(id: string): Course | undefined
  findQuiz(id: string): { course: Course; quiz: Quiz } | undefined
  /** Creates "New course" (or "New course 2" and so on: names are unique) and returns it. It stays a draft until anything changes it (here or in the Explorer). */
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
  /** Replaces the whole library (the debug page's text), as one step that can be undone. */
  replace(library: Library): void
  /**
   * Saves it where it lives (Ctrl+S): into the user's own Drive file, a copy of someone else's; into its .shrimp file
   * where the browser allows (asking first when the file changed on disk), else Save as (a download in Firefox and
   * Safari, which then counts as saved under that name). Resolves true when saved.
   */
  save(): Promise<boolean>
  /** A copy as a .shrimp file. Never changes which file the library is tied to, nor its unsaved mark. */
  download(): Promise<void>
  /** Closes it, asking Save / Don't save / Cancel when it has unsaved changes. Resolves true when closed. */
  close(): Promise<boolean>
  /** The .shrimp file on this device it is tied to (opened from, or saved to); null when none. */
  file: FileRef | null
  /** The name of `file`; null when none. */
  fileName: string | null
  drive: DriveApi
}

export type DocMeta = { id: DocId; name: string; where: 'device' | 'drive' | 'browser'; dirty: boolean }

export type WorkspaceApi = {
  /** False until the browser backup has been read (App renders nothing before). */
  ready: boolean
  /** The open documents, in the sidebar's order. */
  docs: DocMeta[]
  /** The active file: the active tab's, else the file of the tab active last; null when no tab shows one. */
  active: DocId | null
  /** One document's API, the same object until that document (or the sign-in) changes. */
  doc(id: DocId): LibraryApi
  layout: Layout<TabData>
  /** The main window's active tab when it shows a file: the address bar follows it. */
  address: DocTab | null
  /** Tabs, the one active most recently first. */
  recent: TabId[]
  /** Shows a file: its tab in the active group, else its tab used last, else a new tab on its home. */
  activate(id: DocId): void
  /** Shows a place of a file in a group (default: the active one), in its tab there unless `newTab`; the tab's id. */
  openPlace(doc: DocId, route: Route, o?: { group?: GroupId; newTab?: boolean; background?: boolean }): TabId | null
  /** The page a tab shows. */
  setTabRoute(tabId: TabId, route: Route): void
  activateTab(tabId: TabId): void
  activateGroup(groupId: GroupId): void
  /** Closing tabs never closes a file. */
  closeTabs(tabIds: TabId[]): void
  closeOthers(tabId: TabId): void
  closeAll(groupId: GroupId): void
  moveTab(tabId: TabId, toGroup: GroupId, index: number): void
  /** A new group beside `groupId`: a dragged tab (`move`) moves into it, else a copy of `tabId` (or the active tab). */
  split(groupId: GroupId, dir: 'row' | 'column', side: 'before' | 'after', tabId?: TabId, move?: boolean): void
  join(from: GroupId, into: GroupId): void
  resize(win: WindowId, path: number[], sizes: number[]): void
  /** The group into window `win` (its popup is opened by the caller, in the click). */
  popOut(groupId: GroupId, win: WindowId): void
  dock(win: WindowId): void
  /** Shows the Explorer: activated where it shows, else split on the left of `beside` (`split`) or as a tab. */
  showExplorer(beside: GroupId, split: boolean): void
  /** Every release's notes in a tab (one at most), in `group` (default: the active one). */
  showChangelog(group?: GroupId): void
  /** Back, forward or a typed address: the entry's own tab (`tabId`, from history.state) takes its page (see workspace.followHistory); true when something changed. */
  followHistory(tabId: TabId | null, route: Route): boolean
  /** The group used most recently other than `except`. */
  recentGroup(except: GroupId | null): GroupId | null
  /** The one content write path: one undoable step that marks every document it changed as unsaved. */
  apply(label: string, update: (docs: Docs) => Docs, key?: string): void
  undo(): void
  redo(): void
  /**
   * Call right after a change: the function it returns undoes that step later (a toast's Undo), only while it is still
   * the last one; otherwise it says that other changes came after it, and changes nothing.
   */
  undoLater(): () => void
  undoLabel: string | null
  redoLabel: string | null
  clipboard: Clipboard | null
  /** `from`: libraries that are not open documents (peeked Drive libraries) the items may come from. */
  copy(refs: ItemRef[], from?: Docs): void
  cut(refs: ItemRef[]): void
  paste(target: Target): void
  /** An empty document, "New library" (or "New library 2"...), active, its tab on `at` (default home). */
  newDoc(at?: Route): DocId
  /** The file picker: each picked file opens as a document, or activates the one it is already open in. */
  openFile(at?: Route): Promise<DocId | null>
  /** A library a loader gives (the guide, the debug page's samples) as a new document named after `name`. */
  openLibrary(load: () => Promise<Library>, name: string, at?: Route): Promise<DocId | null>
  /** A Google Drive file as a new document (or the one it is already open in). */
  openDrive(id: string, own?: boolean): Promise<boolean>
  saveAll(): Promise<void>
  closeDoc(id: DocId): Promise<boolean>
  explorer: Explorer
  setExplorer(explorer: Explorer): void
  /** Google Drive with no document behind it (signing in, the list, the picker): `file` is null. */
  drive: DriveApi
  loadLabel: string
  loadHint: string
}

// The backup holds whole libraries, images included, so each waits for a pause in its edits.
const BACKUP_DELAY = 300
// Tabs follow a rename once the typing pauses: the main window's active tab writes its page to the address bar, and
// browsers limit how often that may change.
const FOLLOW_DELAY = 300
const HOME: Route = { name: 'home' }
// The ids a transition needs, made before it runs (transitions stay pure).
const ids = () => ({ tab: newId(), group: newId() })

// What Google says about a Drive file for the signed-in user.
type Owner = Awaited<ReturnType<typeof google.ownFile>>

// Each returns the same object when `fn` changes nothing, so a change to nothing is no change (and no unsaved mark).
const mapCourses = (lib: Library, fn: (course: Course) => Course): Library => {
  const courses = lib.courses.map(fn)
  return courses.every((c, i) => c === lib.courses[i]) ? lib : { ...lib, courses }
}
const mapQuiz = (lib: Library, quizId: string, fn: (quiz: Quiz) => Quiz): Library =>
  mapCourses(lib, (c) => {
    if (!c.quizzes.some((q) => q.id === quizId)) return c
    const quizzes = c.quizzes.map((q) => (q.id === quizId ? fn(q) : q))
    return quizzes.every((q, i) => q === c.quizzes[i]) ? c : { ...c, quizzes }
  })
const quizIn = (lib: Library, id: string) => {
  for (const course of lib.courses) {
    const quiz = course.quizzes.find((q) => q.id === id)
    if (quiz) return { course, quiz }
  }
  return undefined
}

// A Drive file in its owner's bin: it still opens, until it is deleted for good. "Your" only when signed in and
// Google said so (`yours`).
export const binNote = (drive: DriveSource, yours: boolean) =>
  yours
    ? `"${drive.name}" is in the bin in your Google Drive. Restore it there to keep it: the bin deletes it for good after 30 days.`
    : `"${drive.name}" is in its owner's bin on Google Drive. It still works here, but within 30 days it may be deleted for good and its link will stop working.`
// Where a Drive library comes from, after its name.
const driveFrom = (drive: DriveSource, yours = false) =>
  yours ? 'from your Google Drive' : drive.shared ? 'shared on Google Drive' : 'from Google Drive'

const errorText = (err: unknown) => (err instanceof Error ? ` ${err.message}` : '')
const sameNote = (a: backup.DocRecord['file'], b: FileRef | null) =>
  a === b || (!!a && !!b && a.name === b.name && a.size === b.size && a.modified === b.modified)
// The record as written already says this about the document: nothing to write.
const sameRecord = (rec: backup.DocRecord, d: W.Doc) =>
  rec.library === d.library && rec.dirty === W.hasChanges(d) && rec.drive === d.drive && sameNote(rec.file, d.file)

/**
 * The workspace: every open document, the layout (tabs, groups, splits, windows), the undo history and the
 * clipboard, as one state with one write path for content (`apply`).
 */
export function useWorkspace(adapter: StorageAdapter, notify: Notify, ask: Ask, askChoice: AskChoice): WorkspaceApi {
  const [ws, setWs] = useState<W.Workspace>(() => W.emptyWorkspace('main-group'))
  // The latest state, ahead of the render: transitions build on it, so several in one click compose, and the actions
  // (often async) always read what is there now.
  const ref = useRef(ws)
  const [ready, setReady] = useState(false)
  // This tab's Google sign-in, as state, so what the page says follows signing in and out.
  const [signed, setSigned] = useState(google.signedIn)
  const signedRef = useRef(signed)
  const setSignedNow = (on: boolean) => {
    signedRef.current = on
    setSigned(on)
  }
  // The latest callbacks from App (they are new functions on every render).
  const deps = useRef({ notify, ask, askChoice })
  deps.current = { notify, ask, askChoice }
  const say: Notify = (...args) => deps.current.notify(...args)
  const confirm: Ask = (...args) => deps.current.ask(...args)

  const update = (fn: (w: W.Workspace) => W.Workspace) => {
    const before = ref.current
    const next = fn(before)
    if (next === before) return
    ref.current = next
    setWs(next)
  }
  const cur = (id: DocId): W.Doc | undefined => ref.current.docs[id]

  const apply = (label: string, change: (docs: Docs) => Docs, key?: string) => {
    const at = Date.now()
    update((w) => W.applyEdit(w, label, change, at, key))
  }
  const edit = (id: DocId, label: string, fn: (lib: Library) => Library, key?: string) =>
    apply(label, (docs) => (docs[id] ? { ...docs, [id]: fn(docs[id]) } : docs), key)

  // Courses created here (by id, the course object as created): a draft only while the library still holds that very
  // object (W.dropDraft). Kept in memory only, so a reload keeps them.
  const drafts = useRef(new Map<string, Course>())

  // ---- The browser backup: each document's record, the workspace's record, file handles ----

  // The record each document has in the backup now (read on start, written here, or written by another tab).
  const written = useRef(new Map<DocId, backup.DocRecord>())
  const writtenHandle = useRef(new Map<DocId, FileSystemFileHandle | null>())
  // The document objects already looked at, so an edit to one doesn't push back the writes of the others.
  const seen = useRef(new Map<DocId, W.Doc>())
  // A document's edit waiting out BACKUP_DELAY before it is written.
  const timers = useRef(new Map<DocId, ReturnType<typeof setTimeout>>())
  // The library each document's tab routes were last named in, and its change waiting out FOLLOW_DELAY before every
  // tab of it (shown or not) follows a rename.
  const named = useRef(new Map<DocId, Library>())
  const follows = useRef(new Map<DocId, ReturnType<typeof setTimeout>>())
  const followNow = (id: DocId) => {
    follows.current.delete(id)
    const from = named.current.get(id)
    const d = cur(id)
    if (!d || !from) return
    named.current.set(id, d.library)
    update((w) => W.followRenames(w, id, from))
  }
  const wsTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const wsWritten = useRef<string>(undefined)
  // The browser refused the last backup write, and the user was told (once, until a write works again).
  const backupFailed = useRef(false)

  const writeNow = async (id: DocId) => {
    timers.current.delete(id)
    const d = ref.current.docs[id]
    if (!d) return
    const rec = W.docRecord(d)
    if (await backup.writeDoc(rec)) {
      written.current.set(id, rec)
      backupFailed.current = false
    } else if (rec.dirty && !backupFailed.current) {
      // Only when there are changes to lose, and once: not on every edit.
      backupFailed.current = true
      say('warning', `This browser could not keep a copy of your changes to "${W.docName(d)}", so save them before you close the page.`)
    }
  }
  const writeWorkspaceNow = async () => {
    wsTimer.current = undefined
    const rec = W.workspaceRecord(ref.current)
    const text = JSON.stringify(rec)
    if (text !== wsWritten.current && (await backup.writeWorkspace(rec))) wsWritten.current = text
  }

  // Once (StrictMode runs effects twice; reading twice would migrate the old backup twice).
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      let read: Awaited<ReturnType<typeof backup.readWorkspace>> | null = null
      try {
        read = await backup.readWorkspace()
      } catch {
        read = null
      }
      const next = read ? W.restore(read, newId(), newId) : W.emptyWorkspace(newId())
      for (const rec of read?.docs ?? []) {
        // A record the reading could not write (moving the old backup in) is not stored yet: the first backup write
        // after the start writes it, and warns if that fails too.
        if (!read?.unstored.includes(rec.id)) written.current.set(rec.id, rec)
        writtenHandle.current.set(rec.id, read?.handles[rec.id] ?? null)
      }
      ref.current = next
      setWs(next)
      setReady(true)
      if (!read) {
        say('warning', 'The courses kept in this browser could not be read, so no files are open. Open your .shrimp file or Google Drive library again.')
        return
      }
      const broken = read.broken.length
      if (broken) {
        say(
          'warning',
          broken === 1
            ? 'A library kept in this browser could not be read, so it was set aside. Open its .shrimp file or Google Drive library again.'
            : `${broken} libraries kept in this browser could not be read, so they were set aside. Open their .shrimp files or Google Drive libraries again.`,
        )
      }
      // What the reading has to say (an old backup moved in, a copy set aside).
      for (const note of read.notes) say('info', note)
      const docs = next.order.map((id) => next.docs[id])
      // Only real libraries are worth a message. It names the library as it was left, not the backup.
      if (docs.some((d) => d.library.courses.length > 0)) {
        const one = docs.length === 1 ? docs[0] : undefined
        const what = !one
          ? ` with ${plural(docs.length, 'file')}`
          : one.drive
            ? `: "${one.drive.name}" ${driveFrom(one.drive)}`
            : one.file
              ? `: "${one.file.name}"`
              : ' with your courses'
        const unsaved = docs.some(W.hasChanges) ? " Your changes aren't saved yet: save them to keep them." : ''
        say('info', `Picked up where you left off${what}.${unsaved}`)
      }
    })()
  }, [])

  // Each changed document's record, 300ms after its last edit (only that document); its file handle at once.
  useEffect(() => {
    if (!ready) return
    for (const id of ws.order) {
      const d = ws.docs[id]
      if (seen.current.get(id) === d) continue
      seen.current.set(id, d)
      const from = named.current.get(id)
      if (!from) named.current.set(id, d.library)
      else if (from !== d.library) {
        clearTimeout(follows.current.get(id))
        follows.current.set(id, setTimeout(() => followNow(id), FOLLOW_DELAY))
      }
      const handle = d.file?.handle ?? null
      if ((writtenHandle.current.get(id) ?? null) !== handle) {
        writtenHandle.current.set(id, handle)
        void backup.writeHandle(id, handle).catch(() => undefined)
      }
      const rec = written.current.get(id)
      if (rec && sameRecord(rec, d)) continue
      clearTimeout(timers.current.get(id))
      timers.current.set(id, setTimeout(() => void writeNow(id), BACKUP_DELAY))
    }
  }, [ready, ws.docs, ws.order])

  // The workspace's record (open documents, layout, Explorer, names) when one of them changes.
  useEffect(() => {
    if (!ready || JSON.stringify(W.workspaceRecord(ws)) === wsWritten.current) return
    clearTimeout(wsTimer.current)
    wsTimer.current = setTimeout(() => void writeWorkspaceNow(), BACKUP_DELAY)
  }, [ready, ws.order, ws.layout, ws.explorer, ws.docs])

  // Leaving the page (or hiding it, which may be the last chance on phones): what waits is written now.
  useEffect(() => {
    const flush = () => {
      for (const [id, timer] of [...timers.current]) {
        clearTimeout(timer)
        void writeNow(id)
      }
      if (wsTimer.current !== undefined) {
        clearTimeout(wsTimer.current)
        void writeWorkspaceNow()
      }
    }
    const onHidden = () => document.visibilityState === 'hidden' && flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [])

  // Another tab of the site wrote a document open here too: this tab takes it up (dropping its history), so the next
  // edit here builds on it instead of writing over it. Unless an edit here is still waiting to be written: that edit
  // is never dropped, its write goes out next and the other tab takes it up instead. Closed there (no record left),
  // it stays open here and is written again. Each tab keeps its own open files and layout, and its own sign-in.
  useEffect(() => {
    if (!ready) return
    return backup.onWorkspaceWritten((msg) => {
      const id = msg.doc
      if (!id || !cur(id) || timers.current.has(id)) return
      // Its file handle as stored now too (the other tab stores it at once, before the record): taken as it is, and
      // so never written back here.
      Promise.all([backup.readDoc(id), backup.readHandle(id)]).then(
        ([rec, handle]) => {
          if (!cur(id) || timers.current.has(id)) return
          if (!rec) {
            written.current.delete(id)
            void writeNow(id)
            return
          }
          written.current.set(id, rec)
          const kept = rec.file ? handle : null
          writtenHandle.current.set(id, kept)
          update((w) => W.takeRecord(w, rec, kept))
        },
        () => undefined, // unreadable: this tab keeps what it has
      )
    })
  }, [ready])

  const anyChanges = ws.order.some((id) => W.hasChanges(ws.docs[id]))
  useEffect(() => {
    if (!anyChanges) return
    // Browsers show their own text in this prompt and ignore ours. The timer only runs if the page is still
    // open, so the reminder comes as a toast once the user chooses to stay (or behind the prompt in some browsers).
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      setTimeout(() => say('warning', "Don't forget to save your changes."))
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyChanges])

  // ---- Google Drive, per document (the sign-in is this browser tab's) ----

  // A closed sign-in popup is nothing to report.
  const report = (err: unknown, lead = '') => {
    if (!(err instanceof google.SignInClosed)) say('error', `${lead}${err instanceof Error ? err.message : ''}`.trim())
  }
  // What Google last said about a document's Drive file: whether it is the user's own (shows the top row's Save to
  // Drive), and its name (renamed in Drive, it keeps its id).
  const patchDrive = (id: DocId, driveId: string, patch: Partial<DriveSource>) =>
    update((w) => W.patchDoc(w, id, (d) => (d.drive?.id === driveId ? { drive: { ...d.drive, ...patch } } : null)))
  // Saved to Drive: unmarked, unless it was edited while it uploaded (what is saved is the library as it was). Once on
  // Drive, a local file no longer says where the library is. A save signs in on the way when needed.
  const driveSaved = (id: DocId, saving: Library, to: DriveSource) => {
    update((w) => W.markSaved(w, id, saving, { drive: to, file: null }))
    setSignedNow(google.signedIn())
  }
  // Google's answer about the file, as kept with it: whether it is the user's own, its name now and whether it is in the bin.
  const learned = (now: Owner): Partial<DriveSource> => ({
    mine: now.canEdit,
    ...(now.name && { name: now.name }),
    ...(now.trashed !== undefined && { trashed: now.trashed }),
  })
  // Whose the file is, asked quietly: only with a token that needs no popup, so "Your" and the top row's Save to Drive
  // stay right (a shared link to the user's own file is theirs to save into, not to copy).
  const checkOwner = (id: DocId, driveId: string) => {
    if (signedRef.current && google.hasFreshToken()) void google.ownFile(driveId).then((now) => patchDrive(id, driveId, learned(now)), () => undefined)
  }

  // One save at a time per document: a second click, or Ctrl+S, while one runs does nothing (it would upload twice,
  // and the second would take the first for a change made elsewhere).
  const saving = useRef(new Set<DocId>())
  const once = async (id: DocId, action: () => Promise<boolean>) => {
    if (saving.current.has(id)) return false
    saving.current.add(id)
    try {
      return await action()
    } finally {
      saving.current.delete(id)
    }
  }

  // Into the file, which Google just said is the user's own (`now`). Asks first when it changed elsewhere.
  const saveInto = async (id: DocId, to: DriveSource, now: Owner) => {
    const name = now.name ?? to.name
    const changed = `"${name}" changed on Google Drive since you last opened or saved it here, maybe on another device. Saving replaces it with the courses you have here.`
    if (now.md5 !== to.md5 && !(await confirm(changed, 'Replace', { title: 'Changed on Google Drive' }))) return false
    const library = cur(id)?.library
    if (!library) return false
    const md5 = await google.updateDriveFile(to.id, library)
    driveSaved(id, library, { ...to, md5, mine: true, name })
    say('info', `Saved "${name}" to your Google Drive.`)
    return true
  }
  // A new file in the user's Drive. `lost`: the name of the file it was meant to go into, which is no longer there.
  const saveNew = async (id: DocId, name: string, lost?: string) => {
    const d = cur(id)
    if (!d) return false
    try {
      const made = await google.createDriveFile(d.library, name)
      driveSaved(id, d.library, made)
      if (lost) {
        say('warning', `"${lost}" is no longer in your Google Drive (deleted there, or another account is signed in), so this library was saved as a new file, "${made.name}".`)
      } else {
        // From someone else's file: saving now goes to this copy.
        say('info', d.drive ? `Saved your own copy to Google Drive as "${made.name}".` : `Saved "${made.name}" to your Google Drive.`)
      }
      return true
    } catch (err) {
      report(err, 'Not saved. ')
      return false
    }
  }
  const driveSave = async (id: DocId) => {
    const drive = cur(id)?.drive
    if (!drive) return false
    try {
      const now = await google.ownFile(drive.id)
      if (now.canEdit) return await saveInto(id, drive, now)
      // Google can't find it for this account: deleted for good, or another account signed in. A new file instead.
      patchDrive(id, drive.id, { mine: false })
      return await saveNew(id, drive.name, drive.name)
    } catch (err) {
      report(err, 'Not saved. ')
      return false
    }
  }
  // Signed out, nobody could tell whose it is; signed in, a link may have opened the user's own file. So Google is asked
  // first (signing in when needed), and the user's own file is saved into, not made a second file of.
  const saveCopy = async (id: DocId) => {
    const drive = cur(id)?.drive
    if (!drive) return false
    try {
      const now = await google.ownFile(drive.id)
      setSignedNow(true)
      patchDrive(id, drive.id, learned(now))
      if (!now.canEdit) return await saveNew(id, drive.name)
      const d = cur(id)
      if (d && W.hasChanges(d)) return await saveInto(id, drive, now)
      say('info', `No changes to save in "${now.name ?? drive.name}".`)
      return false
    } catch (err) {
      report(err, 'Not saved. ')
      return false
    }
  }
  const canSave = async (id: DocId) => {
    const drive = cur(id)?.drive
    if (!drive) return false
    try {
      const now = await google.ownFile(drive.id)
      patchDrive(id, drive.id, learned(now))
      return now.canEdit
    } catch (err) {
      report(err)
      return null
    }
  }
  const refresh = async (id: DocId) => {
    const drive = cur(id)?.drive
    // Still signed in after a reload: whose the file is, as Google says now.
    if (google.driveSetUp && drive) checkOwner(id, drive.id)
    if (!google.driveSetUp || !drive?.shared) return
    let now: Awaited<ReturnType<typeof google.driveNow>>
    try {
      now = await google.driveNow(drive.id)
    } catch {
      return // offline or busy: the next start looks again
    }
    if (now === 'gone') {
      say('info', `"${drive.name}" is no longer shared on Google Drive, so it gets no more changes. Your courses here stay as they are.`)
      patchDrive(id, drive.id, { shared: false })
      return
    }
    // Renamed, or moved to the bin or back, in Drive: only what is known about the file changes, never the library.
    if (now.name !== drive.name || now.trashed !== drive.trashed) patchDrive(id, drive.id, { name: now.name, trashed: now.trashed })
    if (now.trashed && !drive.trashed) say('warning', binNote({ ...drive, name: now.name }, signedRef.current && drive.mine))
    const newer = now.md5 !== drive.md5
    update((w) => W.patchDoc(w, id, { newer }))
  }
  const pull = async (id: DocId) => {
    const drive = cur(id)?.drive
    if (!drive) return false
    try {
      // The file as it is now (shared: no sign-in), then the warning, as pulling replaces what is here.
      const { library: loaded, source } = await google.readDriveFile(drive.id, !drive.shared)
      const changed = source.md5 !== drive.md5
      const d = cur(id)
      const dirty = !!d && W.hasChanges(d)
      if (!changed && !dirty) {
        update((w) => W.patchDoc(w, id, { newer: false }))
        say('info', `You already have the newest version of "${source.name}".`)
        return false
      }
      const question = changed
        ? `"${source.name}" has changes on Google Drive. Pulling them replaces its courses here${dirty ? ', and your unsaved changes' : ''}.`
        : `"${source.name}" has no new changes on Google Drive. Pulling it again replaces your unsaved changes here.`
      if (!(await confirm(question, 'Pull', { title: 'Pull changes' }))) return false
      update((w) => W.replaceDoc(w, id, loaded, { drive: { ...source, shared: drive.shared, mine: drive.mine }, file: null, newer: false }))
      say('info', `Pulled the newest version of "${source.name}" from Google Drive.`)
      return true
    } catch (err) {
      report(err, 'Could not pull the changes. ')
      return false
    }
  }
  const share = async (id: DocId) => {
    const drive = cur(id)?.drive
    if (!drive) return false
    try {
      await google.shareDriveFile(drive.id)
      update((w) => W.patchDoc(w, id, (d) => (d.drive ? { drive: { ...d.drive, shared: true } } : null)))
      return true
    } catch (err) {
      report(err)
      return false
    }
  }

  const openDrive = async (driveId: string, own = false) => {
    if (!google.driveSetUp) {
      say('error', "Google Drive isn't set up on this site yet.")
      return false
    }
    const open = W.docWithDrive(ref.current, driveId)
    if (open) {
      const tab = newId()
      update((w) => W.activateDoc(w, open.id, tab))
      // Its link opened again: bring its changes, if any (asking first, as they replace these).
      return own ? true : pull(open.id)
    }
    try {
      const { library, source } = await google.readDriveFile(driveId, own)
      const id = newId()
      const tab = newId()
      update((w) => W.addDoc(w, W.makeDoc(id, library, source.name, { drive: source }), HOME, tab))
      if (own) setSignedNow(true)
      else checkOwner(id, driveId)
      say('info', `Opened "${source.name}" ${driveFrom(source, own)}.`)
      // It opens (a link works until the file is deleted for good), but nobody should count on it.
      if (source.trashed) say('warning', binNote(source, own))
      return true
    } catch (err) {
      report(err, 'Could not open this Google Drive file. ')
      return false
    }
  }

  const signOut = () => {
    google.signOut()
    setSignedNow(false)
  }
  const account = async () => {
    try {
      return await google.accountEmail()
    } catch (err) {
      report(err)
      return null
    }
  }
  const signIn = async () => {
    try {
      await google.signIn()
      setSignedNow(true)
      // Whose each open Drive file is, now that Google can say (the sidebar shows it).
      for (const d of Object.values(ref.current.docs)) if (d.drive) void canSave(d.id)
      return true
    } catch (err) {
      report(err)
      return false
    }
  }
  // Libraries read to show what is inside them, by file and version.
  const peeked = useRef(new Map<string, Library>())
  const peek = async (driveId: string, version = '') => {
    const key = `${driveId}|${version}`
    const hit = peeked.current.get(key)
    if (hit) return hit
    try {
      const { library } = await google.readDriveFile(driveId, true)
      for (const k of peeked.current.keys()) if (k.startsWith(`${driveId}|`)) peeked.current.delete(k)
      peeked.current.set(key, library)
      return library
    } catch (err) {
      report(err, 'Could not read this Google Drive file. ')
      return null
    }
  }
  const list = async () => {
    try {
      return await google.listDriveFiles()
    } catch (err) {
      report(err)
      return null
    }
  }
  const pick = async () => {
    try {
      const picked = await google.pickDriveFiles()
      setSignedNow(true)
      const libraries = picked.filter((f) => google.isLibraryName(f.name))
      const others = picked.filter((f) => !google.isLibraryName(f.name))
      if (libraries.length) say('info', `Added ${plural(libraries.length, 'library', 'libraries')} to your list.`)
      if (others.length) say('warning', `Not a .shrimp file, so not added: ${others.map((f) => `"${f.name}"`).join(', ')}.`)
      return libraries.length
    } catch (err) {
      report(err, 'Could not open the file picker. ')
      return null
    }
  }
  const remove = async (file: DriveFile) => {
    const question = `Move "${file.name}" to the bin in your Google Drive? Anyone with its link can no longer open it. You can restore it from the bin for 30 days.`
    if (!(await confirm(question, 'Move to bin', { title: 'Delete from Google Drive?', danger: true }))) return false
    try {
      await google.trashDriveFile(file.id)
      // The libraries here stay, no longer tied to the file.
      update((w) => w.order.reduce((x, id) => W.patchDoc(x, id, (d) => (d.drive?.id === file.id ? { drive: null } : null)), w))
      say('info', `Moved "${file.name}" to the bin in your Google Drive.`)
      return true
    } catch (err) {
      report(err, 'Not deleted. ')
      return false
    }
  }

  const driveFor = (d: W.Doc | null, signedIn: boolean): DriveApi => {
    const id = d?.id
    const yours = signedIn && !!d?.drive?.mine
    return {
      setUp: google.driveSetUp,
      file: d?.drive ?? null,
      signedIn: () => signedIn,
      canListQuietly: () => google.hasFreshToken(),
      yours,
      newer: !!d?.newer,
      savesInto: yours,
      signOut,
      account,
      prepare: () => void google.prepareSignIn().catch(() => undefined),
      signIn,
      canSave: async () => (id ? canSave(id) : false),
      open: openDrive,
      refresh: async () => (id ? refresh(id) : undefined),
      pull: async () => (id ? pull(id) : false),
      save: async () => (id ? once(id, () => driveSave(id)) : false),
      saveCopy: async () => (id ? once(id, () => saveCopy(id)) : false),
      saveNew: async (name) => (id ? once(id, () => saveNew(id, name)) : false),
      share: async () => (id ? share(id) : false),
      list,
      remove,
      pick,
      peek,
    }
  }

  // ---- Files: open, save, download, close ----

  const saveLocal = async (id: DocId) => {
    const d = cur(id)
    if (!d) return false
    if (d.file && !W.hasChanges(d)) {
      say('info', 'No changes to save.')
      return true
    }
    const name = W.docName(d)
    const library = d.library
    try {
      if (d.file?.handle) {
        let result = await adapter.saveInPlace(d.file.handle, library, d.file.modified || null)
        if (result.status === 'changed') {
          const question = `"${name}" changed on disk since you opened or saved it here, maybe in another app. Saving replaces it with this version.`
          if (!(await confirm(question, 'Replace', { title: 'File changed on disk' }))) return false
          result = await adapter.saveInPlace(d.file.handle, library, null, true)
        }
        if (result.status === 'saved') {
          const file = result.file
          update((w) => W.markSaved(w, id, library, { file }))
          return true
        }
        if (result.status === 'error') {
          say('error', `Not saved. ${result.message}`)
          return false
        }
        // Permission refused: Save as instead.
      }
      const file = await adapter.saveAs(library, name)
      if (!file) return false
      update((w) => W.markSaved(w, id, library, { file, drive: null }))
      return true
    } catch (err) {
      say('error', `Not saved.${errorText(err)}`)
      return false
    }
  }

  const saveDoc = async (id: DocId): Promise<boolean> => {
    const d = cur(id)
    if (!d) return false
    if (!d.drive) return once(id, () => saveLocal(id))
    // Into the Drive file only when signed in and Google said it is the user's own; otherwise a copy, signed out too.
    if (!(signedRef.current && d.drive.mine)) return once(id, () => saveCopy(id))
    if (!W.hasChanges(d)) {
      say('info', 'No changes to save.')
      return true
    }
    return once(id, () => driveSave(id))
  }

  const download = async (id: DocId) => {
    const d = cur(id)
    if (!d) return
    try {
      // Named after the local file, else after its Drive file, else its own name.
      await adapter.download(d.library, d.file?.name ?? d.drive?.name ?? d.name)
    } catch (err) {
      say('error', `Download stopped.${errorText(err)}`)
    }
  }

  const closeDoc = async (id: DocId) => {
    let asked = 0
    // Asked again when changes came in while it saved (typed in another pane meanwhile): those are not saved yet.
    const ask = () => {
      const name = W.docName(cur(id)!)
      const question = asked++
        ? `"${name}" changed while it saved. Save these changes too? If you don't save them, they are lost.`
        : `Save changes to "${name}"? If you don't save them, they are lost.`
      return deps.current.askChoice<'save' | 'discard'>(
        question,
        [
          { label: 'Save', value: 'save', primary: true },
          { label: "Don't save", value: 'discard' },
        ],
        { title: 'Close file' },
      )
    }
    const dirty = () => {
      const d = cur(id)
      return d ? W.hasChanges(d) : null
    }
    if (!(await W.readyToClose(dirty, ask, () => saveDoc(id)))) return false
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    clearTimeout(follows.current.get(id))
    follows.current.delete(id)
    for (const map of [written, writtenHandle, seen, apis, named]) map.current.delete(id)
    update((w) => W.closeDoc(w, id))
    void backup.deleteDoc(id).catch(() => undefined)
    return true
  }

  const newDoc = (at: Route = HOME) => {
    const id = newId()
    const tab = newId()
    update((w) => W.addDoc(w, W.makeDoc(id, emptyLibrary(), W.freeDocName(w, 'New library')), at, tab))
    return id
  }

  const openLibrary = async (load: () => Promise<Library>, name: string, at: Route = HOME) => {
    try {
      const library = await load()
      const id = newId()
      const tab = newId()
      update((w) => W.addDoc(w, W.makeDoc(id, library, W.freeDocName(w, name)), at, tab))
      return id
    } catch (err) {
      say('error', `This file could not be opened.${errorText(err)}`)
      return null
    }
  }

  const openFile = async (at: Route = HOME) => {
    let opened: Awaited<ReturnType<StorageAdapter['openFiles']>>
    try {
      opened = await adapter.openFiles()
    } catch (err) {
      say('error', `This file could not be opened.${errorText(err)}`)
      return null
    }
    if (!opened) return null
    let last: DocId | null = null
    for (const o of opened) {
      if (!o.ok) {
        say('error', `"${o.name}" could not be opened. ${o.error}`)
        continue
      }
      // One document per file: opened again, it shows the one it is open in.
      let same: W.Doc | undefined
      for (const d of Object.values(ref.current.docs)) {
        if (d.file && (await adapter.sameFile(d.file, o.file).catch(() => false))) {
          same = d
          break
        }
      }
      if (!same) {
        const id = newId()
        const tab = newId()
        update((w) => W.addDoc(w, W.makeDoc(id, o.library, o.file.name, { file: o.file }), at, tab))
        last = id
        continue
      }
      const sameId = same.id
      const name = W.docName(same)
      const reloads = W.changedOnDisk(same, o.file)
      let asks = false
      const tab = newId()
      update((w) => {
        const r = W.reopenFile(w, sameId, o.library, o.file, tab)
        asks = r.ask
        return r.workspace
      })
      if (asks) {
        const question = `"${name}" changed on disk since you opened or saved it here. Open it as it is now? Your unsaved changes here are lost.`
        if (await confirm(question, 'Open', { title: 'File changed on disk', danger: true })) {
          update((w) => W.replaceDoc(w, sameId, o.library, { file: o.file }))
        }
      } else if (reloads) {
        say('info', `Reloaded "${name}": it changed on disk.`)
      }
      last = sameId
    }
    return last
  }

  const saveAll = async () => {
    for (const id of ref.current.order) {
      const d = cur(id)
      if (d && W.hasChanges(d)) await saveDoc(id)
    }
  }

  // ---- Undo, redo, clipboard ----

  // A step in a file that isn't the one on screen changes nothing visible, so it says what it did.
  const tell = (verb: string, entry: { label: string; before: W.Snap }) => {
    const ids = Object.keys(entry.before)
    const active = W.activeDoc(ref.current)
    if (active && ids.includes(active)) return
    const names = ids.flatMap((id) => (cur(id) ? [`"${W.docName(cur(id)!)}"`] : []))
    if (names.length) say('info', `${verb} "${entry.label}" in ${names.join(', ')}.`)
  }
  const undo = () => {
    let entry: { label: string; before: W.Snap } | undefined
    update((w) => {
      const step = W.undoEdit(w)
      entry = step?.entry
      return step?.workspace ?? w
    })
    if (entry) tell('Undid', entry)
  }
  const redo = () => {
    let entry: { label: string; before: W.Snap } | undefined
    update((w) => {
      const step = W.redoEdit(w)
      entry = step?.entry
      return step?.workspace ?? w
    })
    if (entry) tell('Redid', entry)
  }
  const undoLater = () => {
    const step = W.lastStep(ref.current)
    return () => {
      let entry: { label: string; before: W.Snap } | undefined
      update((w) => {
        const done = W.undoStep(w, step)
        entry = done?.entry
        return done?.workspace ?? w
      })
      if (entry) tell('Undid', entry)
      else say('info', `Other changes came after this. ${comboLabel('Mod+Z', isMac(navigator.platform))} steps back through them.`)
    }
  }
  // A refused copy, cut or paste says why and changes nothing.
  const tryUpdate = (fn: (w: W.Workspace) => W.Workspace) => {
    try {
      update(fn)
    } catch (err) {
      say('warning', err instanceof Error ? err.message : String(err))
    }
  }

  // ---- One document's API, the same object while nothing it shows changes ----

  const apis = useRef(new Map<DocId, { doc: W.Doc; signed: boolean; ready: boolean; api: LibraryApi }>())
  const makeApi = (d: W.Doc): LibraryApi => {
    const id = d.id
    const { library } = d
    // What is there now, for actions run after the render (several in one click build on each other).
    const latest = () => cur(id)?.library ?? library
    return {
      ready,
      id,
      name: W.docName(d),
      library,
      replaced: d.replaced,
      hasChanges: W.hasChanges(d),
      loadLabel: adapter.loadLabel,
      saveLabel: adapter.saveLabel,
      loadHint: adapter.loadHint,
      saveHint: adapter.saveHint,
      findCourse: (courseId) => library.courses.find((c) => c.id === courseId),
      findQuiz: (quizId) => quizIn(library, quizId),

      addCourse() {
        const course: Course = { id: newId(), name: freeName('New course', latest().courses.map((c) => c.name)), quizzes: [] }
        drafts.current.set(course.id, course)
        edit(id, 'Add course', (lib) => ({ ...lib, courses: [...lib.courses, course] }))
        return course
      },
      leaveCourse(courseId) {
        const draft = drafts.current.get(courseId)
        if (!draft) return
        drafts.current.delete(courseId)
        update((w) => W.dropDraft(w, id, draft))
      },
      renameCourse(courseId, name) {
        drafts.current.delete(courseId)
        edit(id, 'Rename course', (lib) => mapCourses(lib, (c) => (c.id === courseId && c.name !== name ? { ...c, name } : c)), `course:${courseId}`)
      },
      deleteCourse(courseId) {
        const draft = drafts.current.get(courseId)
        drafts.current.delete(courseId)
        // Untouched since it was made: gone as if never made. Edited (even from the Explorer): an undoable step.
        if (draft && latest().courses.includes(draft)) return update((w) => W.dropDraft(w, id, draft))
        edit(id, 'Delete course', (lib) => ({ ...lib, courses: lib.courses.filter((c) => c.id !== courseId) }))
      },
      addQuiz(courseId) {
        drafts.current.delete(courseId)
        const taken = latest().courses.find((c) => c.id === courseId)?.quizzes.map((q) => q.name) ?? []
        const quiz: Quiz = { id: newId(), name: freeName('New quiz', taken), groups: [], cards: [] }
        edit(id, 'Add quiz', (lib) => mapCourses(lib, (c) => (c.id === courseId ? { ...c, quizzes: [...c.quizzes, quiz] } : c)))
        return quiz
      },
      renameQuiz(quizId, name) {
        edit(id, 'Rename quiz', (lib) => mapQuiz(lib, quizId, (q) => (q.name === name ? q : { ...q, name })), `quiz:${quizId}`)
      },
      deleteQuiz(quizId) {
        edit(id, 'Delete quiz', (lib) =>
          mapCourses(lib, (c) => (c.quizzes.some((q) => q.id === quizId) ? { ...c, quizzes: c.quizzes.filter((q) => q.id !== quizId) } : c)),
        )
      },
      setCards(quizId, cards, groups) {
        const quiz = quizIn(latest(), quizId)?.quiz
        if (!quiz) return
        // The same cards and groups again (a list rebuilt in group order) change nothing.
        const change = cardsEdit(quiz, cards, groups ?? quiz.groups)
        if (!change) return
        edit(id, change.label, (lib) => mapQuiz(lib, quizId, (q) => ({ ...q, cards, ...(groups && { groups }) })), change.key)
      },
      addSideType(pair) {
        edit(id, 'Add side type', (lib) => ({ ...lib, sideTypes: addSideType(lib.sideTypes ?? [], pair) }))
      },
      renameSideType(from, to) {
        edit(id, 'Rename side type', (lib) => renameSideType(lib, from, to))
      },
      deleteSideType(pair) {
        edit(id, 'Delete side type', (lib) => deleteSideType(lib, pair))
      },
      updateCard(quizId, card) {
        edit(
          id,
          'Edit card',
          (lib) => mapQuiz(lib, quizId, (q) => (q.cards.some((c) => c.id === card.id && c !== card) ? { ...q, cards: q.cards.map((c) => (c.id === card.id ? card : c)) } : q)),
          `card:${card.id}`,
        )
      },
      replace(next) {
        const at = Date.now()
        update((w) => {
          const changed = W.applyEdit(w, 'Replace library', (docs) => (docs[id] ? { ...docs, [id]: next } : docs), at)
          // Its pages may be gone with it, on purpose (App moves on quietly).
          return changed === w ? w : W.patchDoc(changed, id, (x) => ({ replaced: x.replaced + 1 }))
        })
      },
      save: () => saveDoc(id),
      download: () => download(id),
      close: () => closeDoc(id),
      file: d.file,
      fileName: d.file?.name ?? null,
      drive: driveFor(d, signed),
    }
  }
  const doc = (id: DocId): LibraryApi => {
    const d = cur(id)
    // A document closed meanwhile: an empty one whose actions find nothing to change.
    if (!d) return makeApi(W.makeDoc(id, emptyLibrary(), ''))
    const hit = apis.current.get(id)
    if (hit && hit.doc === d && hit.signed === signed && hit.ready === ready) return hit.api
    const api = makeApi(d)
    apis.current.set(id, { doc: d, signed, ready, api })
    return api
  }

  return {
    ready,
    docs: ws.order.map((id) => {
      const d = ws.docs[id]
      return { id, name: W.docName(d), where: W.where(d), dirty: W.hasChanges(d) }
    }),
    active: W.activeDoc(ws),
    doc,
    layout: ws.layout,
    address: W.addressTab(ws),
    recent: ws.recent,
    activate: (id) => {
      const tab = newId()
      update((w) => W.activateDoc(w, id, tab))
    },
    openPlace: (docId, route, o) => {
      const fresh = newId()
      let tab: TabId | null = null
      update((w) => {
        const r = W.openPlace(w, docId, route, fresh, o)
        tab = r.tab
        return r.workspace
      })
      return tab
    },
    setTabRoute: (tabId, route) => update((w) => W.setTabRoute(w, tabId, route)),
    activateTab: (tabId) => update((w) => W.activateTab(w, tabId)),
    activateGroup: (groupId) => update((w) => W.activateGroup(w, groupId)),
    closeTabs: (tabIds) => update((w) => W.closeTabs(w, tabIds)),
    closeOthers: (tabId) => update((w) => W.closeOthers(w, tabId)),
    closeAll: (groupId) => update((w) => W.closeAll(w, groupId)),
    moveTab: (tabId, toGroup, index) => update((w) => W.moveTab(w, tabId, toGroup, index)),
    split: (groupId, dir, side, tabId, move) => {
      const made = ids()
      update((w) => W.splitGroup(w, groupId, dir, side, made.group, move ? { tabId: made.tab, move: tabId } : { tabId: made.tab, copy: tabId }))
    },
    join: (from, into) => update((w) => W.joinGroups(w, from, into)),
    resize: (win, path, sizes) => update((w) => W.resizeSplit(w, win, path, sizes)),
    popOut: (groupId, win) => {
      const spare = newId()
      update((w) => W.popOutGroup(w, groupId, win, spare))
    },
    dock: (win) => update((w) => W.dockWindow(w, win)),
    showExplorer: (beside, split) => {
      const made = ids()
      update((w) => W.showExplorer(w, beside, { split, tabId: made.tab, groupId: made.group }))
    },
    showChangelog: (group) => {
      const tab = newId()
      update((w) => W.showChangelog(w, group ?? w.layout.activeGroup, tab))
    },
    followHistory: (tabId, route) => {
      const before = ref.current
      update((w) => W.followHistory(w, tabId, route))
      return ref.current !== before
    },
    recentGroup: (except) => W.recentGroup(ref.current, except),
    apply,
    undo,
    redo,
    undoLater,
    undoLabel: undoLabel(ws.history),
    redoLabel: redoLabel(ws.history),
    clipboard: ws.clipboard,
    copy: (refs, from) => tryUpdate((w) => W.toClipboard(w, refs, 'copy', from)),
    cut: (refs) => tryUpdate((w) => W.toClipboard(w, refs, 'cut')),
    paste: (target) => {
      const at = Date.now()
      tryUpdate((w) => W.paste(w, target, newId, at))
    },
    newDoc,
    openFile,
    openLibrary,
    openDrive,
    saveAll,
    closeDoc,
    explorer: ws.explorer,
    setExplorer: (explorer) => update((w) => ({ ...w, explorer })),
    drive: driveFor(null, signed),
    loadLabel: adapter.loadLabel,
    loadHint: adapter.loadHint,
  }
}
