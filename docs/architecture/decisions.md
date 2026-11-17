# Decisions

Taken while planning the workspace (approved with the plan on 2026-11-16). Later judgement calls are added at the end.

1. Save writes back into the opened file where the browser allows it (Chrome, Edge: File System Access, the handle
   kept in IndexedDB, permission asked once per visit, an external change asks before overwriting); a Drive file saves
   to Drive; a library with no file gets Save as. Firefox and Safari download under the file's name. Download is
   always a separate copy and never changes which file a library is tied to. The browser backup is automatic.
2. Drag and drop moves; Ctrl (Option on Mac) copies; the label says which; a refused drop says why; Esc cancels.
3. Multi-selection spans courses, quizzes and files; copy, cut, move and drag need one kind of item; delete takes any mix.
4. Undo: one app-wide history of content changes (all files, all windows), 100 steps per session; typing merges per
   field over 1.5 s; layout is not undoable; inside a text field Ctrl+Z is the browser's own; a file replaced from
   outside (another tab, a Drive pull, a reload) drops its entries.
5. A card is deleted at once with an Undo toast; quizzes and courses ask first and can be undone; closing a file with
   changes asks Save / Don't save / Cancel.
6. Restored on reload: open files (with unsaved changes), tabs and their pages, splits and sizes, active tabs, the
   Explorer's expanded items and selection, the sidebar. Popped-out panes come back docked. Scroll is not restored.
7. No fixed number of groups; a split is refused when a pane would be under 320x240px; Split goes right (Split down in
   the menu) and shows the active tab in the new group too.
8. Pop out uses a popup window (`window.open`, `popup` feature) of `public/popout.html`; the browser's own title bar
   and address line stay; off on touch and below 800px.
9. Pinned tabs: not built (todo list).
10. One document per file (`isSameEntry`, the Drive id, or name, size and modified time); opening it again shows it.
11. A tab is a view: closing the last tab of a file keeps the file open in the Explorer and Open files.
12. Choice questions have a mode, One answer or All that apply. Older files: several correct answers means All that
    apply, else One answer. New questions: One answer, 1 correct and 2 wrong. One answer with several correct accepts
    any of them.
13. Confetti on the results: short and light when done, bigger with the accent on a perfect score, none under reduced
    motion.
14. The ungrouped cards' Add new card box sits above them and adds at the top; groups keep theirs at their end; the
    quiz page has Add card at the top of its list; editor cards drag by a grip (dnd-kit) and move with Alt+Shift+arrows.
15. No new packages. dnd-kit sorts within one list; native drag and drop moves between places.
16. Work on the local branch `Release-RubberDuck`, one commit per wave, nothing pushed.

## Later

- T11 (workspace core), 2026-11-16:
  - State: one immutable `Workspace` (`src/state/workspace.ts`, pure transitions with tests) held by `useWorkspace`
    in a ref mirrored into React state, so several transitions in one click compose and async actions read what is
    there now; transitions run once, ids and times come in as arguments.
  - The active document is not stored apart: it is the active tab's (one tab per document, id `doc:<id>`).
  - The address bar follows the active tab: switching documents replaces the hash synchronously inside the state
    update (`onSwitch`), so the next render already shows the right page; a hash change by the user is stored in the
    active tab. On start the address wins over the restored tab's page. A `#/_drive/` link is never kept in a tab.
  - Documents opened from the debug page keep the debug page as their tab's page; everything else opens on home.
  - A document's own name ("New library 2", "Guide", "Test library") is kept in the workspace record's `ui.names`,
    not in its document record (the record format stays as `workspaceRecord.ts` has it).
  - `LibraryApi.open` and `newLibrary` are gone (opening is a workspace action now: `openFile`, `openLibrary`,
    `openDrive`, `newDoc`); the rest of the shape stays, plus `id`, `name`, `file`, `replace`, `save`, `close`.
  - History entries: renames keyed per course or quiz, `updateCard` and one-card `setCards` keyed `card:<id>`, a
    group's name or color `group:<id>` (labels from `logic/cardsEdit`); a change to nothing records nothing (so an
    undo back to the saved library clears the mark). Closing or replacing a document takes it out of every entry
    (entries left empty go) instead of dropping whole multi-file entries.
  - Undo of a step in a file that is not the active one says so in a toast ("Undid ... in ...").
  - A pasted cut becomes a copy of the moved items (pasting again copies), as with cut text.
  - Save with nothing to save, for a file tied to a .shrimp file or the user's own Drive file, says "No changes to
    save." (the row's Save is greyed out then); a library with no file can always be saved as one.
  - A file opened again that changed on disk reloads quietly (a toast says so) when it has no unsaved changes, else
    asks first ("File changed on disk", Open / Cancel).
  - A document another tab closed (its record deleted) stays open here and is written again.
  - Sidebar row actions: Save (a new floppy icon, `src/icons/save.svg`), Download (the existing arrow into a tray),
    Close (the cross). Below 800px they sit on a line of their own under the active row (or the focused one), so the
    name keeps the drawer's width.
  - The danger zones now say "Ctrl+Z brings it back." instead of "You can't undo this."
  - The guide's cards about saving, opening and New library were updated (`samples/how-to-use`, zipped again).
- T12b (the workbench mounted), 2026-11-16:
  - Tabs have their own ids; a file may show in several tabs and groups. Opening a place reuses the file's tab in
    the target group (a new tab only when asked: Ctrl or middle click, the Explorer when it has no other group).
  - Split shows a copy of the active tab (same file and page) in the new group, even from a group with one tab; a
    dragged tab moves instead. The Explorer is never copied: split moves it, or the new group starts empty.
  - The active file is the active tab's, else the file of the tab active most recently (`recent`, across groups,
    kept in the workspace record's `ui`). The sidebar tree shows it; its links open in the active group.
  - The address bar follows the main window's active tab only: a switch replaces the entry, going somewhere in it
    pushes one; back, forward and typed addresses move that tab (in the hashchange event, with flushSync, so a screen
    that goes has its effects cleaned up at once; a later effect-driven update let EditOutline's ResizeObserver run
    after its refs were cleared). The tab-to-hash write runs only when the tab or its page changes, never because the
    address changed (it may change before its hashchange arrives). On start the address wins.
  - The app's own pages stay outside the workbench: debug in the page cell (the workbench kept, hidden), changelog and
    the kit demo full screen with the shell unmounted (a popped-out window closes then; its tabs come back docked).
  - A study session alone in the main window is full screen by CSS (`is-session`: shell and tab strip hidden), so
    the workbench, other tabs and popups stay mounted; in a split it fills its pane (`.pane-session`).
  - Study keys work only in the active group: StudyScreen's `active` prop (its question components' existing
    `paused`).
  - With no file open and no tab, the welcome page takes the page cell; with files but no tab, the empty group says
    "No tab open" (closing tabs never closes files).
  - The top row keeps only Open file and Google Drive (also on the Files heading); TopBar's crumbs, Download and Save
    to Drive are gone (each pane heads its page; each file's actions are on its sidebar row). Pane heads: the file
    (its home), then course and quiz; none for a study session or the Explorer.
  - Panes are see-through (the theme's backdrop shows in them, as on the page before); the sash between groups takes
    the sidebar's tone. Each pane has its own back-to-top button (on the pane, not in what scrolls).
  - The Explorer opens split on the left when the window is 1000px or wider and the active group has room for two
    320px panes; else as a tab. Reveal in Explorer selects the tab's quiz, course or file.
  - An Explorer Edit on a card opens its quiz page and its card dialog (QuizScreen's `openCard`), not the editor.
  - Popping out asks for a window the size of the group; blocked: a warning toast. The main window's only group gets
    an empty group beside it first.
  - Save all: an icon button on the Files heading (greyed out with nothing to save, as a file's Save) and Ctrl+Alt+S
    (by key code, but only outside text fields when AltGr+S types a letter).
  - Performance: the document-level :has() rules are gone: `data-sidebar` on <html> and `is-side-closed` on .app
    (App), `data-modals` on a dialog's own <html> (Modal). The window never scrolls now, so `scrollbar-gutter: stable`
    went too (the popout e2e allows the popup's full width).
  - route.ts's pure parts moved to `src/logic/routes.ts` (re-exported), so src/logic stays free of React; the unused
    window-level `usePlace` is gone, and useWorkspace's stale `Nav` type.
- T12b follow-up, 2026-11-16:
  - Back and Forward: each history entry names the tab that made it (history.state `{ tab }`, set by makeTabNav and
    by the address mirror). An entry goes back to its tab wherever it is now (activated, on that page); an entry with
    no tab of its own (gone, or a typed address) moves the main window's tab only when its file has that page, else
    nothing happens. The same tab moved from the sidebar or the Explorer now adds an entry too.
  - A tab moved to another group keeps its screen (a study round goes on): screens render into a node per tab and
    window, which the group's slot takes in. Moved to another window, it starts afresh (what it measured and listened
    to belonged to the old window), as before.
  - Every release's notes are a tab (one at most) instead of a full-screen page, so popped-out windows stay; Back to
    the app closes it. Only the kit demo (#/_workbench, not linked) still takes the window.
  - Breadcrumbs: the file's name first (alone and not a link on its home), course, quiz, Edit; followed through a
    rename at once (by id, as the page is); none over study or the Explorer (their own heads, the same height);
    "All releases" and "Welcome" for those tabs. A narrow pane (under 480px of its own width) shows "‹ parent". A
    debug page never shows in a pane (it takes the page cell); a #/_drive/ link opens its file's tab on home.
- No top row (asked for, 2026-11-16): the workbench starts at the top of the window. The corner is as tall as a tab
  strip (36px, 44px below 800px); closed, and on phones, it is just the shrimp and the toggle (no brand name), and
  the main window's top-left tab strip (`is-corner`) makes room for it, gliding with the workbench when the sidebar
  slides. Open file, Google Drive and Save all live only on the Files heading (the drawer's too). The pane head is a
  plain 32px row above the pane's scroller (no glass, no fade); its pad and the page's come from the pane's own width
  (cqw), so the crumbs line up with the page in any pane. The app's own pages leave room for the corner at the top.
- Asked for, 2026-11-16: an empty group shows a calm page (`EmptyPane`): the shrimp in the muted tone at `--dim-empty`
  (one tone, so it reads as a watermark, not the logo), "No tab open" in the display font, then the Explorer (with
  its key), New file, Open file and each open file's home (opens in that group). The tab strip has no fill; the active
  tab sits on `--surface-clear` (see-through) with its line and full text color. The brand shows the active file's
  home tab in the main window, else opens it in a new tab in the active group; with no file open it goes home (the
  welcome page) as before. Unused tokens removed (`--glass-bar*`, `--corner-w`, `--toggle-size`, `--text-2xs`);
  `--topbar-h` is now `--session-head-h` (a study session's head). Kept, though unused in the app's CSS: the kit's
  host variables `--kit-danger` and `--kit-weight-bold` (the kit's documented contract) and `--dur-draw` (CLAUDE.md
  names it for the sequence line drawing itself, which now only fades in: a possible regression to look at).
  The edit outline sits `--space-6` out on every side, the top too.
- Asked for, 2026-11-16: a one-crumb head did not read as breadcrumbs. The root crumb now starts with a small muted icon
  of where its file lives (the sidebar row's: file, cloud, browser; the shrimp for the app's own pages, "Shrimply Study" ›
  "All releases"), and a file's home adds the page's own name, the same words as its title ("Your courses", or the
  welcome page's). A page that is gone still shows the file alone. The narrow "‹ parent" has no parent on a home, so a
  narrow home shows the two-item trail.
- Asked for, 2026-11-16: a popped-out window repeated its name (browser bar, our title row, tab, crumb). The title row is
  gone: the tab strip is the first thing under the browser's bar, and Dock is an icon button (`DockIcon`, an arrow coming
  into a window) in the strip of the window's top-right group (once per window, as a window can be split), plus "Dock" in
  each of its groups' ⋯ menus. A tab's menu now moves just that tab (Move to new window, `popOutTab`: a new group there);
  the ⋯ menu moves the group (Move group to new window). The main window's last group may now go too (the menu used to
  refuse it): the main window keeps an empty group, which shows the empty pane page. An empty group can not be moved.
- Asked for, 2026-11-16: What's new is a tab (the changelog tab renamed, its data kind still `changelog` so stored
  workspaces keep it), opened from a small link under the sidebar's Explorer and from home's What's new box, both the
  shared `.open-link` with the new `OpenIcon`. Its page lost "Back to the app" (a tab closes with its ✕). A Ctrl or
  middle click on its link opens it without showing it; when it is already open that leaves it as it is.
- Asked for, 2026-11-16: the brand opens a Welcome tab (kind `welcome`, one at most, kept on reload) instead of the
  active file's home. The welcome page's showing on a first visit and once after each release now opens that tab on
  start (only when the visit starts on home, as before), and a file's home is the welcome page only while it has no
  courses. In the tab, Create your first course uses the active file when it has no courses (no pile of empty files),
  else a new file, and opens the course in the tab's group; Go to my courses shows the active file's home there. With
  no file and no tab, the page cell still shows the welcome page (no tab to close).
- Asked for, 2026-11-16: the crumbs start at the pane's left, in line with the first tab's text (the strip's inset
  plus the tab's own), no longer with the page's padding. Where the strip makes room for the app's corner (sidebar
  closed, or below 800px) the crumbs keep the base inset, under the corner.
- Asked for, 2026-11-16: the main window counts the tabs in popped-out windows: a count (the `OpenIcon` and a number,
  its icon in a fixed cell so the hover pop moves nothing) in its top-right group's strip, whose menu lists each window
  by its tabs' titles and Dock all; an empty group's page says "2 tabs are in other windows" with Show them (the newest
  window to the front; "Show it" for one) and Dock all, underlined at rest as they sit in a line of text.
- Asked for, 2026-11-16: the sidebar's What's new link sits right above the Theme row, and the What's new box moved
  from home (the welcome page and the course list) to an empty group's "No tab open" page, under its actions.
- Asked for, 2026-11-16: signing out never loses an edit. The user's own Drive files (`drive.mine`) hide while the tab
  is signed out or signed in with another account; each remembers its account (`owner`, in the workspace record's
  `ui`, not in storage). A file with no owner yet (kept from before) is claimed by the next account it is shown to;
  signed out it hides like the others. The tab's account is read with a new `googleDrive.signedInAs` (the account the
  tab already keeps; no call to Google). Hidden files are never saved, refreshed, written over by an undo or redo
  (they wait, saying why) or moved out by a cut (it pastes a copy), and never in the address bar. Explicit Sign out
  asks (Save all and sign out, or Sign out without saving: they hide); the debug page's reset asks the same way and
  stops when cancelled. Involuntary: a tab that starts signed out says how many are hidden (on each start, as each
  start is one), and a 401 from Google signs out the same way. The Explorer's own note is left to its owner:
  `ws.hiddenDocs`, `ws.drive.signedIn()`, `ws.drive.signIn()` and `HiddenFilesNote` are there for it.
- Asked for, 2026-11-17: the address names the page on screen, the main window's focused group's active tab of any
  kind. The file goes in a query part, `?file=<slug of its name>` (".shrimp" left out, `-2` and so on for a second
  file of the same slug), only while several files are shown, so one-file addresses look as before and old links
  keep working against the active file. An empty focused group, or a hidden file's tab, is `#/_empty`: a neutral
  address that changes nothing when followed. A followed address that changes nothing is rewritten as what is
  shown. A reload's address goes first (`followHistory`: a tab of the named file in the focused group, opened when
  it has none; an app page's tab, opened when there is none). Whether the Welcome tab opens on start is decided by
  the address the visit started on, read before the address bar is rewritten.
- Asked for, 2026-11-17: opening a page that a tab already shows focuses that tab, in any group of any window
  (`showing`, `usedLast`: the one used last when several do), inside `openPlace`, `showAppPage` and `showExplorer`, so
  every way of opening goes through it; Ctrl or the middle button (`newTab`) and Duplicate tab still make a new one.
  The focused group's window comes to the front after each such opening (App's `bringForward`: `popup.focus()`, or
  the main window's when the focus moved there). A file's row in the sidebar shows the file's home (App's `onFile`),
  so the peer's file tree gets it from the handler. A tab the file has in the target group is still reused for its
  page, as before, when no tab shows the page.
- Asked for, 2026-11-17: Duplicate tab for every kind of tab, so several Explorers, What's new and Welcome tabs may
  exist (the one-at-most rule is gone; `readLayout` keeps them all). An Explorer tab may carry its own `view`
  (open nodes and selection; a duplicate starts from the original's), the first one keeps using the workspace's.
  PaneScreen hands each `ExplorerPane` the workspace as its tab sees it (`explorer` and `setExplorer` for that tab),
  so ExplorerPane is unchanged. Its search text and scroll are per tab while open (each tab's own component), not
  yet kept across a reload (that needs Explorer.tsx to take them as props).

- Asked for, 2026-11-17 (D, Drive-first files): a library is a Google Drive file or a browser library; "On this device" and
  saving into a `.shrimp` file were gone, until LF below brought them back (`StorageAdapter` then kept only `openFiles` and `download`, copies only,
  no handles).
  A `.shrimp` file opens as a browser library named after it, with a toast offering Upload to Google Drive. Signed in, a
  new library is made in the user's Drive; a Drive library of your own autosaves 1.5 s after the last edit and
  `needsAttention` (not "unsaved") drives the dot, the corner badge and the warn line. A paused save says why (sign in
  again, offline, changed on Google Drive: Keep mine / Take the Drive version / Cancel, or an error retried after 30 s),
  never silently. Closing never removes a library: it stays in the Explorer's closed files (`closed` in `workspace.v1`,
  its `doc.<id>` kept) until Delete from this browser, Move to bin, Remove from list or Sign out. Save all, Ctrl+Alt+S and
  "Save changes?" on close went with it. Not a library format change, `FORMAT_VERSION` stays 3.
- Asked for, 2026-11-17 (V, view-only shared libraries): a Drive file not known to be the signed-in user's own is view
  only, for everyone but its owner. The state refuses writes (`apply`), the screens show no edit affordance and one
  quiet line with Make a copy. It is always in sync, with no Pull: a checksum check on open, start, focus and every 60 s
  takes a newer version silently, and `keepIds` carries ids over so pages and a study round keep their place. Copy out
  of it works in the Explorer, paste in does not. Chosen over "save a copy on Ctrl+S" and "Pull changes" because a
  student of a shared set cannot lose or fork it by accident.
- Asked for, 2026-11-17 (A, one account per browser): the sign-in moved from each tab's session storage to one
  localStorage key, `shrimply-google-sign-in`. Sign out flushes pending saves (asking when one cannot be saved), then
  closes the account's own Drive libraries and forgets everything about the account; browser libraries stay. The
  sign-in was shared by every tab until PT below made it per tab. The hidden own files
  of 2026-11-16 (`hiddenDocs`, `isHidden`, `claimOwners`, `ui.owners`, `HiddenFilesNote`, `logic/signOut.ts`) are replaced
  by this: nothing about a signed-out account is kept, so nothing needs hiding. A 401 pauses saves instead of signing out.
- Asked for, 2026-11-17 (SH, sharing made plain): the Google Drive dialog is gone. Open (your libraries, Paste a link, a
  .shrimp copy) and Share (one primary button: Copy link turns sharing on and copies at once; Stop sharing asks first;
  a browser library uploads first) are separate dialogs; the account is only in the sidebar's account box.
  `unshareDriveFile` and `driveIdFromLink` are new.
- Asked for, 2026-11-17 (P, popup address and pane mode): a popped-out window has a real address, its focused group's
  active tab with `&pane` (`addressIn(win)`, `setPopupAddress`). Reloading it keeps it popped out (the kit takes the
  reloaded document over again); a controlled popup that boots as the app is sent to `popout.html` first
  (`POPUP_PREFIX` in `main.tsx`). Pasted in a new tab, the address opens pane mode: one group with one tab, no sidebar
  (`is-pane`), its layout never written to the saved workspace, and Open full app reloads it without `pane`.
- Asked for, 2026-11-17: How studying works is a tab (`#/_how-to-study`, `StudyTipsScreen`), opened from a link under the
  quiz page's study options, replacing the InfoBox and its `tipsPref` key.
- Asked for, 2026-11-17: drag and drop only onto real targets: the Explorer accepts only courses, quizzes, cards and
  groups (`TreeView` `drag.accepts`), links and images are not natively draggable and a file dragged from the computer
  drops only on an image slot (`guardNativeDrags`); editor cards stay in their own section.
- Asked for, 2026-11-17: the Explorer's head and tip stay put at the top, only the tree scrolls, the Drive line at the bottom.

- Asked for, 2026-11-17 (PT, a Google account per tab): replaces the cross-tab half of A. Each tab keeps its own sign-in
  in sessionStorage (`shrimply-google-tab-sign-in`), so a reload keeps it. The account chosen last, in any tab, is also
  kept in localStorage (`shrimply-google-sign-in`): a new tab starts as that account (`startSession`) and then keeps it
  as its own, so a later switch or sign-out elsewhere never reaches it (`lastAfter` says what that key becomes after a
  sign-in, switch, renewal or sign-out). `onTokenShared` replaced `onSignInChange`: a tab only adopts a fresh token for
  its own account, so no popup is needed after another tab renewed it. Switch account (`switchAccount`, the account box)
  and Sign out affect only their tab and close only that account's own Drive libraries there; shared libraries, browser
  libraries, files on this device and closed entries stay, and the backup records stay as other tabs may use them. A
  Drive file remembers whose own file it is (`DriveSource.owner`, `Workspace.account`): `isViewOnly(d, signedIn,
  account)` makes it view only for a tab signed in as someone else, so autosave never writes into another account's
  file; `forAccount` leaves such libraries out of a restore, and taking up another tab's record skips one owned by
  another account. Chosen over one shared account because two accounts (school and personal) in two tabs is a real
  use. Open: the workspace record (tabs, layout) is still last-writer-wins across tabs on different accounts.
- Asked for, 2026-11-17 (LF, local files that save themselves): reverses the "copies only" half of D. Where the browser
  can keep a file (Chrome and Edge, File System Access) an opened `.shrimp` stays tied to it (`Doc.file`, `where:
  'device'`) and saves into it `AUTOSAVE_DELAY` after each edit, through new `StorageAdapter` members (`saveInPlace`,
  `look`, `sameFile`, `savesInPlace`, `openFiles({ multiple })`); the handle is stored apart from the document record
  (`handle.<id>`, `writeHandle` / `readHandle`), so the record stays plain data. A save compares the file's modified
  time with the one last seen (a conflict asks Keep mine or Take the file's version); the browser's write permission is
  only asked for in a click (`permission`: Allow access and save), and a quiet `look` never asks anything. A moved or
  deleted file pauses the save as `missing` and the library is only in this browser now, said in red with Locate file
  (`locate`; the library is tied again when the file holds what was last saved, or the user agrees to replace it). The
  where line is "On this device · name.shrimp": browsers never give a page the folder, only the file name. Opening a
  file already open just shows its library (no toast), taking the file's version when it changed outside. Close asks
  Close anyway, Download a copy or Save and close when the save cannot go through; a closed file on this device is on
  disk, so its record and handle go and Open file opens it again. Firefox and Safari have no handle: the file opens as
  a copy in this browser, as in D. Drive-first stays: a Drive library is still the default, and the file is a choice
  of someone who opened one.
- Asked for, 2026-11-17 (SP, Save shown only while paused): a library that saves itself (a Drive file of your own, a
  file on this device) shows no Save button while it saves as it should; a button greyed out nearly always was noise.
  While its save is paused one button appears in the same place and fixes it in the click (Sign in again and save,
  Save now, Allow access and save, or choose which to keep); Ctrl+S saves at any time. A browser library's button is
  Upload to Google Drive, a view-only one's Make a copy. Share has its own `ShareIcon` and Upload `DriveIcon`, our own
  one-color drawing (never Google's logo); `LinkIcon` stays on the Open dialog's Shared link tab.
- Asked for, 2026-11-17 (RN, rename a library): double-click the name or F2 in the sidebar (no toolbar button: the
  toolbar is one click per action and a rename is rare), Rename (F2) in the Explorer's file menu. The sidebar's name
  becomes an `AutoText` field on the row, so it takes base.css's shared field state rules (`.file-rename` is in those
  selectors) instead of a copy. `renameDoc` renames a browser library's own name, a Drive file with `renameDriveFile`, a
  file on this device with `handle.move` where the browser has it (else a toast says the file keeps its name); it
  refuses an empty name, one that can not be a file name, and a view-only library (`RENAME_VIEW_ONLY_TEXT`), and is no
  undo step. New file opens with its name field ready; signed in, it opens the Upload dialog, which has Keep in this
  browser, and closing it any way without uploading (that button, the ✕, Esc, a click outside) renames the library to
  the typed name (`onRename`), so the name asked for is never lost. While a course or quiz is renamed its tabs' routes
  still hold the old name (they follow after 300ms), so App finds the page again by id (`foundPlace`, handed to the
  Workbench as `findPlace`, `FindPlace` in `workbenchActions`): tab titles and the sidebar's selection do not fall back
  to the file's name in between. Open: on touch the sidebar drawer takes the double-click, so only F2 and the
  Explorer's menu rename there.
- Asked for, 2026-11-17 (TM, toasts inside modals): everything outside an open modal dialog is inert, so a toast over a
  dialog could not be hovered or clicked. The toast stack (and the debug bar) now portal into the topmost open modal
  dialog (`useModalHost`) and back to the body, keeping their countdown across the move. A toast shows its text and ✕ on
  the first row and an action (Undo) on its own row under the text, at its end, with a 32px hit area (`--tap` below
  800px). The toast sets its own type, as inside a dialog it would take the dialog's.
- Asked for, 2026-11-17 (PK, Google's file picker themed): the picker is Google's page, so it can only be styled from
  outside: our scrim behind it and a dialog-like frame (`--popup`, `--border-strong`, `--radius`), fixed and centered
  (`.picker-dialog`, `!important` as Google sets inline styles), with `setSize` kept within Google's 566x350 to 1051x650.
  The Open dialog's Drive list now carries its scroll on to the dialog at its ends (it used to contain it).
- Asked for, 2026-11-17 (DI, `--danger-ink`): `--danger` only means deleting for good, with one exception: the line of a
  library whose file on this device was moved or deleted (it is only in this browser now) is red, since the user wants
  the loss of the file to be hard to miss. Small text in the danger color takes `--danger-ink`, `--danger` eased toward
  the text in `tokens.css` so it keeps 4.5:1 on the surfaces in every theme (the context menu's danger item, `--kit-danger-ink`,
  uses it too). A shared token in `tokens.css`, derived, so no theme file changes.
- Asked for, 2026-11-17: Reset to first visit (debug page) asks first, then forgets everything this browser remembers:
  `clearAll` empties the backup store, `resetPrefs` removes every `shrimply-` localStorage and sessionStorage key, and
  the tab's sign-in goes. A change that adds something the browser remembers makes the reset forget it and names it in
  the debug page's First visit text (a Workflow rule in CLAUDE.md). The Files heading counts open of total libraries
  ("2/5"): the total is what the Explorer lists (the open ones, the Drive list and the closed ones, via
  `libraryTotal`), so the Drive list is lifted into `useDriveFiles`, called once in App.
