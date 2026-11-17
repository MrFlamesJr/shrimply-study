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
