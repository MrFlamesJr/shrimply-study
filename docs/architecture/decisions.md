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
