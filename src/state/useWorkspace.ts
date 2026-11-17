import { useEffect, useRef, useState } from 'react'
import { emptyLibrary, newId } from '../model'
import type { Card, Choice, Course, Group, Library, Quiz, Sides } from '../model'
import { addSideType, deleteSideType, renameSideType } from '../logic/sides'
import { copyName, fileNameProblem, freeName } from '../logic/names'
import { plural } from '../logic/plural'
import { cardsEdit } from '../logic/cardsEdit'
import type { Docs, ItemRef, Target } from '../logic/contentOps'
import type { Notify } from '../logic/pushToast'
import { fileKeys, parseAddress, type Route } from '../logic/routes'
import { AUTOSAVE_DELAY, RENAME_VIEW_ONLY_TEXT, RETRY_DELAY, SYNC_EVERY, isViewOnly, needsAttention, saveStatus, type SaveProblem, type SaveStatus } from '../logic/autosave'
import { keepIds } from '../logic/keepIds'
import { closedNote } from '../logic/whereLine'
import * as backup from '../storage/browserBackup'
import * as google from '../storage/googleDrive'
import type { DriveFile, DriveSource } from '../storage/googleDrive'
import type { StorageAdapter } from '../storage/StorageAdapter'
import { comboLabel, isMac } from '../kit/shortcuts'
import { redoLabel, undoLabel } from '../kit/history'
import type { GroupId, Layout, Tab, TabId, WindowId } from '../kit/layout'
import * as W from './workspace'
import type { AppPage, Clipboard, ClosedFile, DocId, DocTab, Explorer, TabData } from './workspace'
export type { ClosedFile, DocId, DocTab, DriveFile, DriveSource, SaveStatus, TabData }

/** Shows a question with a confirm button; resolves true when confirmed. */
export type Ask = (question: string, confirmLabel: string, options?: { title?: string; danger?: boolean }) => Promise<boolean>
/** Shows a question with several answers (and Cancel); resolves the chosen value, null for Cancel. */
export type AskChoice = <V>(question: string, choices: Choice<V>[], options?: { title?: string }) => Promise<V | null>

// Google Drive (see storage/googleDrive). Errors show as toasts; the calls resolve false or null then.
export type DriveApi = {
  /** False until Google Drive is set up on this site. */
  setUp: boolean
  /** The Drive file this library is; null for a browser library. */
  file: DriveSource | null
  /** True while signed in with Google: one account for every tab of this browser, kept until Sign out. */
  signedIn(): boolean
  /** The sign-in has a token that works right now, so a call needs no popup (listing on its own is only safe then). */
  canListQuietly(): boolean
  /**
   * The file is the signed-in user's own, as Google said: it saves itself (autosave). Signed out, nobody can tell
   * (`file.mine` only remembers what Google last said), so no text claims it is "yours" then.
   */
  yours: boolean
  /** Saving goes into the file itself (the same as `yours`): any other Drive file is view only. */
  savesInto: boolean
  /**
   * Signs out in every tab (asked for: the account is forgotten). Saves still waiting go first; when one can't be
   * saved it asks first (Download a copy, or Sign out anyway). Then every Google Drive library closes, its backup and
   * closed entry gone; browser libraries stay. Resolves false when it did not sign out.
   */
  signOut(): Promise<boolean>
  /** The signed-in account's email address. */
  account(): Promise<string | null>
  /** Loads Google's sign-in script ahead of a click, so the popup opens at once. */
  prepare(): void
  /** Signs in with Google (a popup); saves paused for a sign-in go on. */
  signIn(): Promise<boolean>
  /** Whether the signed-in user can save to `file` (false for someone else's file). */
  canSave(): Promise<boolean | null>
  /**
   * Opens a Drive file as a new document beside the others: a shared one (no sign-in), or `own`, one from `list`.
   * Already open, its document becomes active and looks for a newer version.
   */
  open(id: string, own?: boolean): Promise<boolean>
  /** Looks at the file now without asking anything: whose it is, its name, the bin, and a newer version (taken). */
  refresh(): Promise<void>
  /**
   * Upload (and Keep both): saves the library as a new file in the signed-in user's Drive (signing in on the way),
   * which becomes its file and saves itself from then on.
   */
  saveNew(name: string): Promise<boolean>
  /** Replace it: the library goes into `file`, one of the user's Drive libraries (`list`) not open here, which becomes its file. */
  saveOver(file: DriveFile): Promise<boolean>
  /** Sets `file` to "Anyone with the link can view". */
  share(): Promise<boolean>
  /** Stops "Anyone with the link can view" on `file`. */
  unshare(): Promise<boolean>
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
   * Reads a Drive library without opening it (the Explorer shows what is inside): one of the user's, or a closed link.
   * `version` (its last change) keeps a read for the session: the same file at the same version is not read again.
   * Null after an error.
   */
  peek(id: string, version?: string): Promise<Library | null>
}

// Everything the UI can read or do with one open document (library). Screens only use this.
export type LibraryApi = {
  /** False until the browser backup has been read. Show nothing before then: the library is still empty. */
  ready: boolean
  /** The document's id in the workspace. */
  id: DocId
  /** What it is called: its Drive file's name, or its own ("New library 2"). */
  name: string
  library: Library
  /**
   * Counts the times the whole library was replaced (a newer version from Google Drive, taken from another tab, loaded
   * as text). A page of the old library is then gone on purpose, not a bad address (App moves on quietly).
   */
  replaced: number
  /** Where it lives: a Google Drive file, or only this browser (a browser library). */
  where: 'drive' | 'browser'
  /** How its saving stands (logic/autosave): saved, saving, paused and why, view only, or a browser library. */
  status: SaveStatus
  /**
   * View only (asked for): someone else's Drive file, or any while signed out. No change goes in (each is refused with
   * a toast); it stays in sync with Google Drive, and Make a copy gives one that can change.
   */
  readOnly: boolean
  /** Its save is paused and needs the user (`needsAttention(status)`): the tab's dot, the corner badge. */
  hasChanges: boolean
  downloadLabel: string
  downloadHint: string
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
   * Save now (Ctrl+S, the save slot's Save now and Resolve): the user's own Drive file saves at once, in the click, so
   * a sign-in that ran out is renewed and a conflict is asked about again. Resolves true when nothing is left to save;
   * false for a browser library (the caller opens Upload to Google Drive) and a view-only one.
   */
  saveNow(): Promise<boolean>
  /**
   * Make a copy (asked for): signed in, the user's own Drive file "Copy of <name>" (saving itself); signed out, a
   * browser library of that name. It opens on the same page in the tab that showed this one, which stays open.
   * Resolves the copy's id (null when this library is gone, or the sign-in failed). Signed in, a Drive file shown as
   * view only is first checked again (in the click): when it is the user's own after all, it becomes editable and no
   * copy is made (resolves its own id).
   */
  makeCopy(): Promise<DocId | null>
  /** A copy as a .shrimp file. Never changes where the library lives. */
  download(): Promise<void>
  /**
   * Closes it (it stays in the Explorer, closed): a Drive file saves what waits first, and asks (Close anyway, Save
   * and close) when that fails. Then a toast says where it is, with Reopen. Resolves true when closed.
   */
  close(): Promise<boolean>
  drive: DriveApi
}

/** One open library as the sidebar lists it. `dirty`: it needs attention (a paused save). */
export type DocMeta = { id: DocId; name: string; where: 'drive' | 'browser'; readOnly: boolean; dirty: boolean }

export type WorkspaceApi = {
  /** False until the browser backup has been read (App renders nothing before). */
  ready: boolean
  /** The open documents, in the sidebar's order. */
  docs: DocMeta[]
  /** The active file: the active tab's, else the file of the tab active last; null when no tab shows one. */
  active: DocId | null
  /** One document's API, the same object until that document (or the sign-in, or its saving) changes. */
  doc(id: DocId): LibraryApi
  layout: Layout<TabData>
  /** The tab the main window's address names (`addressIn` the main window). */
  address: Tab<TabData> | null
  /** The tab a window's address names: its focused group's active tab, of any kind; null when that group is empty. */
  addressIn(win: WindowId): Tab<TabData> | null
  /** A file's part in the address while several files are open (unique among them); null with one. */
  fileKey(doc: DocId): string | null
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
  /** One tab into window `win`, in a group of its own; the rest of its group stays. */
  popOutTab(tabId: TabId, win: WindowId): void
  dock(win: WindowId): void
  /** Shows the Explorer: activated where it shows, else split on the left of `beside` (`split`) or as a tab. */
  showExplorer(beside: GroupId, split: boolean): TabId | null
  /** A copy of a tab right after it (asked for): a file's page, an Explorer with its own view, an app page. */
  duplicateTab(tabId: TabId): void
  /**
   * One of the app's own pages in a tab (one at most each: What's new, the welcome page, How studying works), in
   * `group` (default: the active one); `background` (a Ctrl or middle click) opens it without showing it.
   */
  showAppPage(kind: AppPage, group?: GroupId, background?: boolean): void
  /**
   * Back, forward, a typed address or a reload: the entry's own tab (`tabId`, from history.state) takes its page, or the
   * file the address names (`file`, a `fileKey`), or the app's own page's tab (see workspace.followHistory); true when
   * something changed.
   */
  followHistory(tabId: TabId | null, route: Route, file?: string | null): boolean
  /** The group used most recently other than `except`. */
  recentGroup(except: GroupId | null): GroupId | null
  /**
   * The one content write path: one undoable step. A change to a view-only library is refused with a toast, and
   * nothing changes.
   */
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
  /**
   * An empty library, "New library" (or "New library 2"...), active, its tab on `at` (default home): a browser
   * library. `inDrive` (a library made on the way, as by + New course with no file open): signed in, it is saved to
   * the user's Drive at once under that name, no question asked.
   */
  newDoc(at?: Route, o?: { inDrive?: boolean }): DocId
  /**
   * The file picker: each picked .shrimp file opens as a browser library named after the file ("Name (2)" when taken),
   * with a toast offering Upload to Google Drive. Resolves the last one opened, null for none.
   */
  openFile(at?: Route): Promise<DocId | null>
  /** A library a loader gives (the guide, the debug page's samples) as a new document named after `name`. */
  openLibrary(load: () => Promise<Library>, name: string, at?: Route): Promise<DocId | null>
  /** A Google Drive file as a new document (or the one it is already open in). */
  openDrive(id: string, own?: boolean): Promise<boolean>
  /**
   * Renames a library: a browser library's own name, or the user's Drive file (waiting for its create; a failure
   * keeps the old name). Names need not be unique. Refused with a toast: an empty name, one that can't be a file
   * name, someone else's file. Not in the undo history. Resolves whether it is now named so.
   */
  renameDoc(id: DocId, name: string): Promise<boolean>
  /** Closes a library (see `LibraryApi.close`). */
  closeDoc(id: DocId): Promise<boolean>
  /** The files closed here, the one closed last first: listed in the Explorer to open again. */
  closed: ClosedFile[]
  /** Opens a closed file again under its own id (a browser library from this browser, a Drive file from Drive). */
  reopenClosed(id: DocId): Promise<DocId | null>
  /** Removes a closed file from the list; a browser library is deleted from this browser. The UI asks first. */
  forgetClosed(id: DocId): void
  /** What a closed file holds, without opening it (the Explorer shows it); null when it can't be read. */
  readClosed(id: DocId): Promise<Library | null>
  explorer: Explorer
  setExplorer(explorer: Explorer): void
  /** An Explorer tab's view (its open nodes and selection): its own (a duplicate), else the workspace's. */
  explorerView(tabId: TabId): Explorer
  setExplorerView(tabId: TabId, view: Explorer): void
  /** Google Drive with no document behind it (signing in, the list, the picker): `file` is null. */
  drive: DriveApi
  openLabel: string
  openHint: string
}

// The backup holds whole libraries, images included, so each waits for a pause in its edits.
const BACKUP_DELAY = 300
// Tabs follow a rename once the typing pauses: the main window's active tab writes its page to the address bar, and
// browsers limit how often that may change.
const FOLLOW_DELAY = 300
const HOME: Route = { name: 'home' }
// The ids a transition needs, made before it runs (transitions stay pure).
const ids = () => ({ tab: newId(), group: newId() })
const SIGNED_OUT = 'Signed out. Your Google Drive libraries are closed. Sign in to open them again.'

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
// The record as written already says this about the document: nothing to write.
const sameRecord = (rec: backup.DocRecord, d: W.Doc) => rec.library === d.library && rec.dirty === W.hasChanges(d) && rec.drive === d.drive
// The user's own Drive file, which saves itself; anything else never saves.
const ownDrive = (d: W.Doc | undefined, signedIn: boolean): d is W.Doc & { drive: DriveSource } => !!d?.drive && !isViewOnly(d, signedIn)

/**
 * The workspace: every open document, the closed ones, the layout (tabs, groups, splits, windows), the undo history
 * and the clipboard, as one state with one write path for content (`apply`). The user's own Drive files save
 * themselves (autosave), and every Drive file with nothing to save takes newer versions from Drive (sync). `pane`:
 * pane mode, a popped-out window's address opened on its own: the main window shows just that page, and its layout is
 * never written to the backup (the full app's stays).
 */
export function useWorkspace(adapter: StorageAdapter, notify: Notify, ask: Ask, askChoice: AskChoice, options: { pane?: boolean } = {}): WorkspaceApi {
  const [ws, setWs] = useState<W.Workspace>(() => W.emptyWorkspace('main-group', google.signedIn()))
  // The latest state, ahead of the render: transitions build on it, so several in one click compose, and the actions
  // (often async) always read what is there now.
  const ref = useRef(ws)
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  // Documents whose save to Google Drive is under way.
  const [busy, setBusy] = useState<ReadonlySet<DocId>>(() => new Set())
  // The latest callbacks from App (they are new functions on every render).
  const deps = useRef({ notify, ask, askChoice, pane: !!options.pane })
  deps.current = { notify, ask, askChoice, pane: !!options.pane }
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
  const markBusy = (id: DocId, on: boolean) =>
    setBusy((s) => {
      if (s.has(id) === on) return s
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  // A refused change, copy, cut or paste says why and changes nothing.
  const tryUpdate = (fn: (w: W.Workspace) => W.Workspace) => {
    try {
      update(fn)
    } catch (err) {
      say('warning', err instanceof Error ? err.message : String(err))
    }
  }
  const apply = (label: string, change: (docs: Docs) => Docs, key?: string) => {
    const at = Date.now()
    tryUpdate((w) => W.applyEdit(w, label, change, at, key))
  }
  const edit = (id: DocId, label: string, fn: (lib: Library) => Library, key?: string) =>
    apply(label, (docs) => (docs[id] ? { ...docs, [id]: fn(docs[id]) } : docs), key)

  // A change that may turn a library view only (the sign-in, what Google says about a file) goes through here: its
  // changes from before move to a library of their own, and it says so (W.settleViewOnly). `signedOut`: another tab
  // signed out, which closes every Drive library here too.
  const tellKept = (kept: { from: DocId; to: DocId }[], signedOut = false) => {
    for (const k of kept) {
      const from = cur(k.from)
      const to = cur(k.to)
      if (!from || !to) continue
      say(
        'info',
        signedOut
          ? `Signed out in another tab. Your changes to "${W.docName(from)}" that weren't on Google Drive yet are kept in a library of their own in this browser, "${to.name}".`
          : `"${W.docName(from)}" is view only, so the changes you made to it are kept in a library of their own in this browser, "${to.name}".`,
      )
    }
  }
  const settle = (fn: (w: W.Workspace) => W.Workspace, signedOut = false) => {
    let kept: { from: DocId; to: DocId }[] = []
    update((w) => {
      const done = W.settleViewOnly(fn(w), newId)
      kept = done.kept
      return done.workspace
    })
    tellKept(kept, signedOut)
  }
  const setSignedNow = (on: boolean) => settle((w) => W.setSignedIn(w, on))
  // A call that may have signed in on the way.
  const signedInNow = () => {
    if (google.signedIn() !== ref.current.signedIn) setSignedNow(google.signedIn())
  }

  // Courses created here (by id, the course object as created): a draft only while the library still holds that very
  // object (W.dropDraft). Kept in memory only, so a reload keeps them.
  const drafts = useRef(new Map<string, Course>())

  // ---- The browser backup: each document's record and the workspace's record ----

  // The record each document has in the backup now (read on start, written here, or written by another tab).
  const written = useRef(new Map<DocId, backup.DocRecord>())
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
  // Pane mode: the layout (and the tabs used last) as the full app left it, written back in place of the pane's.
  const stored = useRef<{ layout: unknown; recent: unknown } | null>(null)
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
      say('warning', `This browser could not keep a copy of your changes to "${W.docName(d)}". Download a copy before you close the page.`)
    }
  }
  const recordOf = (w: W.Workspace): backup.WorkspaceRecord => {
    const rec = W.workspaceRecord(w)
    const kept = stored.current
    return kept ? { ...rec, layout: kept.layout, ui: { ...(rec.ui as object), recent: kept.recent } } : rec
  }
  const writeWorkspaceNow = async () => {
    wsTimer.current = undefined
    const rec = recordOf(ref.current)
    const text = JSON.stringify(rec)
    if (text !== wsWritten.current && (await backup.writeWorkspace(rec))) wsWritten.current = text
  }

  // ---- Autosave (asked for): the user's own Drive file saves AUTOSAVE_DELAY after its last edit ----

  const saveTimers = useRef(new Map<DocId, ReturnType<typeof setTimeout>>())
  const arm = (id: DocId, delay = AUTOSAVE_DELAY) => {
    if (!ownDrive(cur(id), ref.current.signedIn)) return
    clearTimeout(saveTimers.current.get(id))
    saveTimers.current.set(
      id,
      setTimeout(() => {
        saveTimers.current.delete(id)
        void saveDrive(id)
      }, delay),
    )
  }
  // Everything waiting for a closed document goes.
  const forgetTimers = (id: DocId) => {
    for (const map of [timers, follows, saveTimers]) {
      clearTimeout(map.current.get(id))
      map.current.delete(id)
    }
    for (const map of [written, seen, apis, named]) map.current.delete(id)
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
      const signedIn = google.signedIn()
      let next = read ? W.restore(read, newId(), newId, signedIn) : W.emptyWorkspace(newId(), signedIn)
      for (const rec of read?.docs ?? []) {
        // A record the reading could not write (moving the old backup in) is not stored yet: the first backup write
        // after the start writes it, and warns if that fails too.
        if (next.docs[rec.id] && !read?.unstored.includes(rec.id)) written.current.set(rec.id, rec)
      }
      if (deps.current.pane) {
        stored.current = { layout: read?.workspace?.layout ?? null, recent: (read?.workspace?.ui as { recent?: unknown } | null)?.recent ?? [] }
        const at = parseAddress(window.location.hash)
        next = W.paneLayout(next, at.route, at.file, { groupId: newId(), tabId: newId() })
      }
      const settled = W.settleViewOnly(next, newId)
      next = settled.workspace
      ref.current = next
      setWs(next)
      setReady(true)
      tellKept(settled.kept)
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
        const what = !one ? ` with ${plural(docs.length, 'file')}` : one.drive ? `: "${one.drive.name}" ${driveFrom(one.drive)}` : ' with your courses'
        say('info', `Picked up where you left off${what}.`)
      }
      // Still signed in after a reload: whose each Drive file is, as Google says now.
      for (const d of docs) if (d.drive) checkOwner(d.id, d.drive.id)
    })()
  }, [])

  // Each changed document's record, 300ms after its last edit (only that document). An edit to the user's own Drive
  // file, or changes found on start, also wait to be saved (a library taken from Drive or another tab has none).
  useEffect(() => {
    if (!ready) return
    for (const id of ws.order) {
      const d = ws.docs[id]
      const prev = seen.current.get(id)
      if (prev === d) continue
      seen.current.set(id, d)
      const from = named.current.get(id)
      if (!from) named.current.set(id, d.library)
      else if (from !== d.library) {
        clearTimeout(follows.current.get(id))
        follows.current.set(id, setTimeout(() => followNow(id), FOLLOW_DELAY))
      }
      if (W.hasChanges(d) && prev?.library !== d.library) arm(id)
      const rec = written.current.get(id)
      if (rec && sameRecord(rec, d)) continue
      clearTimeout(timers.current.get(id))
      timers.current.set(id, setTimeout(() => void writeNow(id), BACKUP_DELAY))
    }
  }, [ready, ws.docs, ws.order])

  // The workspace's record (open and closed documents, layout, Explorer, names) when one of them changes.
  useEffect(() => {
    if (!ready || JSON.stringify(recordOf(ws)) === wsWritten.current) return
    clearTimeout(wsTimer.current)
    wsTimer.current = setTimeout(() => void writeWorkspaceNow(), BACKUP_DELAY)
  }, [ready, ws.order, ws.closed, ws.layout, ws.explorer, ws.docs])

  // Leaving the page (or hiding it, which may be the last chance on phones): what waits is written now.
  useEffect(() => {
    const flushBackup = () => {
      for (const [id, timer] of [...timers.current]) {
        clearTimeout(timer)
        void writeNow(id)
      }
      if (wsTimer.current !== undefined) {
        clearTimeout(wsTimer.current)
        void writeWorkspaceNow()
      }
    }
    const onHidden = () => document.visibilityState === 'hidden' && flushBackup()
    window.addEventListener('pagehide', flushBackup)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flushBackup)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [])

  // Another tab of the site wrote a document open here too: this tab takes it up (dropping its history), so the next
  // edit here builds on it instead of writing over it. Unless this tab has changes of its own: waiting to be written,
  // waiting to be saved, being saved or paused. Those are never dropped: its own record goes out (or its save) and the
  // other tab takes it up instead. Taken up, it is what this tab has written too, so it never goes back as an echo.
  // Deleted there (Delete from this browser), it stays open here and is written again; a Drive file deleted by a
  // sign-out closes here too. Each tab keeps its own open files and layout; the sign-in is shared.
  useEffect(() => {
    if (!ready) return
    return backup.onWorkspaceWritten((msg) => {
      const id = msg.doc
      if (!id || !cur(id) || timers.current.has(id)) return
      backup.readDoc(id).then(
        (rec) => {
          const d = cur(id)
          if (!d || timers.current.has(id)) return
          if (!rec) {
            if (d.drive && !google.signedIn()) return
            written.current.delete(id)
            void writeNow(id)
            return
          }
          if (saveTimers.current.has(id) || running.current.has(id) || W.hasChanges(d) || d.problem) return
          written.current.set(id, rec)
          update((w) => W.takeRecord(w, rec))
        },
        () => undefined, // unreadable: this tab keeps what it has
      )
    })
  }, [ready])

  // A Drive save still waiting, under way or paused: leaving would lose it (browser libraries are in the backup).
  const unsaved = W.unsavedDrive(ws).length > 0 || busy.size > 0
  useEffect(() => {
    if (!unsaved) return
    // Browsers show their own text in this prompt and ignore ours. The timer only runs if the page is still
    // open, so the reminder comes as a toast once the user chooses to stay (or behind the prompt in some browsers).
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      setTimeout(() => say('warning', "Some changes aren't saved to Google Drive yet."))
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  // ---- Google Drive, per document (one sign-in for every tab) ----

  // A closed sign-in popup is nothing to report. Google refusing the sign-in (a 401) is no sign-out (asked for): saves
  // pause until the user signs in again.
  const report = (err: unknown, lead = '') => {
    if (!(err instanceof google.SignInClosed)) say('error', `${lead}${err instanceof Error ? err.message : ''}`.trim())
  }
  // What Google last said about a document's Drive file (renamed in Drive, it keeps its id); only what changed. The
  // user's own file found not to be theirs turns view only.
  const learn = (id: DocId, driveId: string, patch: Partial<DriveSource>) =>
    settle((w) =>
      W.patchDoc(w, id, (d) =>
        d.drive?.id === driveId && (Object.keys(patch) as (keyof DriveSource)[]).some((k) => d.drive![k] !== patch[k])
          ? { drive: { ...d.drive, ...patch } }
          : null,
      ),
    )
  // Google's answer about the file, as kept with it: whether it is the user's own, its name now and whether it is in the bin.
  const learned = (now: Owner): Partial<DriveSource> => ({
    mine: now.canEdit,
    ...(now.name && { name: now.name }),
    ...(now.trashed !== undefined && { trashed: now.trashed }),
  })
  // Whose the file is, asked quietly: only with a token that needs no popup.
  const checkOwner = (id: DocId, driveId: string) => {
    if (ref.current.signedIn && google.hasFreshToken()) void google.ownFile(driveId).then((now) => learn(id, driveId, learned(now)), () => undefined)
  }
  const pause = (id: DocId, problem: SaveProblem): false => {
    update((w) => W.patchDoc(w, id, (d) => (d.problem === problem ? null : { problem })))
    return false
  }
  // Saved to Drive (`saving`: the library as it was when the save started, so an edit made meanwhile still waits, and
  // is saved next). Its file is open now, so it is no longer listed as closed.
  const driveSaved = (id: DocId, saving: Library, to: DriveSource) => {
    update((w) => W.markSaved(W.forgetClosedDrive(w, to.id), id, saving, { drive: to, problem: null }))
    const d = cur(id)
    if (d && W.hasChanges(d)) arm(id)
  }
  // Why a save failed, as a pause: the sign-in (a 401 too), offline, or anything else (tried again after RETRY_DELAY;
  // said as a toast when the user asked for the save).
  const failed = (id: DocId, err: unknown, click: boolean): false => {
    if (err instanceof google.SignInClosed || (err instanceof google.DriveError && err.status === 401)) return pause(id, 'signIn')
    if (!navigator.onLine) return pause(id, 'offline')
    pause(id, 'error')
    arm(id, RETRY_DELAY)
    if (click) report(err, 'Not saved. ')
    return false
  }

  // One sign-in popup at a time: saves asked for together (Save now on several files) share it.
  const renewing = useRef<Promise<string>>(undefined)
  const renew = () => (renewing.current ??= google.signIn().finally(() => (renewing.current = undefined)))

  // One save at a time per document: a second call while one runs waits for that one (it would upload twice, and the
  // second would take the first for a change made elsewhere).
  const running = useRef(new Map<DocId, Promise<boolean>>())
  const once = (id: DocId, action: () => Promise<boolean>): Promise<boolean> => {
    const now = running.current.get(id)
    if (now) return now
    const done = action().finally(() => running.current.delete(id))
    running.current.set(id, done)
    return done
  }

  // Changed on Google Drive since it was last saved here: asks (Keep mine, Take the Drive version); Cancel leaves it
  // paused, and its Resolve (Save now) asks again.
  const resolveConflict = async (id: DocId, name: string, click: boolean): Promise<boolean> => {
    pause(id, 'conflict')
    const choice = await deps.current.askChoice<'mine' | 'theirs'>(
      `"${name}" changed on Google Drive since it was last saved here, maybe on another device. Keep your version here (it replaces the one on Google Drive), or take the Google Drive version (it replaces your changes here)?`,
      [
        { label: 'Take the Drive version', value: 'theirs' },
        { label: 'Keep mine', value: 'mine', primary: true },
      ],
      { title: 'Changed on Google Drive' },
    )
    const d = cur(id)
    if (choice === null || !d?.drive) return false
    const drive = d.drive
    markBusy(id, true)
    try {
      if (choice === 'mine') {
        const library = d.library
        const md5 = await google.updateDriveFile(drive.id, library)
        driveSaved(id, library, { ...drive, md5, name })
      } else {
        const { library, source } = await google.readDriveFile(drive.id, true)
        const meta = { md5: source.md5, name: source.name, trashed: source.trashed }
        update((w) => W.replaceDoc(w, id, keepIds(w.docs[id]?.library ?? library, library), { drive: { ...drive, ...meta }, problem: null }))
      }
      return true
    } catch (err) {
      return failed(id, err, click)
    } finally {
      markBusy(id, false)
    }
  }

  // The one save of the user's own Drive file: quiet (autosave), or in a click (`click`: Save now, Save and close),
  // which may renew the sign-in in a popup and asks about a conflict again. Resolves true when it saved.
  const saveDrive = (id: DocId, click = false): Promise<boolean> =>
    once(id, async () => {
      clearTimeout(saveTimers.current.get(id))
      saveTimers.current.delete(id)
      const d = cur(id)
      if (!ownDrive(d, ref.current.signedIn)) return false
      if (!W.hasChanges(d) && !d.problem) return true
      if (d.problem === 'conflict' && !click) return false
      if (!navigator.onLine) return pause(id, 'offline')
      // A popup needs a click: a quiet save waits for one once the sign-in ran out (about an hour).
      if (!click && !google.hasFreshToken()) return pause(id, 'signIn')
      const drive = d.drive
      markBusy(id, true)
      try {
        if (!google.hasFreshToken()) {
          await renew()
          signedInAgain()
        }
        const now = await google.ownFile(drive.id)
        // Google can't find it for this account (deleted for good): a new file instead.
        if (!now.canEdit) {
          const library = cur(id)?.library
          if (!library) return false
          const made = await google.createDriveFile(library, W.bareName(drive.name))
          driveSaved(id, library, made)
          say('warning', `"${drive.name}" is no longer in your Google Drive (deleted there, or another account is signed in), so this library was saved as a new file, "${made.name}".`)
          return true
        }
        const name = now.name ?? drive.name
        if (now.md5 !== drive.md5) {
          markBusy(id, false)
          return await resolveConflict(id, name, click)
        }
        const library = cur(id)?.library
        if (!library) return false
        const md5 = await google.updateDriveFile(drive.id, library)
        driveSaved(id, library, { ...drive, md5, name, trashed: now.trashed ?? drive.trashed })
        return true
      } catch (err) {
        return failed(id, err, click)
      } finally {
        markBusy(id, false)
      }
    })

  // Saves what waits now, quietly unless `click`. Resolves true when nothing is left to save.
  const flush = async (id: DocId, click = false): Promise<boolean> => {
    clearTimeout(saveTimers.current.get(id))
    saveTimers.current.delete(id)
    await running.current.get(id)
    const d = cur(id)
    if (!ownDrive(d, ref.current.signedIn) || (!W.hasChanges(d) && !d.problem)) return true
    return saveDrive(id, click)
  }

  // A new file in the user's Drive (Upload, Keep both, a copy), signing in on the way. `quiet`: no toast when it
  // worked (a library made on the way).
  const saveNew = async (id: DocId, name: string, o: { quiet?: boolean } = {}) => {
    const d = cur(id)
    if (!d) return false
    try {
      const library = d.library
      const made = await google.createDriveFile(library, name)
      signedInNow()
      driveSaved(id, library, made)
      if (!o.quiet) say('info', `Saved "${made.name}" to your Google Drive.`)
      return true
    } catch (err) {
      report(err, 'Not saved. ')
      return false
    }
  }
  // Replace it: the library goes into one of the user's Drive libraries, which becomes its file.
  const saveOver = async (id: DocId, file: DriveFile) => {
    const d = cur(id)
    if (!d) return false
    try {
      const library = d.library
      const md5 = await google.updateDriveFile(file.id, library)
      signedInNow()
      driveSaved(id, library, { id: file.id, name: file.name, md5, shared: false, mine: true, trashed: false })
      say('info', `Saved "${file.name}" to your Google Drive, in place of the one there.`)
      return true
    } catch (err) {
      report(err, 'Not saved. ')
      return false
    }
  }
  // Upload to Google Drive in one click (a toast's action): under its name, signing in on the way; when the user's
  // Drive already has a library of that name that isn't open here, asks Replace it or Keep both, as Drive does.
  const upload = async (id: DocId) => {
    const d = cur(id)
    if (!d || d.drive) return false
    const name = W.docName(d)
    const files = await list()
    if (files === null) return false
    signedInNow()
    const open = new Set(ref.current.order.flatMap((x) => (ref.current.docs[x].drive ? [ref.current.docs[x].drive!.id] : [])))
    const same = files.find((f) => !open.has(f.id) && W.bareName(f.name).toLowerCase() === W.bareName(name).toLowerCase())
    if (!same) return once(id, () => saveNew(id, name))
    const choice = await deps.current.askChoice<'replace' | 'both'>(
      `Your Google Drive already has a library named "${same.name}". Replace it with this one, or keep both?`,
      [
        { label: 'Keep both', value: 'both' },
        { label: 'Replace it', value: 'replace', primary: true },
      ],
      { title: 'Upload to Google Drive' },
    )
    if (choice === null) return false
    return once(id, () => (choice === 'replace' ? saveOver(id, same) : saveNew(id, name)))
  }

  // ---- Sync (asked for): a Drive file with nothing to save takes a newer version from Drive, its ids kept ----

  const syncing = useRef(new Set<DocId>())
  const syncDoc = async (id: DocId) => {
    const d = cur(id)
    // Changes here or in another tab (`dirtyElsewhere`) are never replaced: their save checks Drive itself.
    if (!google.driveSetUp || !d?.drive || W.hasChanges(d) || d.dirtyElsewhere || d.problem || running.current.has(id) || syncing.current.has(id)) return
    const drive = d.drive
    const own = ownDrive(d, ref.current.signedIn)
    // The user's own file is asked about signed in, without a popup; any other through its link (no sign-in).
    if (own && !google.hasFreshToken()) return
    syncing.current.add(id)
    try {
      let now: { md5: string; name: string; trashed: boolean } | 'gone'
      if (own) {
        const mine = await google.ownFile(drive.id)
        if (!mine.canEdit || typeof mine.md5 !== 'string') return
        now = { md5: mine.md5, name: mine.name ?? drive.name, trashed: mine.trashed ?? drive.trashed }
      } else {
        now = await google.driveNow(drive.id)
      }
      if (now === 'gone') {
        if (drive.shared) {
          say('info', `"${drive.name}" is no longer shared on Google Drive, so it gets no more changes. Its courses here stay as they are.`)
          learn(id, drive.id, { shared: false })
        }
        return
      }
      // Renamed, or moved to the bin or back, in Drive.
      if (now.name !== drive.name || now.trashed !== drive.trashed) learn(id, drive.id, { name: now.name, trashed: now.trashed })
      if (now.trashed && !drive.trashed) say('warning', binNote({ ...drive, name: now.name }, own))
      if (now.md5 === drive.md5) return
      const { library, source } = await google.readDriveFile(drive.id, own)
      const x = cur(id)
      // Edited, saved, taken from another tab or closed meanwhile: the save's own check takes it from there.
      if (!x?.drive || x.library !== d.library || x.drive.id !== drive.id || W.hasChanges(x) || x.dirtyElsewhere || running.current.has(id)) return
      const meta = { md5: source.md5, name: source.name, trashed: source.trashed }
      update((w) => W.replaceDoc(w, id, keepIds(x.library, library), { drive: { ...x.drive!, ...meta } }))
    } catch {
      // Offline or busy: the next look tries again.
    } finally {
      syncing.current.delete(id)
    }
  }
  const syncAll = () => {
    for (const id of ref.current.order) void syncDoc(id)
  }
  // On start, when the window comes back (focus, visible again), and every SYNC_EVERY while it is visible.
  useEffect(() => {
    if (!ready) return
    syncAll()
    const onVisible = () => document.visibilityState === 'visible' && syncAll()
    window.addEventListener('focus', syncAll)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => document.visibilityState === 'visible' && syncAll(), SYNC_EVERY)
    return () => {
      window.removeEventListener('focus', syncAll)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [ready])

  // Back online: saves paused or waiting go out, and newer versions come in.
  useEffect(() => {
    const on = () => {
      setOnline(true)
      for (const id of ref.current.order) {
        const d = cur(id)
        if (d && (d.problem === 'offline' || (W.hasChanges(d) && !saveTimers.current.has(id)))) arm(id, 0)
      }
      syncAll()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Signed in (or the sign-in renewed): saves paused for a sign-in go on, and Google says whose each Drive file is.
  const signedInAgain = () => {
    for (const d of Object.values(ref.current.docs)) {
      if (d.problem === 'signIn') arm(d.id, 0)
      if (d.drive) checkOwner(d.id, d.drive.id)
    }
  }
  // Signed out (here or in another tab): every Google Drive library closes, its backup and closed entry gone.
  const forgetDrive = () => {
    const w = ref.current
    const open = w.order.filter((id) => w.docs[id].drive)
    const gone = [...open, ...w.closed.flatMap((c) => (c.drive ? [c.id] : []))]
    for (const id of open) forgetTimers(id)
    update(W.signedOut)
    for (const id of gone) void backup.deleteDoc(id).catch(() => undefined)
    peeked.current.clear()
  }
  // Another tab signed in, renewed the sign-in or signed out: this one follows (asked for: one account per browser).
  useEffect(() => {
    if (!ready) return
    return google.onSignInChange(() => {
      if (google.signedIn()) {
        setSignedNow(true)
        signedInAgain()
      } else if (ref.current.signedIn) {
        // Changes here that weren't on Drive yet are never lost: they stay, as libraries of their own in this browser.
        settle((w) => W.setSignedIn(w, false), true)
        forgetDrive()
        say('info', SIGNED_OUT)
      }
    })
  }, [ready])

  const canSave = async (id: DocId) => {
    const drive = cur(id)?.drive
    if (!drive) return false
    try {
      const now = await google.ownFile(drive.id)
      learn(id, drive.id, learned(now))
      return now.canEdit
    } catch (err) {
      report(err)
      return null
    }
  }
  const setShared = async (id: DocId, on: boolean) => {
    const drive = cur(id)?.drive
    if (!drive) return false
    try {
      await (on ? google.shareDriveFile(drive.id) : google.unshareDriveFile(drive.id))
      learn(id, drive.id, { shared: on })
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
      void syncDoc(open.id)
      return true
    }
    try {
      const { library, source } = await google.readDriveFile(driveId, own)
      // Closed here before: it opens again under its own id, its entry gone.
      const id = ref.current.closed.find((c) => c.drive?.id === driveId)?.id ?? newId()
      const tab = newId()
      update((w) => W.reopenClosed(w, W.makeDoc(id, library, source.name, { drive: source }), HOME, tab))
      if (own) signedInNow()
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

  // Signing out (asked for) forgets the account: what waits is saved first, then every Drive library closes.
  const signOut = async () => {
    // What waits is saved first; edits made while it saved get one more round, and what is left is checked right
    // before signing out.
    let lost = W.unsavedDrive(ref.current)
    for (let round = 0; lost.length > 0 && round < 2; round++) {
      for (const id of lost) await flush(id)
      lost = W.unsavedDrive(ref.current)
    }
    if (lost.length > 0) {
      const names = lost.flatMap((id) => (cur(id) ? [`"${W.docName(cur(id)!)}"`] : [])).join(', ')
      const choice = await deps.current.askChoice<'download' | 'out'>(
        `Sign out anyway? Changes to ${names} that aren't saved yet will be lost.`,
        [
          { label: 'Download a copy', value: 'download' },
          { label: 'Sign out anyway', value: 'out', primary: true, danger: true },
        ],
        { title: 'Sign out' },
      )
      if (choice === null) return false
      if (choice === 'download') for (const id of lost) if (!(await download(id))) return false
    }
    google.signOut()
    forgetDrive()
    say('info', SIGNED_OUT)
    return true
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
      await renew()
      // Which account, so "Signed in as" can say it: asked once its token is here.
      if (!google.signedInAs()) await google.accountEmail().catch(() => '')
      setSignedNow(true)
      signedInAgain()
      return true
    } catch (err) {
      report(err)
      return false
    }
  }
  // Libraries read to show what is inside them, by file and version. A closed link is read through the link.
  const peeked = useRef(new Map<string, Library>())
  const peek = async (driveId: string, version = '') => {
    const key = `${driveId}|${version}`
    const hit = peeked.current.get(key)
    if (hit) return hit
    const entry = ref.current.closed.find((c) => c.drive?.id === driveId)
    const own = ref.current.signedIn && (entry?.drive?.mine ?? true)
    try {
      const { library } = await google.readDriveFile(driveId, own)
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
      const files = await google.listDriveFiles()
      signedInNow()
      return files
    } catch (err) {
      report(err)
      return null
    }
  }
  const pick = async () => {
    try {
      const picked = await google.pickDriveFiles()
      signedInNow()
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
      // The libraries here stay, no longer tied to the file (browser libraries now); a closed entry of it goes.
      update((w) => W.forgetClosedDrive(w.order.reduce((x, id) => W.patchDoc(x, id, (d) => (d.drive?.id === file.id ? { drive: null, problem: null } : null)), w), file.id))
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
      savesInto: yours,
      signOut,
      account,
      prepare: () => void google.prepareSignIn().catch(() => undefined),
      signIn,
      canSave: async () => (id ? canSave(id) : false),
      open: openDrive,
      refresh: async () => {
        if (!id || !d?.drive) return
        checkOwner(id, d.drive.id)
        await syncDoc(id)
      },
      saveNew: async (name) => (id ? once(id, () => saveNew(id, name)) : false),
      saveOver: async (file) => (id ? once(id, () => saveOver(id, file)) : false),
      share: async () => (id ? setShared(id, true) : false),
      unshare: async () => (id ? setShared(id, false) : false),
      list,
      remove,
      pick,
      peek,
    }
  }

  // ---- Files: open, download, copy, close, closed files ----

  const download = async (id: DocId) => {
    const d = cur(id)
    if (!d) return false
    try {
      // Named after its Drive file, else its own name.
      return (await adapter.download(d.library, W.docName(d))) !== null
    } catch (err) {
      say('error', `Download stopped.${errorText(err)}`)
      return false
    }
  }

  const closeDoc = async (id: DocId) => {
    const start = cur(id)
    if (!start) return false
    if (ownDrive(start, ref.current.signedIn)) {
      await flush(id)
      // Asked again when changes came in while it saved (typed in another pane meanwhile): those are not saved yet.
      const ask = () =>
        deps.current.askChoice<'save' | 'discard'>(
          `Changes to "${W.docName(cur(id) ?? start)}" aren't saved to Google Drive yet. If you close it anyway, they are lost.`,
          [
            { label: 'Close anyway', value: 'discard', danger: true },
            { label: 'Save and close', value: 'save', primary: true },
          ],
          { title: 'Close file' },
        )
      const dirty = () => {
        const d = cur(id)
        return d ? W.hasChanges(d) || !!d.problem : null
      }
      if (!(await W.readyToClose(dirty, ask, () => flush(id, true)))) return false
    }
    const d = cur(id)
    if (!d) return false
    // A browser library stays in this browser, closed: what waits is written now. A Drive file's record goes: it opens
    // again from Drive.
    if (!d.drive && timers.current.has(id)) {
      clearTimeout(timers.current.get(id))
      await writeNow(id)
    }
    const yours = ownDrive(d, ref.current.signedIn)
    forgetTimers(id)
    update((w) => W.closeDoc(w, id))
    // Its record is kept while another tab has changes in it that are not on Drive yet (reopening finds them).
    if (d.drive && !d.dirtyElsewhere) void backup.deleteDoc(id).catch(() => undefined)
    say('info', closedNote({ name: W.docName(d), drive: d.drive }, yours), undefined, { label: 'Reopen', run: () => void reopenClosed(id) })
    return true
  }

  const reopenClosed = async (id: DocId): Promise<DocId | null> => {
    if (cur(id)) {
      const tab = newId()
      update((w) => W.activateDoc(w, id, tab))
      return id
    }
    const entry = ref.current.closed.find((c) => c.id === id)
    if (!entry) return null
    let doc: W.Doc
    // A Drive file kept with changes not on Drive yet (another tab's, when it was closed here) opens with them, to save.
    const kept = entry.drive ? await backup.readDoc(id).catch(() => null) : null
    if (entry.drive && kept?.dirty && kept.drive) {
      doc = W.makeDoc(id, kept.library, entry.name, { drive: kept.drive, saved: null })
    } else if (entry.drive) {
      const own = ref.current.signedIn && entry.drive.mine
      try {
        const { library, source } = await google.readDriveFile(entry.drive.id, own)
        doc = W.makeDoc(id, library, entry.name, { drive: { ...source, shared: own ? entry.drive.shared : true, mine: own ? source.mine : entry.drive.mine } })
      } catch (err) {
        report(err, `Could not open "${entry.name}". `)
        return null
      }
    } else {
      const rec = await backup.readDoc(id).catch(() => null)
      if (!rec) {
        say('error', `"${entry.name}" is no longer in this browser.`)
        update((w) => W.forgetClosed(w, id))
        return null
      }
      doc = W.makeDoc(id, rec.library, entry.name)
    }
    const tab = newId()
    settle((w) => W.reopenClosed(w, doc, HOME, tab))
    if (doc.drive) checkOwner(id, doc.drive.id)
    return id
  }

  // Its record goes too: a browser library's, or a Drive file's kept with another tab's changes.
  const forgetClosed = (id: DocId) => {
    if (!ref.current.closed.some((c) => c.id === id)) return
    update((w) => W.forgetClosed(w, id))
    void backup.deleteDoc(id).catch(() => undefined)
  }

  const readClosed = async (id: DocId): Promise<Library | null> => {
    const entry = ref.current.closed.find((c) => c.id === id)
    if (!entry) return null
    if (entry.drive) return peek(entry.drive.id)
    try {
      return (await backup.readDoc(id))?.library ?? null
    } catch {
      return null
    }
  }

  const newDoc = (at: Route = HOME, o: { inDrive?: boolean } = {}) => {
    const id = newId()
    const tab = newId()
    let name = ''
    update((w) => {
      name = W.freeDocName(w, 'New library')
      return W.addDoc(w, W.makeDoc(id, emptyLibrary(), name), at, tab)
    })
    if (o.inDrive && google.driveSetUp && ref.current.signedIn) void once(id, () => saveNew(id, name, { quiet: true }))
    return id
  }

  const renameDoc = async (id: DocId, name: string) => {
    const next = W.bareName(name.trim())
    const problem = !next ? 'A library needs a name.' : fileNameProblem(next)
    if (problem) {
      say('error', problem)
      return false
    }
    const d = cur(id)
    if (!d) return false
    if (isViewOnly(d, ref.current.signedIn)) {
      say('error', RENAME_VIEW_ONLY_TEXT)
      return false
    }
    if (W.bareName(W.docName(d)) === next) return true
    if (!d.drive && !running.current.has(id)) {
      update((w) => W.renameDoc(w, id, next))
      return true
    }
    return once(id, async () => {
      const drive = cur(id)?.drive
      if (!drive) {
        update((w) => W.renameDoc(w, id, next))
        return true
      }
      try {
        const named = await google.renameDriveFile(drive.id, next)
        signedInNow()
        learn(id, drive.id, { name: named })
        return true
      } catch (err) {
        report(err, 'Not renamed. ')
        return false
      }
    })
  }

  const makeCopy = async (id: DocId): Promise<DocId | null> => {
    const shown = cur(id)
    if (!shown) return null
    // Signed in, a Drive file shown as view only may be the user's own after all (opened from its link before Google
    // could say): asked first, in this click (renewing the sign-in), and then it simply becomes editable.
    if (shown.drive && !shown.drive.mine && google.driveSetUp && ref.current.signedIn) {
      const driveId = shown.drive.id
      try {
        if (!google.hasFreshToken()) await renew()
        const now = await google.ownFile(driveId)
        learn(id, driveId, learned(now))
        if (now.canEdit) {
          say('info', `"${W.docName(cur(id) ?? shown)}" is your own file, so you can change it here.`)
          return id
        }
      } catch (err) {
        report(err)
        return null
      }
    }
    const d = cur(id)
    if (!d) return null
    const copy = newId()
    const tab = newId()
    let name = ''
    update((w) => {
      name = W.freeDocName(w, `Copy of ${W.bareName(W.docName(d))}`)
      return W.openCopy(w, id, W.makeDoc(copy, d.library, name), tab)
    })
    if (google.driveSetUp && ref.current.signedIn) await once(copy, () => saveNew(copy, name, { quiet: true }))
    return copy
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

  // A .shrimp file opens in this browser (asked for): a copy, never tied to the file. Saving it to Drive is a click away.
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
      const id = newId()
      const tab = newId()
      let name = ''
      update((w) => {
        name = copyName(W.bareName(o.name), W.docNames(w))
        return W.addDoc(w, W.makeDoc(id, o.library, name), at, tab)
      })
      say('info', `Opened "${name}" in this browser.`, undefined, google.driveSetUp ? { label: 'Upload to Google Drive', run: () => void upload(id) } : undefined)
      last = id
    }
    return last
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
  type Entry = { label: string; before: W.Snap }
  const undo = () => {
    let entry: Entry | undefined
    update((w) => {
      const step = W.undoEdit(w)
      entry = step?.entry
      return step?.workspace ?? w
    })
    if (entry) tell('Undid', entry)
  }
  const redo = () => {
    let entry: Entry | undefined
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
      let entry: Entry | undefined
      update((w) => {
        const done = W.undoStep(w, step)
        entry = done?.entry
        return done?.workspace ?? w
      })
      if (entry) tell('Undid', entry)
      else say('info', `Other changes came after this. ${comboLabel('Mod+Z', isMac(navigator.platform))} steps back through them.`)
    }
  }

  // ---- One document's API, the same object while nothing it shows changes ----

  const statusOf = (d: W.Doc) => saveStatus(d, { signedIn: ws.signedIn, busy: busy.has(d.id), online })
  const apis = useRef(new Map<DocId, { doc: W.Doc; signed: boolean; ready: boolean; status: SaveStatus; api: LibraryApi }>())
  const makeApi = (d: W.Doc, status: SaveStatus): LibraryApi => {
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
      where: W.where(d),
      status,
      readOnly: status === 'viewOnly',
      hasChanges: needsAttention(status),
      downloadLabel: adapter.downloadLabel,
      downloadHint: adapter.downloadHint,
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
        tryUpdate((w) => {
          const changed = W.applyEdit(w, 'Replace library', (docs) => (docs[id] ? { ...docs, [id]: next } : docs), at)
          // Its pages may be gone with it, on purpose (App moves on quietly).
          return changed === w ? w : W.patchDoc(changed, id, (x) => ({ replaced: x.replaced + 1 }))
        })
      },
      saveNow: async () => (ownDrive(cur(id), ref.current.signedIn) ? flush(id, true) : false),
      makeCopy: () => makeCopy(id),
      download: async () => void (await download(id)),
      close: () => closeDoc(id),
      drive: driveFor(d, ws.signedIn),
    }
  }
  // Each file's part in the address, when there are several.
  const keys = ws.order.length > 1 ? fileKeys(ws.order.map((id) => ({ id, name: W.docName(ws.docs[id]) }))) : {}
  const doc = (id: DocId): LibraryApi => {
    const d = cur(id)
    // A document closed meanwhile: an empty one whose actions find nothing to change.
    if (!d) return makeApi(W.makeDoc(id, emptyLibrary(), ''), 'browser')
    const status = statusOf(d)
    const hit = apis.current.get(id)
    if (hit && hit.doc === d && hit.signed === ws.signedIn && hit.ready === ready && hit.status === status) return hit.api
    const api = makeApi(d, status)
    apis.current.set(id, { doc: d, signed: ws.signedIn, ready, status, api })
    return api
  }

  return {
    ready,
    docs: ws.order.map((id) => {
      const d = ws.docs[id]
      const status = statusOf(d)
      return { id, name: W.docName(d), where: W.where(d), readOnly: status === 'viewOnly', dirty: needsAttention(status) }
    }),
    active: W.activeDoc(ws),
    doc,
    layout: ws.layout,
    address: W.shownTab(ws),
    addressIn: (win) => W.shownTab(ws, win),
    fileKey: (id) => keys[id] ?? null,
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
    popOutTab: (tabId, win) => {
      const group = newId()
      const spare = newId()
      update((w) => W.popOutTab(w, tabId, win, group, spare))
    },
    dock: (win) => update((w) => W.dockWindow(w, win)),
    showExplorer: (beside, split) => {
      const made = ids()
      update((w) => W.showExplorer(w, beside, { split, tabId: made.tab, groupId: made.group }))
      return W.explorerTab(ref.current)?.id ?? null
    },
    duplicateTab: (tabId) => {
      const tab = newId()
      update((w) => W.duplicateTab(w, tabId, tab))
    },
    showAppPage: (kind, group, background) => {
      const tab = newId()
      update((w) => W.showAppPage(w, kind, group ?? w.layout.activeGroup, tab, background))
    },
    followHistory: (tabId, route, file) => {
      const before = ref.current
      // The file the address names, by its part (`fileKey`).
      const all = fileKeys(before.order.map((x) => ({ id: x, name: W.docName(before.docs[x]) })))
      const named = file ? before.order.find((id) => all[id] === file) : undefined
      const newTab = newId()
      update((w) => W.followHistory(w, tabId, route, { doc: named ?? null, newTab }))
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
    renameDoc,
    closeDoc,
    closed: ws.closed,
    reopenClosed,
    forgetClosed,
    readClosed,
    explorer: ws.explorer,
    setExplorer: (explorer) => update((w) => ({ ...w, explorer })),
    explorerView: (tabId) => W.explorerView(ws, tabId),
    setExplorerView: (tabId, view) => update((w) => W.setExplorerView(w, tabId, view)),
    drive: driveFor(null, ws.signedIn),
    openLabel: adapter.openLabel,
    openHint: adapter.openHint,
  }
}
