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
import { countLine } from '../logic/fileTree'
import { refusalHelp } from '../logic/explorerActions'
import { quoteName as q } from '../logic/toastText'
import * as backup from '../storage/browserBackup'
import * as google from '../storage/googleDrive'
import type { DriveFile, DriveSource } from '../storage/googleDrive'
import { sameLibrary } from '../storage/format'
import type { FileRef, Opened, SaveResult, StorageAdapter } from '../storage/StorageAdapter'
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
  /** True while this tab is signed in with Google: its own account, kept on reload until Sign out. */
  signedIn(): boolean
  /** The account this tab is signed in as, once known. */
  signedAs(): string | null
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
   * Signs out in this tab only (other tabs keep their account). Saves still waiting go first; when one can't be
   * saved it asks first (Download a copy, or Sign out anyway). Then the account's own Drive libraries close in this tab (shared files stay, view only);
   * browser libraries stay. Resolves false when it did not sign out.
   */
  signOut(): Promise<boolean>
  /**
   * Signs in with another Google account in this tab only, which new tabs then start with. Saves still waiting go
   * first, as for signOut. Then the account's own Drive libraries close in this tab. Resolves false when nothing changed.
   */
  switchAccount(): Promise<boolean>
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
  /** The address of the "Shrimply Study" folder in the user's Google Drive; null before anything was saved there, or on a failure (no toast). */
  folderLink(): Promise<string | null>
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
  /** Where it lives: a Google Drive file, a .shrimp file on this device, or only this browser (a browser library). */
  where: 'drive' | 'device' | 'browser'
  /** The name of the .shrimp file on this device it is tied to (browsers never give the folder); null for any other. */
  fileName: string | null
  /** When that file last changed, as last seen here (opened, saved, or taken after a change outside); null for any other. */
  fileChanged: number | null
  /**
   * Looks at that file now, quietly (the browser is asked nothing): `ok` still there (a newer version is taken when
   * nothing waits here), `missing` moved or deleted (the library pauses), `permission` the browser needs a click first,
   * `skipped` paused or busy, so not looked at.
   */
  checkFile(): Promise<'ok' | 'missing' | 'permission' | 'error' | 'skipped'>
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
   * Save now (Ctrl+S; the save slot's button: a file on this device's Save, or a paused Drive save's fix): the user's
   * own Drive file, or the file on this device (the only way it saves, asked for), saves at once, in the click, so a
   * sign-in that ran out is renewed, the first Save of a file on this device asks the browser to allow writing,
   * and a conflict is asked about again. Resolves true when nothing is left to save; false for a browser library (the
   * caller opens Upload to Google Drive) and a view-only one.
   */
  saveNow(): Promise<boolean>
  /**
   * Locate file (asked for): a file on this device that was moved or deleted is picked again. When it holds what was
   * last saved, or the user agrees to replace what it holds, the library is tied to it again and saves into it.
   * Resolves true when it is tied again.
   */
  locate(): Promise<boolean>
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
   * A browser library's ways off this browser (asked for, as it can be lost): `upload` to Google Drive in one click
   * (signing in on the way, asking Replace it or Keep both), and, where `canSaveToFile` (Chrome, Edge), `saveToFile`:
   * a new .shrimp file picked in the save dialog, which the library is tied to and saves into from then on.
   */
  upload(): Promise<boolean>
  canSaveToFile: boolean
  saveToFile(): Promise<boolean>
  /**
   * Closes it (it stays in the Explorer, closed): a Drive file saves what waits first, and asks (Close anyway, Save
   * and close) when that fails. Then a toast says where it is, with Reopen. Resolves true when closed.
   */
  close(): Promise<boolean>
  drive: DriveApi
}

/** One open library as the sidebar lists it. `dirty`: it needs attention (a paused save). */
export type DocMeta = { id: DocId; name: string; where: 'drive' | 'device' | 'browser'; readOnly: boolean; dirty: boolean }

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
  /** Removes a group with its tabs (never closes a file); the main window keeps its last group. */
  closeGroup(groupId: GroupId): void
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
   * The file picker: where the browser can keep the file (Chrome, Edge) each picked .shrimp file opens tied to it and
   * saves into it by itself; a file already open just shows its library, with a toast (taking the file's version when it changed
   * outside, asking when both changed). Elsewhere it opens as a browser library named after the file ("Name (2)" when
   * taken), with a toast offering Upload to Google Drive. Resolves the last one opened, null for none.
   */
  openFile(at?: Route): Promise<DocId | null>
  /** A library a loader gives (the guide, the debug page's samples) as a new document named after `name`. */
  openLibrary(load: () => Promise<Library>, name: string, at?: Route): Promise<DocId | null>
  /** A Google Drive file as a new document (or the one it is already open in, with a toast saying so). */
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
  /** Whether Open file ties a file to its library (it then saves into the file); else it opens a copy in this browser. */
  savesInPlace: boolean
  /**
   * Reset to first visit (the debug page), once the user agreed to it: every save still waiting (to Google Drive and
   * to files on this device) goes first; when one can't be saved it asks (Download a copy, or Reset anyway). Then this
   * tab signs out, and leaving the page no longer warns. Resolves false when the user cancelled: nothing changed.
   */
  readyToReset(): Promise<boolean>
}

// The backup holds whole libraries, images included, so each waits for a pause in its edits.
const BACKUP_DELAY = 300
// Tabs follow a rename once the typing pauses: the main window's active tab writes its page to the address bar, and
// browsers limit how often that may change.
const FOLLOW_DELAY = 300
const HOME: Route = { name: 'home' }
// The ids a transition needs, made before it runs (transitions stay pure).
const ids = () => ({ tab: newId(), group: newId() })
const BAD_FILE_HELP = "Writing your own file? The guide's last quiz, Write your own file, shows every field."
const SIGNED_OUT = 'Signed out in this tab.'
const SIGNED_OUT_MORE =
  'Your Google Drive libraries closed here; nothing changes at Google. Other tabs keep their own sign-in, and browser libraries and files on this device stay open.'

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
// The toast for a library found in a bin (binNote's words, split): what it is, then under More info what to do.
export const binToast = (drive: DriveSource, yours: boolean): { text: string; detail: string } =>
  yours
    ? { text: `${q(drive.name)} is in your Google Drive's bin.`, detail: 'Google deletes it for good after 30 days. Restore it from the bin in Google Drive to keep it.' }
    : {
        text: `${q(drive.name)} is in its owner's bin.`,
        detail: 'It still opens, but may be deleted for good within 30 days and its link would stop working. Make a copy to keep it.',
      }
// Where a Drive library comes from, after its name.
const driveFrom = (drive: DriveSource, yours = false) =>
  yours ? 'from your Google Drive' : drive.shared ? 'shared on Google Drive' : 'from Google Drive'

// The record as written already says this about the document: nothing to write.
const sameFileNote = (a: backup.DocRecord['file'], b: FileRef | null) =>
  !a || !b ? !a && !b : a.name === b.name && a.size === b.size && a.modified === b.modified
const sameRecord = (rec: backup.DocRecord, d: W.Doc) =>
  rec.library === d.library && rec.dirty === W.hasChanges(d) && rec.drive === d.drive && sameFileNote(rec.file, d.file)
// The file is not known to be another account's own (`owner`): this tab's account can ask for it as its own.
const sameOwner = (drive: DriveSource | null | undefined) => !drive?.owner || !google.signedInAs() || drive.owner === google.signedInAs()
// A Drive file Google said is the user's own, marked with the account it is the own file of.
const ownedBy = (drive: DriveSource): DriveSource => (drive.mine ? { ...drive, owner: google.signedInAs() } : drive)
// The user's own Drive file, which saves itself; anything else never saves.
const ownDrive = (d: W.Doc | undefined, w: W.Workspace): d is W.Doc & { drive: DriveSource } => !!d?.drive && !isViewOnly(d, w.signedIn, w.account)
// A library tied to a file on this device, which saves itself too.
const onDevice = (d: W.Doc | undefined): d is W.Doc & { file: FileRef & { handle: FileSystemFileHandle } } => !!d?.file?.handle
const autosaves = (d: W.Doc | undefined, w: W.Workspace) => ownDrive(d, w) || onDevice(d)
const askFileChanged = (askChoice: AskChoice, name: string, fileName: string) =>
  askChoice<'mine' | 'theirs'>(
    `"${name}" changed on this device since it was last saved here (${fileName}). Keep your version here (it replaces the file), or take the file's version (it replaces your changes here)?`,
    [
      { label: "Take the file's version", value: 'theirs' },
      { label: 'Keep mine', value: 'mine', primary: true },
    ],
    { title: 'Changed on this device' },
  )

/**
 * The workspace: every open document, the closed ones, the layout (tabs, groups, splits, windows), the undo history
 * and the clipboard, as one state with one write path for content (`apply`). The user's own Drive files and the
 * files on this device save themselves (autosave), and every such file with nothing to save takes newer versions
 * from Drive or from disk (sync). `pane`:
 * pane mode, a popped-out window's address opened on its own: the main window shows just that page, and its layout is
 * never written to the backup (the full app's stays).
 */
export function useWorkspace(adapter: StorageAdapter, notify: Notify, ask: Ask, askChoice: AskChoice, options: { pane?: boolean } = {}): WorkspaceApi {
  const [ws, setWs] = useState<W.Workspace>(() => W.emptyWorkspace('main-group', google.signedIn(), google.signedInAs()))
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
      const reason = err instanceof Error ? err.message : String(err)
      say('warning', reason, { detail: refusalHelp(reason) })
    }
  }
  const apply = (label: string, change: (docs: Docs) => Docs, key?: string) => {
    const at = Date.now()
    tryUpdate((w) => W.applyEdit(w, label, change, at, key))
  }
  const edit = (id: DocId, label: string, fn: (lib: Library) => Library, key?: string) =>
    apply(label, (docs) => (docs[id] ? { ...docs, [id]: fn(docs[id]) } : docs), key)

  // A change that may turn a library view only (the sign-in, what Google says about a file) goes through here: its
  // changes from before move to a library of their own, and it says so (W.settleViewOnly).
  const tellKept = (kept: { from: DocId; to: DocId }[]) => {
    for (const k of kept) {
      const from = cur(k.from)
      const to = cur(k.to)
      if (!from || !to) continue
      say('info', `Your changes to ${q(W.docName(from))} are kept in ${q(to.name)}.`, {
        detail: `${q(W.docName(from))} is view only now, so what you changed was kept as a library of its own in this browser. Upload it to keep it in your Drive.`,
      })
    }
  }
  const settle = (fn: (w: W.Workspace) => W.Workspace) => {
    let kept: { from: DocId; to: DocId }[] = []
    update((w) => {
      const done = W.settleViewOnly(fn(w), newId)
      kept = done.kept
      return done.workspace
    })
    tellKept(kept)
  }
  // A stale library (W.stale) takes its Drive version as soon as it may: signed in, or known to be the user's own.
  const syncStale = (id?: DocId) => {
    for (const x of id ? [id] : ref.current.order) {
      const d = cur(x)
      if (d && W.stale(d)) void syncDoc(x)
    }
  }
  const setSignedNow = () => {
    settle((w) => W.setSignedIn(w, google.signedIn(), google.signedInAs()))
    syncStale()
  }
  // A call that may have signed in on the way.
  const signedInNow = () => {
    if (google.signedIn() !== ref.current.signedIn || google.signedInAs() !== ref.current.account) setSignedNow()
  }

  // Courses created here (by id, the course object as created): a draft only while the library still holds that very
  // object (W.dropDraft). Kept in memory only, so a reload keeps them.
  const drafts = useRef(new Map<string, Course>())

  // ---- The browser backup: each document's record and the workspace's record ----

  // The record each document has in the backup now (read on start, written here, or written by another tab).
  const written = useRef(new Map<DocId, backup.DocRecord>())
  // The file handle each document has in the backup now (null: none), so it is stored once, when it changes.
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
      say('warning', `Couldn't back up ${q(W.docName(d))} in this browser. Download a copy before you leave.`, {
        detail: 'The browser refused to store it (storage full, or blocked in a private window). Your changes are still open here.',
      })
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

  // ---- Autosave (asked for): the user's own Drive file saves AUTOSAVE_DELAY after its last edit. A file on this device
  // saves only when asked (asked for: Save, Ctrl+S, Save and close), so nothing is armed for it. ----

  const saveTimers = useRef(new Map<DocId, ReturnType<typeof setTimeout>>())
  const arm = (id: DocId, delay = AUTOSAVE_DELAY) => {
    if (!ownDrive(cur(id), ref.current)) return
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
    for (const map of [written, writtenHandle, seen, apis, named]) map.current.delete(id)
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
      let next = read ? W.restore(read, newId(), newId, signedIn, google.signedInAs()) : W.emptyWorkspace(newId(), signedIn, google.signedInAs())
      for (const d of Object.values(next.docs)) if (d.file) writtenHandle.current.set(d.id, d.file.handle)
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
        say('warning', "Couldn't read the libraries kept in this browser.", {
          detail: 'So none were opened. Your Google Drive libraries and .shrimp files are safe: open them again with Open.',
        })
        return
      }
      const broken = read.broken.length
      if (broken) {
        say('warning', broken === 1 ? "A library kept in this browser couldn't be read." : `${broken} libraries kept in this browser couldn't be read.`, {
          detail:
            broken === 1
              ? 'It was set aside. Open its .shrimp file or Google Drive library again.'
              : 'They were set aside. Open their .shrimp files or Google Drive libraries again.',
        })
      }
      // What the reading has to say (an old backup moved in, a copy set aside).
      for (const note of read.notes) {
        say('info', note, {
          detail: note === backup.OLDER_TAB_NOTE ? 'Another tab with an older version of the app changed your courses. Compare it with your other files and keep what you need.' : undefined,
        })
      }
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

  // The workspace's record (open and closed documents, layout, Explorer, names) when one of them changes.
  useEffect(() => {
    if (!ready || JSON.stringify(recordOf(ws)) === wsWritten.current) return
    clearTimeout(wsTimer.current)
    wsTimer.current = setTimeout(() => void writeWorkspaceNow(), BACKUP_DELAY)
  }, [ready, ws.order, ws.closed, ws.layout, ws.explorer, ws.docs])

  // Leaving the page (or hiding it, which may be the last chance on phones): what waits is written now, in this event
  // (each write is committed at once, see browserBackup), including an edit whose timer is not even set yet.
  useEffect(() => {
    // Not before the backup is read: the workspace as it starts (empty) would replace the one kept.
    if (!ready) return
    const flushBackup = () => {
      for (const id of ref.current.order) {
        const rec = written.current.get(id)
        if (!timers.current.has(id) && rec && sameRecord(rec, ref.current.docs[id])) continue
        clearTimeout(timers.current.get(id))
        void writeNow(id)
      }
      clearTimeout(wsTimer.current)
      void writeWorkspaceNow()
    }
    const onHidden = () => document.visibilityState === 'hidden' && flushBackup()
    window.addEventListener('pagehide', flushBackup)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flushBackup)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [ready])

  // Another tab of the site wrote a document open here too: this tab takes it up (dropping its history), so the next
  // edit here builds on it instead of writing over it. Unless this tab has changes of its own: waiting to be written,
  // waiting to be saved, being saved or paused. Those are never dropped: its own record goes out (or its save) and the
  // other tab takes it up instead. Taken up, it is what this tab has written too, so it never goes back as an echo.
  // Deleted there (Delete from this browser), it stays open here and is written again; a Drive file deleted by a
  // sign-out closes here too. Each tab keeps its own open files, layout and sign-in.
  useEffect(() => {
    if (!ready) return
    return backup.onWorkspaceWritten((msg) => {
      const id = msg.doc
      if (!id || !cur(id) || timers.current.has(id)) return
      // Its file handle as stored now too (the other tab stores it at once): taken as it is, and never written back here.
      Promise.all([backup.readDoc(id), backup.readHandle(id)]).then(
        ([rec, handle]) => {
          const d = cur(id)
          if (!d || timers.current.has(id)) return
          if (!rec) {
            if (d.drive && !google.signedIn()) return
            written.current.delete(id)
            void writeNow(id)
            return
          }
          if (saveTimers.current.has(id) || running.current.has(id) || W.hasChanges(d) || d.problem) return
          // Another account's own library, as another tab learned it: this tab keeps the file as it knows it.
          if (rec.drive?.owner && rec.drive.owner !== ref.current.account && ref.current.account) return
          written.current.set(id, rec)
          const kept = rec.file ? handle : null
          writtenHandle.current.set(id, kept)
          update((w) => W.takeRecord(w, rec, kept))
        },
        () => undefined, // unreadable: this tab keeps what it has
      )
    })
  }, [ready])

  // A save to Drive or to a file still waiting, under way or paused: leaving would lose it (browser libraries are in the backup).
  const unsaved = W.unsavedDrive(ws).length > 0 || W.unsavedDevice(ws).length > 0 || busy.size > 0
  // Reset to first visit: the user already agreed to lose what is left, so the reload asks nothing more.
  const leaving = useRef(false)
  useEffect(() => {
    if (!unsaved) return
    // Browsers show their own text in this prompt and ignore ours. The timer only runs if the page is still
    // open, so the reminder comes as a toast once the user chooses to stay (or behind the prompt in some browsers).
    const warn = (e: BeforeUnloadEvent) => {
      if (leaving.current) return
      e.preventDefault()
      e.returnValue = ''
      const device = W.unsavedDevice(ref.current)
      const waiting = [...W.unsavedDrive(ref.current), ...device].flatMap((id) => (cur(id) ? [q(W.docName(cur(id)!))] : []))
      setTimeout(() =>
        say('warning', waiting.length === 1 ? `${waiting[0]} isn't saved yet.` : `${plural(waiting.length, 'library', 'libraries')} aren't saved yet.`, {
          detail: [
            waiting.length > 1 && waiting.join(', '),
            device.length > 0
              ? `A file on this device saves when you press Save on its row or ${comboLabel('Mod+S', isMac(navigator.platform))}; its row in the sidebar says what waits.`
              : 'They save by themselves once they can; their rows in the sidebar say why not yet.',
          ],
        }),
      )
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  // A library kept only in this browser can be lost (asked for): once one is open, the browser is asked to keep this
  // site's data rather than clear it when the disk runs low (once per page).
  const keptData = useRef(false)
  useEffect(() => {
    if (keptData.current || !ws.order.some((id) => !ws.docs[id]?.drive && !ws.docs[id]?.file)) return
    keptData.current = true
    void backup.keepData()
  }, [ws])

  // ---- Google Drive, per document (one sign-in for every tab) ----

  // A closed sign-in popup is nothing to report. Google refusing the sign-in (a 401) is no sign-out (asked for): saves
  // pause until the user signs in again.
  const report = (err: unknown, lead = '', detail?: string) => {
    if (err instanceof google.SignInClosed) return
    const message = err instanceof Error ? err.message : ''
    say('error', `${lead}${message}`.trim() || 'Something went wrong.', { detail: [detail, err instanceof google.DriveError && err.help], cause: err })
  }
  // What Google last said about a document's Drive file (renamed in Drive, it keeps its id); only what changed. The
  // user's own file found not to be theirs turns view only.
  const learn = (id: DocId, driveId: string, patch: Partial<DriveSource>) => {
    settle((w) =>
      W.patchDoc(w, id, (d) =>
        d.drive?.id === driveId && (Object.keys(patch) as (keyof DriveSource)[]).some((k) => d.drive![k] !== patch[k])
          ? { drive: { ...d.drive, ...patch } }
          : null,
      ),
    )
    syncStale(id)
  }
  // Google's answer about the file, as kept with it: whether it is the user's own, its name now and whether it is in the bin.
  const learned = (now: Owner): Partial<DriveSource> => ({
    mine: now.canEdit,
    owner: now.canEdit ? google.signedInAs() : null,
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
    if (click) report(err, `${q(W.docName(cur(id)!))} not saved. `)
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
  // After what runs for the document now, never instead of it (a rename pressed while a save is under way).
  const queue = async (id: DocId, action: () => Promise<boolean>): Promise<boolean> => {
    for (let now = running.current.get(id); now; now = running.current.get(id)) await now.catch(() => false)
    return once(id, action)
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
      if (!ownDrive(d, ref.current)) return false
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
          driveSaved(id, library, { ...made, owner: google.signedInAs() })
          say('warning', `${q(drive.name)} was gone from your Drive, so it was saved as ${q(made.name)}.`, {
            detail: `It was deleted in Google Drive, or this tab is signed in with another account. Your changes are all in ${q(made.name)}.`,
          })
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

  // ---- A file on this device: saved in place when asked (Save, Ctrl+S, Save and close), through the adapter ----

  // A save or look that did not go through, as a pause: the browser needs a click to allow writing, the file was moved
  // or deleted, or anything else (never tried again by itself: Save tries again; said as a toast when the user asked
  // for the save).
  const stopped = (id: DocId, r: { status: 'denied' | 'permission' | 'missing' | 'error'; message?: string }, click: boolean): false => {
    if (r.status === 'denied' || r.status === 'permission') return pause(id, 'permission')
    if (r.status === 'missing') {
      if (click) {
        const d = cur(id)
        say('warning', `${q(W.docName(d!))} not saved: its file was moved or deleted.`, {
          detail: `The browser can't find ${d?.file?.name ?? 'the file'} where it was. Locate file (under its row) ties it again, or Download a copy. Until then changes stay only in this browser.`,
        })
      }
      return pause(id, 'missing')
    }
    pause(id, 'error')
    if (click) {
      const d = cur(id)
      say('error', `${q(W.docName(d!))} not saved to ${d?.file?.name ?? 'its file'}.`, {
        detail: `Check the disk isn't full and the file isn't open in another program, then press ${comboLabel('Mod+S', isMac(navigator.platform))}.`,
        cause: r.message,
      })
    }
    return false
  }
  // Saved into its file (`saving`: the library as it was when the save started, so an edit made meanwhile waits for
  // the next Save).
  const fileSaved = (id: DocId, saving: Library, to: FileRef) => {
    update((w) => W.markSaved(w, id, saving, { file: to, problem: null }))
  }
  // The file changed on this device since it was last saved here: asks (Keep mine, Take the file's version); Cancel
  // leaves it paused, and its button (Save now) asks again.
  const resolveFileConflict = async (id: DocId, click: boolean): Promise<boolean> => {
    pause(id, 'conflict')
    const before = cur(id)
    if (!before?.file) return false
    const choice = await askFileChanged(deps.current.askChoice, W.docName(before), before.file.name)
    const d = cur(id)
    const handle = d?.file?.handle
    if (choice === null || !d || !handle) return false
    markBusy(id, true)
    try {
      if (choice === 'mine') {
        const library = d.library
        const r = await adapter.saveInPlace(handle, library, null, { force: true, prompt: click })
        if (r.status === 'changed') return stopped(id, { status: 'error', message: 'The file changed again. Try once more.' }, click)
        if (r.status !== 'saved') return stopped(id, r, click)
        fileSaved(id, library, r.file)
        return true
      }
      const now = await adapter.look(handle)
      if (now.status !== 'ok') return stopped(id, now, click)
      update((w) => W.replaceDoc(w, id, keepIds(w.docs[id]?.library ?? now.library, now.library), { file: now.file, problem: null }))
      return true
    } finally {
      markBusy(id, false)
    }
  }
  // The one save of a file on this device: in a click (`click`: Save, Ctrl+S, Save and close), which may ask the
  // browser to allow writing and asks about a conflict again; quiet only on the way out (Reset to first visit). Resolves
  // true when it saved.
  const saveFile = (id: DocId, click = false): Promise<boolean> =>
    once(id, async () => {
      clearTimeout(saveTimers.current.get(id))
      saveTimers.current.delete(id)
      const d = cur(id)
      if (!onDevice(d)) return false
      if (!W.hasChanges(d) && !d.problem) return true
      if ((d.problem === 'conflict' || d.problem === 'missing') && !click) return false
      markBusy(id, true)
      try {
        const library = d.library
        const r: SaveResult = await adapter.saveInPlace(d.file.handle, library, d.file.modified || null, { prompt: click })
        if (r.status === 'saved') {
          fileSaved(id, library, r.file)
          return true
        }
        if (r.status === 'changed') {
          markBusy(id, false)
          return await resolveFileConflict(id, click)
        }
        return stopped(id, r, click)
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
    if (!autosaves(d, ref.current) || (!W.hasChanges(d!) && !d!.problem)) return true
    return d!.file ? saveFile(id, click) : saveDrive(id, click)
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
      driveSaved(id, library, { ...made, owner: google.signedInAs() })
      if (!o.quiet) {
        const account = google.signedInAs()
        say('info', `Saved ${q(made.name)} to your Google Drive.`, {
          detail: `In the Shrimply Study folder${account ? ` of ${account}` : ''}. It saves there by itself from now on.`,
        })
      }
      return true
    } catch (err) {
      report(err, `Couldn't upload ${q(name)}. `)
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
      driveSaved(id, library, { id: file.id, name: file.name, md5, shared: false, mine: true, trashed: false, owner: google.signedInAs() })
      say('info', `Replaced ${q(file.name)} in your Google Drive.`, {
        detail: 'The file there now holds this library and saves by itself. Google Drive keeps earlier versions for 30 days (Manage versions).',
      })
      return true
    } catch (err) {
      report(err, `Couldn't replace ${q(file.name)} in your Drive. `)
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
    const own = ownDrive(d, ref.current)
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
          say('info', `${q(drive.name)} is no longer shared with you.`, {
            detail: 'Its owner stopped sharing it or deleted it. What you see here stays but no longer syncs. Make a copy to keep it.',
          })
          learn(id, drive.id, { shared: false })
        }
        return
      }
      // Renamed, or moved to the bin or back, in Drive.
      if (now.name !== drive.name || now.trashed !== drive.trashed) learn(id, drive.id, { name: now.name, trashed: now.trashed })
      if (now.trashed && !drive.trashed) {
        const bin = binToast({ ...drive, name: now.name }, own)
        say('warning', bin.text, { detail: bin.detail })
      }
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
  // A file on this device with nothing to save looks at the file (quietly, asking the browser nothing): moved or
  // deleted pauses it; changed outside, its version is taken. With changes here, its save checks the file itself and asks.
  // Resolves what the look found (`skipped` when it did not look: paused, saving or already looking); the hover card
  // shows it.
  const syncFile = async (id: DocId): Promise<'ok' | 'missing' | 'permission' | 'error' | 'skipped'> => {
    const d = cur(id)
    if (!onDevice(d) || d.problem || running.current.has(id) || syncing.current.has(id)) return 'skipped'
    const handle = d.file.handle
    syncing.current.add(id)
    try {
      const now = await adapter.look(handle)
      if (now.status === 'missing') {
        pause(id, 'missing')
        return 'missing'
      }
      if (now.status !== 'ok') return now.status
      const x = cur(id)
      if (!x?.file || x.file.handle !== handle || x.library !== d.library || W.hasChanges(x) || x.dirtyElsewhere || running.current.has(id)) return 'ok'
      if (now.file.modified === x.file.modified && now.file.size === x.file.size) return 'ok'
      update((w) => W.replaceDoc(w, id, keepIds(x.library, now.library), { file: now.file }))
      return 'ok'
    } finally {
      syncing.current.delete(id)
    }
  }
  const syncAll = () => {
    for (const id of ref.current.order) {
      void syncDoc(id)
      void syncFile(id)
    }
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
  // Signed out or switched to another account in this tab: the account's own Drive libraries close here. Their backup records
  // stay, as other tabs may still use them; the closed entries stay too.
  const forgetDrive = () => {
    const w = ref.current
    for (const id of w.order) if (w.docs[id].drive) forgetTimers(id)
    update(W.signedOut)
    peeked.current.clear()
  }
  // Another tab renewed this account's sign-in: its fresh token is taken up, and saves paused for a sign-in go on. A
  // sign-in, switch or sign-out in another tab never reaches this one (asked for).
  useEffect(() => {
    if (!ready) return
    return google.onTokenShared(signedInAgain)
  }, [ready])

  const canSave = async (id: DocId) => {
    const drive = cur(id)?.drive
    if (!drive) return false
    try {
      const now = await google.ownFile(drive.id)
      learn(id, drive.id, learned(now))
      return now.canEdit
    } catch (err) {
      report(err, `Couldn't check ${q(W.docName(cur(id)!))} on Google Drive. `)
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
      report(err, on ? `Couldn't turn on sharing for ${q(W.docName(cur(id)!))}. ` : `Couldn't stop sharing ${q(W.docName(cur(id)!))}. `)
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
      say('info', `${q(W.docName(open))} is already open.`)
      void syncDoc(open.id)
      return true
    }
    try {
      const { library, source } = await google.readDriveFile(driveId, own)
      // Closed here before: it opens again under its own id, its entry gone.
      const id = ref.current.closed.find((c) => c.drive?.id === driveId)?.id ?? newId()
      const tab = newId()
      update((w) => W.reopenClosed(w, W.makeDoc(id, library, source.name, { drive: ownedBy(source) }), HOME, tab))
      if (own) signedInNow()
      else checkOwner(id, driveId)
      say('info', `Opened ${q(source.name)} ${driveFrom(source, own)}.`)
      // It opens (a link works until the file is deleted for good), but nobody should count on it.
      if (source.trashed) {
        const bin = binToast(source, own)
        say('warning', bin.text, { detail: bin.detail })
      }
      return true
    } catch (err) {
      report(err, "Couldn't open this Google Drive file. ")
      return false
    }
  }

  // Waiting Drive saves go first (and saves into files on this device, with `device`); edits made while they saved get
  // one more round, and what is left is checked right before leaving the account. Resolves false when the user
  // cancelled or a copy could not be downloaded.
  const flushAll = async (title: string, question: string, go: string, device = false) => {
    const waiting = () => (device ? [...W.unsavedDrive(ref.current), ...W.unsavedDevice(ref.current)] : W.unsavedDrive(ref.current))
    let lost = waiting()
    for (let round = 0; lost.length > 0 && round < 2; round++) {
      for (const id of lost) await flush(id)
      lost = waiting()
    }
    if (lost.length === 0) return true
    const names = lost.flatMap((id) => (cur(id) ? [`"${W.docName(cur(id)!)}"`] : [])).join(', ')
    const choice = await deps.current.askChoice<'download' | 'go'>(
      `${question} Changes to ${names} that aren't saved yet will be lost.`,
      [
        { label: 'Download a copy', value: 'download' },
        { label: go, value: 'go', primary: true, danger: true },
      ],
      { title },
    )
    if (choice === null) return false
    if (choice === 'download') for (const id of lost) if (!(await download(id))) return false
    return true
  }
  // Signing out (asked for) forgets the account in this tab only: what waits is saved first, then every Drive library
  // closes here.
  const signOut = async () => {
    if (!(await flushAll('Sign out', 'Sign out anyway?', 'Sign out anyway'))) return false
    google.signOut()
    forgetDrive()
    say('info', SIGNED_OUT, { detail: SIGNED_OUT_MORE })
    return true
  }
  // Reset to first visit: the page reloads right after, so nothing closes here and nothing is said.
  const readyToReset = async () => {
    if (!(await flushAll('Reset to first visit', 'Reset anyway?', 'Reset anyway', true))) return false
    google.signOut()
    leaving.current = true
    return true
  }
  // Switching accounts (asked for) is for this tab alone: what waits is saved first, with the old account's token.
  const switchAccount = async () => {
    if (!(await flushAll('Switch account', 'Switch account anyway?', 'Switch anyway'))) return false
    try {
      const { from, to } = await google.switchAccount()
      if (from === to) {
        signedInAgain()
        return false
      }
      forgetDrive()
      setSignedNow()
      signedInAgain()
      say('info', `Signed in as ${to} in this tab.`, {
        detail: from ? `The Google Drive libraries of ${from} closed here. Other tabs keep their own account.` : 'Other tabs keep their own account.',
      })
      return true
    } catch (err) {
      report(err, "Couldn't switch account. ")
      return false
    }
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
      setSignedNow()
      signedInAgain()
      return true
    } catch (err) {
      report(err, 'Not signed in. ')
      return false
    }
  }
  // Libraries read to show what is inside them, by file and version. A closed link is read through the link.
  const peeked = useRef(new Map<string, Library>())
  const peek = async (driveId: string, version = '') => {
    const key = `${google.signedInAs() ?? ''}|${driveId}|${version}`
    const hit = peeked.current.get(key)
    if (hit) return hit
    const entry = ref.current.closed.find((c) => c.drive?.id === driveId)
    const own = ref.current.signedIn && (entry?.drive?.mine ?? true) && sameOwner(entry?.drive)
    try {
      const { library, source } = await google.readDriveFile(driveId, own)
      // Found in its owner's bin: no closed entry of it stays (the bin is no library, asked for).
      if (source.trashed && entry) update((w) => W.forgetClosedDrive(w, driveId))
      for (const k of peeked.current.keys()) if (k.includes(`|${driveId}|`)) peeked.current.delete(k)
      peeked.current.set(key, library)
      return library
    } catch (err) {
      report(err, "Couldn't read this Google Drive file. ")
      return null
    }
  }
  const list = async () => {
    try {
      const files = await google.listDriveFiles()
      signedInNow()
      return files
    } catch (err) {
      report(err, "Couldn't list your Google Drive libraries. ")
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
      if (others.length) say('warning', `Not a .shrimp file, so not added: ${others.map((f) => `${q(f.name)}`).join(', ')}.`)
      return libraries.length
    } catch (err) {
      report(err, "Couldn't open Google's file picker. ")
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
      say('info', `Moved ${q(file.name)} to the bin in your Google Drive.`, {
        detail: 'Google deletes it for good after 30 days; restore it from the bin in Google Drive to get it back.',
      })
      return true
    } catch (err) {
      report(err, `${q(file.name)} wasn't moved to the bin. `)
      return false
    }
  }

  const driveFor = (d: W.Doc | null, signedIn: boolean, signedAs: string | null): DriveApi => {
    const id = d?.id
    const yours = !!d?.drive && !isViewOnly(d, signedIn, signedAs)
    return {
      setUp: google.driveSetUp,
      file: d?.drive ?? null,
      signedIn: () => signedIn,
      signedAs: () => signedAs,
      canListQuietly: () => google.hasFreshToken(),
      yours,
      savesInto: yours,
      signOut,
      switchAccount,
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
      folderLink: () => google.appFolderLink().catch(() => null),
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
      say('error', `${q(W.docName(d))} wasn't downloaded.`, { cause: err })
      return false
    }
  }

  // Save to a file (a browser library's way off this browser without Google, asked for; Chrome and Edge): a new .shrimp
  // file picked in the save dialog, written, and the library tied to it, named after it, saving into it from then on.
  const saveToFile = async (id: DocId) => {
    const d = cur(id)
    if (!d || d.drive || d.file || !adapter.savesInPlace) return false
    const library = d.library
    let file: FileRef | null
    try {
      file = await adapter.saveAs(library, W.docName(d))
    } catch (err) {
      say('error', `${q(W.docName(d))} wasn't saved to a file.`, { cause: err })
      return false
    }
    if (!file) return false
    const to = file
    update((w) => {
      const named = W.patchDoc(w, id, (x) => ({ name: W.bareName(to.name) === x.name ? x.name : W.freeDocName(w, W.bareName(to.name)) }))
      return W.markSaved(named, id, library, { file: to, problem: null })
    })
    say('info', `${q(W.docName(cur(id) ?? d))} is saved to ${to.name}.`, {
      detail: `It's now on this device, tied to that file: Save on its row or ${comboLabel('Mod+S', isMac(navigator.platform))} writes your changes into it.`,
    })
    return true
  }

  const closeDoc = async (id: DocId) => {
    const start = cur(id)
    if (!start) return false
    if (autosaves(start, ref.current)) {
      // A Drive file saves what waits first. A file on this device saves only when asked, so closing one with
      // changes asks (Save and close, Download a copy, Close anyway).
      if (!start.file) await flush(id)
      // Asked again when changes came in while it saved (typed in another pane meanwhile): those are not saved yet.
      // A file on this device can also be downloaded as a copy first.
      const ask = async (): Promise<'save' | 'discard' | null> => {
        const x = cur(id) ?? start
        if (!x.file) {
          return deps.current.askChoice<'save' | 'discard'>(
            `Changes to "${W.docName(x)}" aren't saved to Google Drive yet. If you close it anyway, they are lost.`,
            [
              { label: 'Close anyway', value: 'discard', danger: true },
              { label: 'Save and close', value: 'save', primary: true },
            ],
            { title: 'Close file' },
          )
        }
        const choice = await deps.current.askChoice<'save' | 'discard' | 'download'>(
          `Changes to "${W.docName(x)}" aren't saved to ${x.file.name} yet. If you close it anyway, they are lost.`,
          [
            { label: 'Close anyway', value: 'discard', danger: true },
            { label: 'Download a copy', value: 'download' },
            { label: 'Save and close', value: 'save', primary: true },
          ],
          { title: 'Close file' },
        )
        if (choice === 'download') return (await download(id)) ? 'discard' : ask()
        return choice
      }
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
    if (!d.drive && !d.file && timers.current.has(id)) {
      clearTimeout(timers.current.get(id))
      await writeNow(id)
    }
    const yours = ownDrive(d, ref.current)
    forgetTimers(id)
    update((w) => W.closeDoc(w, id))
    // Its record is kept while another tab has changes in it that are not on Drive yet (reopening finds them).
    // A file on this device is on disk: its record and handle go, and it opens again with Open file.
    if (d.file || (d.drive && !d.dirtyElsewhere)) void backup.deleteDoc(id).catch(() => undefined)
    const closed = closedNote({ name: W.docName(d), drive: d.drive, file: d.file }, yours)
    // Every closed file can be reopened from its toast (asked for): a file on this device through the handle it had,
    // reading the file as it is now.
    const handle = d.file?.handle
    const reopen = d.file ? (handle ? () => void reopenFile(handle, W.docName(d)) : null) : () => void reopenClosed(id)
    say('info', closed.text, { detail: closed.detail, action: reopen ? { label: 'Reopen', run: reopen } : undefined })
    return true
  }

  // A closed file on this device opens again from the handle it had (the browser still lets this page read it), as
  // it is now on disk; a file already open again just shows.
  const reopenFile = async (handle: FileSystemFileHandle, name: string) => {
    const now = await adapter.look(handle)
    if (now.status !== 'ok') {
      say('warning', `Couldn't reopen ${q(name)}.`, {
        detail: now.status === 'missing' ? `${handle.name} was moved or deleted. Open it again with Open file.` : 'Open it again with Open file.',
        cause: now.status === 'error' ? now.message : undefined,
      })
      return
    }
    const tab = newId()
    for (const d of Object.values(ref.current.docs)) {
      if (d.file && (await adapter.sameFile(d.file, now.file).catch(() => false))) {
        const sameId = d.id
        update((w) => W.openPlace(w, sameId, HOME, tab).workspace)
        return
      }
    }
    const id = newId()
    update((w) => W.addDoc(w, W.makeDoc(id, now.library, W.freeDocName(w, W.bareName(now.file.name)), { file: now.file }), HOME, tab))
  }

  const reopenClosed = async (id: DocId): Promise<DocId | null> => {
    if (cur(id)) {
      const tab = newId()
      update((w) => W.activateDoc(w, id, tab))
      return id
    }
    const entry = ref.current.closed.find((c) => c.id === id)
    // Gone since it closed (deleted from this browser, moved to the bin, removed from the list): a stale Reopen says so.
    if (!entry) {
      say('warning', 'That library is no longer in this browser.', { detail: 'It was deleted from this browser, maybe in another tab.' })
      return null
    }
    let doc: W.Doc
    // A Drive file kept with changes not on Drive yet (another tab's, when it was closed here) opens with them, to save.
    const kept = entry.drive ? await backup.readDoc(id).catch(() => null) : null
    if (entry.drive && kept?.dirty && kept.drive) {
      doc = W.makeDoc(id, kept.library, entry.name, { drive: kept.drive, saved: null })
    } else if (entry.drive) {
      const own = ref.current.signedIn && entry.drive.mine && sameOwner(entry.drive)
      try {
        const { library, source } = await google.readDriveFile(entry.drive.id, own)
        doc = W.makeDoc(id, library, entry.name, { drive: ownedBy({ ...source, shared: own ? entry.drive.shared : true, mine: own ? source.mine : entry.drive.mine }) })
      } catch (err) {
        report(err, `Couldn't open ${q(entry.name)}. `)
        return null
      }
    } else {
      const rec = await backup.readDoc(id).catch(() => null)
      if (!rec) {
        say('error', `${q(entry.name)} is no longer in this browser.`, { detail: 'It was deleted from this browser, maybe in another tab.' })
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
      say('error', problem, { detail: next ? 'A library is also a file, so its name must work on Windows, macOS and Linux.' : undefined })
      return false
    }
    const d = cur(id)
    if (!d) return false
    if (isViewOnly(d, ref.current.signedIn, ref.current.account)) {
      say('error', RENAME_VIEW_ONLY_TEXT)
      return false
    }
    if (W.bareName(W.docName(d)) === next) return true
    // Two open libraries never share a name (they would read the same in the sidebar, the Explorer and the address).
    const taken = ref.current.order.some((o) => o !== id && W.bareName(W.docName(ref.current.docs[o])).toLowerCase() === next.toLowerCase())
    if (taken) {
      say('error', `Another library open here is already named ${q(next)}.`)
      return false
    }
    // A failed rename keeps what was typed: Try again renames to it once more. A save that came due meanwhile (it
    // waited for the rename) is armed again.
    const failed = (cause: unknown) =>
      say('error', `${q(W.docName(d))} wasn't renamed to ${q(next)}.`, { cause, action: { label: 'Try again', run: () => void renameDoc(id, next) } })
    const after = (ok: boolean) => {
      const now = cur(id)
      if (now && W.hasChanges(now)) arm(id)
      return ok
    }
    if (d.file) {
      // A library tied to a file on this device is renamed by renaming the file, where the browser can.
      const handle = d.file.handle as (FileSystemFileHandle & { move?: (name: string) => Promise<void> }) | null
      if (!handle || !('move' in handle)) {
        say('error', "This browser can't rename files. Rename it on your computer, then use Locate file.")
        return false
      }
      // After a save under way (never dropped for it); closed meanwhile, there is nothing to rename.
      return queue(id, async () => {
        if (!cur(id)) return false
        try {
          await handle.move!(`${next}.shrimp`)
        } catch (err) {
          failed(err)
          return false
        }
        update((w) => W.renameFile(w, id, next, `${next}.shrimp`))
        return true
      }).then(after)
    }
    if (!d.drive && !running.current.has(id)) {
      update((w) => W.renameDoc(w, id, next))
      return true
    }
    return queue(id, async () => {
      const now = cur(id)
      if (!now) return false
      const drive = now.drive
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
        if (!(err instanceof google.SignInClosed)) failed(err)
        return false
      }
    }).then(after)
  }

  // One copy at a time per library: pressed again while one is made (a double click), it is that same copy.
  const copying = useRef(new Map<DocId, Promise<DocId | null>>())
  const makeCopy = (id: DocId): Promise<DocId | null> => {
    const now = copying.current.get(id)
    if (now) return now
    const done = copyOf(id).finally(() => copying.current.delete(id))
    copying.current.set(id, done)
    return done
  }
  const copyOf = async (id: DocId): Promise<DocId | null> => {
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
          say('info', `${q(W.docName(cur(id) ?? shown))} is your own file, so you can change it here.`)
          return id
        }
      } catch (err) {
        report(err, `Couldn't make a copy of ${q(W.docName(cur(id) ?? shown))}. `)
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
      say('error', `${q(name)} couldn't be opened.`, { cause: err })
      return null
    }
  }

  // Opening a file the browser can keep (Chrome, Edge) ties the library to it: it saves into the file by itself. Opened
  // again it shows the library it is open in, with a toast saying so. The file changed outside: with nothing unsaved
  // here its version is taken; with both changed it asks. Elsewhere (no handle) a copy opens in this browser, never tied
  // to the file; saving it to Drive is a click away.
  const reconcileFile = async (id: DocId, o: Extract<Opened, { ok: true }>) => {
    const x = cur(id)
    if (!x?.file || (o.file.modified === x.file.modified && o.file.size === x.file.size)) return
    const take = () => update((w) => W.replaceDoc(w, id, keepIds(w.docs[id]?.library ?? o.library, o.library), { file: o.file, problem: null }))
    if (!W.hasChanges(x) && !x.dirtyElsewhere) return take()
    const choice = await askFileChanged(deps.current.askChoice, W.docName(x), x.file.name)
    if (choice === 'theirs') take()
    else if (choice === 'mine') {
      // The file as it is now is what the next save is checked against, so mine goes over it.
      update((w) => W.patchDoc(w, id, { file: o.file, problem: null }))
      arm(id, 0)
    }
  }
  const openFile = async (at: Route = HOME) => {
    let opened: Awaited<ReturnType<StorageAdapter['openFiles']>>
    try {
      opened = await adapter.openFiles()
    } catch (err) {
      say('error', "Couldn't open the file picker.", { cause: err })
      return null
    }
    if (!opened) return null
    let last: DocId | null = null
    // Anything that goes wrong past the picker says so (asked for: never nothing at all).
    try {
      for (const o of opened) {
        if (!o.ok) {
          say('error', `${q(o.name)} couldn't be opened.`, { detail: [o.error, BAD_FILE_HELP] })
          continue
        }
        const id = newId()
        const tab = newId()
        if (o.file.handle) {
          let same: W.Doc | undefined
          for (const d of Object.values(ref.current.docs)) {
            if (d.file && (await adapter.sameFile(d.file, o.file).catch(() => false))) {
              same = d
              break
            }
          }
          if (same) {
            const sameId = same.id
            update((w) => W.openPlace(w, sameId, HOME, tab).workspace)
            say('info', `${q(W.docName(same))} is already open.`)
            await reconcileFile(sameId, o)
            last = sameId
            continue
          }
          update((w) => W.addDoc(w, W.makeDoc(id, o.library, W.freeDocName(w, W.bareName(o.file.name)), { file: o.file }), at, tab))
          last = id
          continue
        }
        let name = ''
        update((w) => {
          name = copyName(W.bareName(o.file.name), W.docNames(w))
          return W.addDoc(w, W.makeDoc(id, o.library, name), at, tab)
        })
        say('info', `Opened ${q(name)} in this browser.`, {
          detail: `This browser can't save into files on your device, so this is a copy. Changes don't reach ${o.file.name}: upload it to Google Drive or use Download a copy.`,
          action: google.driveSetUp ? { label: 'Upload to Google Drive', run: () => void upload(id) } : undefined,
        })
        last = id
      }
    } catch (err) {
      say('error', "Couldn't open the file.", { cause: err })
    }
    return last
  }

  // Locate file: a moved or deleted file is picked again. The library ties to it when it holds what was last saved
  // here, or the user agrees to replace what it holds; then the library saves into it.
  const locate = async (id: DocId): Promise<boolean> => {
    const d = cur(id)
    if (!d?.file) return false
    let opened: Awaited<ReturnType<StorageAdapter['openFiles']>>
    try {
      opened = await adapter.openFiles({ multiple: false })
    } catch (err) {
      say('error', "Couldn't open the file picker.", { cause: err })
      return false
    }
    const o = opened?.[0]
    if (!o) return false
    if (!o.ok) {
      say('error', `${q(o.name)} couldn't be opened.`, { detail: [o.error, BAD_FILE_HELP] })
      return false
    }
    if (!o.file.handle) {
      say('error', "This browser can't save into a file on this device.")
      return false
    }
    for (const other of Object.values(ref.current.docs)) {
      if (other.id !== id && other.file && (await adapter.sameFile(other.file, o.file).catch(() => false))) {
        say('warning', `${q(W.docName(other))} is already open from that file.`)
        return false
      }
    }
    const same = !!d.saved && sameLibrary(d.saved, o.library)
    // Other content: the question names the file picked and what each holds, so a wrong pick is plain (asked for).
    const changed = new Date(o.file.modified).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    const question =
      `"${o.file.name}" holds a different library (${countLine(o.library)}), last changed ${changed}.\n\n` +
      `Replace it with "${W.docName(d)}" (${countLine(d.library)})? What the file holds now is lost.`
    if (!same && !(await confirm(question, 'Replace', { title: 'Locate file', danger: true }))) return false
    const file = o.file
    update((w) =>
      W.patchDoc(w, id, (x) => ({
        file,
        problem: null,
        name: W.bareName(file.name) === x.name ? x.name : W.freeDocName(w, W.bareName(file.name)),
        // Other content in the file: the library is saved over it.
        ...(same ? {} : { saved: null }),
      })),
    )
    say('info', `${q(W.docName(cur(id) ?? d))} saves into ${file.name} again.`)
    return flush(id, true)
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
      else {
        say('info', 'Not undone: other changes came after it.', {
          detail: `Undo on a toast only takes back its own change while it is the last one. ${comboLabel('Mod+Z', isMac(navigator.platform))} steps back through the later ones first.`,
        })
      }
    }
  }

  // ---- One document's API, the same object while nothing it shows changes ----

  // A stale library (W.stale) is not its Drive version: never Saved until its sync takes that.
  const statusOf = (d: W.Doc) => saveStatus(W.stale(d) ? { ...d, saved: null } : d, { signedIn: ws.signedIn, account: ws.account, busy: busy.has(d.id), online })
  const apis = useRef(new Map<DocId, { doc: W.Doc; signed: string; ready: boolean; status: SaveStatus; api: LibraryApi }>())
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
      fileName: d.file?.name ?? null,
      fileChanged: d.file?.modified || null,
      checkFile: () => syncFile(id),
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
      saveNow: async () => (autosaves(cur(id), ref.current) ? flush(id, true) : false),
      locate: () => locate(id),
      makeCopy: () => makeCopy(id),
      download: async () => void (await download(id)),
      upload: () => upload(id),
      canSaveToFile: adapter.savesInPlace,
      saveToFile: () => saveToFile(id),
      close: () => closeDoc(id),
      drive: driveFor(d, ws.signedIn, ws.account),
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
    if (hit && hit.doc === d && hit.signed === `${ws.signedIn}|${ws.account}` && hit.ready === ready && hit.status === status) return hit.api
    const api = makeApi(d, status)
    apis.current.set(id, { doc: d, signed: `${ws.signedIn}|${ws.account}`, ready, status, api })
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
    closeGroup: (groupId) => update((w) => W.closeGroup(w, groupId)),
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
    drive: driveFor(null, ws.signedIn, ws.account),
    openLabel: adapter.openLabel,
    openHint: adapter.openHint,
    savesInPlace: adapter.savesInPlace,
    readyToReset,
  }
}
