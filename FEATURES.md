# Features

Ranked backlog. The ranking is by how much each feature helps exam studying (active recall, feedback, mixing topics), then by effort. "Seen in" shows where the idea comes from.

## Done

| Feature | Step | Seen in |
|---|---|---|
| Courses > quizzes > cards: create, rename, delete | 1 | Quizlet folders |
| Paste import with preview (Quizlet export, spreadsheet rows, `term - definition`) in a dialog (closes with ✕, Cancel or Esc); "Add to" shows every place as a one-click chip (No group, each group with its color, + New group with an inline name field) and the Add button says where the cards go | 1, fixes | Quizlet, Anki, Spotify "Add to playlist" |
| Choose prompt side (term, definition, mixed) and answer format (flashcards, multiple choice, typing), shuffle | 1 | Quizlet Learn |
| Typed answers that ignore case, accents, punctuation and spacing, plus "I was right" (a "Marked by you" badge on that answer, also on that row in the results, with what you typed); the answer box says what to type ("Type the definition", "Type the term", "Fill in the blank"); Check is disabled while the box is empty; after Check the answer box and Check stay in view, disabled | 1, fixes | Quizlet |
| Immediate feedback with the correct answer | 1 | Kahoot, Quizizz |
| Retry missed cards | 1 | Kahoot, Quizlet |
| `.shrimp` file (zip) open and download, browser backup, `*` in the tab title when unsaved, close warning | 1, fixes | |
| Hand-editable `library.json`: no ids, one card per line, strict reading with errors that name the spot | 2 | |
| Hub-and-spoke layout: onboarding home, course tiles, quiz hub, breadcrumbs, real URLs | 1, reworked | Quizlet set page |
| Sidebar (course > quiz tree) holds the brand; closes to nothing with brand and toggle kept top left; breadcrumbs stay put; no divider lines, centered page column | fixes, 2, 3 | Notion, Linear |
| Quiz page: Start and Edit quiz next to the title, study options (mode, show first, order) kept between rounds; sliding pick-one bars | fixes, 2 | Quizlet Learn |
| Editor: one box per term/definition pair, half-filled cards flagged, Done blocked until fixed, blank cards dropped | 2 | Quizlet |
| Text fields grow to fit any length; long names and words wrap everywhere | fixes | |
| Flashcards flip back and forth (3D flip); grading appears after the first flip | 2 | Quizlet |
| Full-screen study with bottom feedback bar, results screen, keyboard shortcuts, mobile layout | 1, reworked | Quizlet Learn, Kahoot |
| Calmer, roomier styling: one gold action per screen, tinted selections, small functional animations, delete buttons at the page bottom | 2 | |
| Dark high-contrast theme built from tokens | 1 | |
| Shrimp logo: favicon (outline turns light in a dark browser) and beside the brand name (outline in the text color) | fixes | |
| GitHub Pages deploy, live at https://mrflamesjr.github.io/shrimply-study/ (repo MrFlamesJr/shrimply-study, public) | 1, release | |
| Study options with a title per option and a hint under each that follows the choice; pencil-only Edit | 3 | |
| Shortcut hints with a keyboard icon (one component), hidden on touch | 3 | GitHub Primer |
| Explanation per card (optional, in the editor and the file; an empty one closes on Done), shown in a feedback sheet that snaps up for more info in every mode, with the mix-up for wrong answers and both sides | 3 | Quizizz, Kahoot |
| Toasts for info, warnings and errors: stacked bottom right, timed with a lifetime bar, dismissable, shape badge (circle, triangle, octagon); none dropped, older ones clipped and shown on hover with scroll; always on top (above dialogs, the color palette and the feedback sheet) and always in the same corner | 2, fixes | |
| A new course you leave without renaming it or adding a quiz is dropped, along with its unsaved mark | fixes | |
| Tooltips on buttons with unclear effects (I was right, Download, Open file, Import, Done) | fixes | |
| Edit the current card while studying (pencil in the card's corner, turns with the flip card; hovering it keeps the card's hover tint), changes show in the round right away; every row in the results has the same pencil | fixes | Quizlet |
| Study polish: flip hint always shown, taller cards centered vertically, feedback sheet opens and closes only with its round button, the button sits above it and points the way it will go; the sheet sits below the question and pushes it up (the question scrolls on its own, so its scrollbar fits what shows); open, it fits its content up to half the screen (drag its top line to resize it, also when closed, up to two thirds; the dragged size lasts until it closes, then the round button opens it to the default size again; let go near the bottom, it closes from there without jumping up first); scrollbars in the session wait until the sheet has settled; and the scrollbar's space is always kept, so it coming and going never shifts the layout; thin themed scrollbars | fixes | |
| Gold-tinted text selection, "#1" card numbers in the editor, a full-size "Edit quiz" button beside Start | fixes | |
| Debug page at `#/debug` (not linked) to trigger test toasts | 2 | |
| Text of any length in study: cards keep to the screen and long text scrolls inside them (wheel, drag, arrow keys) in a smaller left-aligned style, and a multiple choice or typing question with really long visible text gets a wider column; flashcards always keep one size so a long answer isn't given away; the answer box in the feedback sheet scrolls so its buttons stay in view; the closed sheet appearing doesn't move the card (it takes over a fixed room below it, unless it is taller); "More info" only when the card has an explanation (and shows just that); the mix-up note sits under the answer | fixes | Quizlet |
| Spaces and empty lines at the start and end of a term, definition or explanation are dropped (leaving a field, saving the card dialog, opening a file) | fixes | |
| Groups inside a quiz: create, rename (up to 50 characters, live counter while typing), ungroup, move cards; multiple choice takes wrong answers from the card's group first | 4 | |
| Fill-in-the-blank cards: mark any text as a blank (nested blanks get stacked colored underlines), one question per blank (the answer is shown with its blank's underline), an explanation per blank, `{ }` markers in the file | 4 | Anki, RemNote |
| A new course or quiz opens with its name selected, only right after creating it (never on a later visit or click); Ungroup asks first; "New group" is an outlined button with an icon and a visible hint; a quiz with nothing to study says why in plain words (no cards yet, or every card missing a part); compact study options (one row per option with the hint beside the bar, stacked when narrow; switching never changes the height) | fixes | |
| Group colors (named palette from the theme, picked from the group's dot, which pops out a row of swatches; tinted group containers in the editor and quiz page), themed dropdowns that open below, study options heading above its box, one New quiz button on the course page | fixes | |
| Quiz page card list styled like the editor: every card its own box, see-through inside a group box, with the editor's gap between cards and between sections; group headers laid out like the editor's (dot, name at the same size, card count on the right, same height); no hover lines between cards | fixes | |
| Quiz page card list: "#1" card numbers (same as the editor), explanations under the definition (per blank for fill-in-the-blank, starting with the blank in its color), a pencil per card that opens the card dialog (shows on hover or focus), card count per group; study options on a darker sunken panel; a blank's empty gap while studying is underlined in the same color as its dashed line once revealed; opening or closing a dialog never shifts the page sideways | fixes | Quizlet set page |
| Test library `samples/edge-cases.shrimp`: 7 courses, 21 quizzes, 232 cards covering every feature and edge case (text, blanks, groups, images, odd quizzes), each card's explanation says what it tests | fixes | |
| Guide `samples/how-to-use.shrimp` (and unzipped in `samples/how-to-use/`): how to use the app, an example of every JSON field (images, blanks, groups, colors), and the file rules as cards, so an AI can use it as a template | fixes | |
| Images on cards: one on the term, one on the definition, one per fill-in-the-blank card (not per blank). A small image button beside each field (or paste or drop an image on the field; pasted text stays text), then a square thumbnail (click to replace) with a ✕ badge on its corner to remove it. Big images are scaled down to 1600px and saved as WebP when that is smaller. Study shows a side's image above its text at a fixed size (both flashcard sides, the question card; in a flashcard it takes at most half the room, and its text turns to the paragraph size at half the usual length; a question card with an image never shrinks when the sheet opens, the column scrolls instead); multiple choice options, the answer in the feedback sheet and the statement under "More info" show a square preview next to their text, and the answer side's image is shown whole under "More info". Quiz page rows show square thumbnails. In the file each image is its own file in `images/`, named in library.json, one file per distinct image. The browser backup moved to IndexedDB (localStorage is too small for images) | 5 | Quizlet, Anki |
| Results screen reworked: the score (percent, right out of total, how many marked by you) and bar in one panel with Back to quiz, Study again (a new round with every card) and Retry missed (the gold one, or Back to quiz when nothing was missed); below it every question of the round in the order asked, shown like the quiz page (term and definition with images and the explanation, or the statement with the asked blank revealed and its explanation), a right or missed mark per row, what you picked or typed when it was wrong or marked by you, a pencil per row to fix the card, and an All / Missed / Right / Marked filter (Missed and Right only when both have questions, Marked only when you used "I was right"; Marked and the row badge have a tooltip saying you selected "I was right"); the page column, top-aligned so filtering never moves the score; narrow: the gold action full width above the others | fixes | Quizlet Learn, Quizlet Test |
| Course, quiz and group names can not be empty or only spaces: a cleared name field keeps the last name and shows it again on leaving; a file with one does not open (the error names the spot) | fixes | |
| Top row: Open and Download are small link-style buttons at the right edge; the breadcrumbs line up with the page content and slide in step with the sidebar and page when it opens or closes | fixes | |
| Zoomed far in (or a small window): crossing the 800px breakpoint closes the sidebar (and reopens it when wide again); the open sidebar on small screens is a full-height drawer headed by the brand and toggle, the page beside it is not darkened, and a click anywhere outside it closes it; its text wraps to the drawer width instead of being cut off; on short windows the course tree and "+ New course" scroll together; below 320px the brand hides and pick-one bars and the editor's add buttons wrap, so nothing scrolls sideways | fixes | |
| Deleting a card in the editor is a trash icon (with a tooltip), so it no longer looks like the image's ✕ badge right below it (it turns red on hover); icon buttons never fill on hover, the icon brightens and springs up a size (stays sharp, no jump); the sidebar toggle and every ✕ button use drawn icons; every add/new button uses a drawn plus icon instead of a + character | fixes | |
| Pick-one bars (study options, the results filter) have a thin outline around all their choices, with the chosen one filled inside it | fixes | |
| Named Shrimply Study, files are `.shrimp` (both samples renamed, the guide rebuilt); below 400px wide the brand is just the shrimp, so the top row still fits | fixes | |

## Todo (ranked)

| # | Feature | Seen in | Notes |
|---|---|---|---|
| 1 | Practice test: pick count and question types, score, review mistakes | Quizlet Test | Reuses `buildRound` |
| 2 | Star cards, study starred only | Quizlet | Adds `starred` to `Card` |
| 3 | Progress per card and quiz (new, learning, mastered), weakest cards | Quizlet, Kahoot reports | Stores results in the library |
| 4 | Study several quizzes or a whole course at once | Anki, Quizlet folders | Mixing topics helps exams |
| 5 | Typo tolerance in typed answers (small edit distance) | Quizlet | Change in `checkAnswer` |
| 6 | Image-only sides: a picture as the whole term or definition (no text) | Quizlet, Anki | Today a side always needs text. Multiple choice and typing need a text answer, so such a card is asked from its image side only |
| 7 | Matching game, timed, with best time | Quizlet Match | |
| 8 | More question types: true/false, ordering, multi-select | Kahoot, Quizizz | |
| 9 | Theme switcher (more themes) | | New `[data-theme]` block + toggle |
| 10 | Text-to-speech for terms and definitions | Quizlet, Memrise | Browser speech API, no dependency |
| 11 | Search across courses and cards | Quizlet | |
| 12 | Reorder and move quizzes and cards, duplicate a quiz | Quizlet | |
| 13 | Streaks and daily goal | Duolingo, Quizlet | |
| 14 | Timer and speed points per question | Kahoot, Quizizz | |
| 15 | Ghost mode: race your previous score | Kahoot | Needs #3 |
| 16 | CSV and Anki import/export | Anki | |
| 17 | Share one quiz as its own file | Quizlet | |
| 18 | Diagram labeling (image occlusion) | Quizlet, Anki | Builds on card images |
| 19 | Mnemonic field per card | Memrise | |
| 20 | Install as an app, works offline (PWA) | Quizlet, Anki | |
| 21 | Database storage adapter (accounts, sync) | | New `StorageAdapter` |
| 22 | AI card generation from notes | Quizlet, Knowt | Needs a backend or API key |
| 23 | Live multiplayer for study groups | Kahoot, Quizlet Live | Needs a backend |

## Not planned
- Spaced-repetition scheduler, confidence rating, exam countdown (removed by decision in step 1).
- Polls, word clouds, in-game currencies, teacher dashboards (they keep people engaged but teach little).
