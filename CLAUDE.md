# Shrimply Study (repo: StudyQuizWebApp)

React study app (flashcards, multiple choice, typing) hosted on GitHub Pages. The user's data is a `.shrimp` file they open and download.

## Workflow
- Build one step at a time, then stop. Don't start the next feature unasked.
- FEATURES.md is the ranked backlog. Update it at the end of every step.
- When the user asks for the "next step": suggest 1 to 3 `todo` items from FEATURES.md with a one-line reason each, then wait for their choice.

## Commands
- `npm run dev`, `npm run build`, `npm run preview`
- `npm test` (vitest), `npm run typecheck`
- Deploy: push to `main` and `.github/workflows/deploy.yml` publishes to https://mrflamesjr.github.io/shrimply-study/ (repo `MrFlamesJr/shrimply-study`, Pages source: GitHub Actions, already set).

## Architecture rules
- Storage only goes through `src/storage/`. Screens and state never touch files, zip, IndexedDB or localStorage directly (reading an image the user picks into a data URL, in `ImageSlot`, is input, not storage). A new backend is a new `StorageAdapter`, swapped in at the single `useLibrary(fileStorage)` line in `App.tsx`.
- File format: one format only (version 1), no migrations or fallbacks while the app is unreleased. `library.json` has no ids and nests a quiz's grouped cards under `groups`; they are added in memory on open. Change `format.ts` in place.
- Every color, font, radius and spacing value is a token in `src/theme/themes.css`. No hex/rgb values anywhere else. A new theme is a new `[data-theme="..."]` block.
- Pure logic lives in `src/logic/` with a test file next to it.

## Minimal code
- Ask before adding any dependency.
- Smallest code that works. No abstraction until something is needed twice. Plain CSS; no UI kit, router or state library. Props, not context.
- Keep the file map below accurate when adding files.

## Visual style
- Dark, high contrast, calm, easy on the eyes during long study sessions.
- Banned: gradients (except the toast stack's fade-out mask, asked for), shadows, glow, blur/glassmorphism, emoji, icon packs (hand-drawn inline SVG in `Icons.tsx` is fine), purple or neon accents, big rounded cards, decorative animation.
- Motion: short functional transitions only (segmented slide, sidebar, card flip, feedback bar, panels), timing tokens `--dur-*`, off under `prefers-reduced-motion`. Keep them snappy: hover and UI changes 70 to 140ms, the card flip 300ms; slower feels unresponsive.
- Calm selection: tinted fill plus thin accent border, not solid gold. One gold button per screen.
- Layout: hub-and-spoke (Home > Course > Quiz > Study): a course > quiz sidebar that closes to nothing (brand + toggle stay top left), breadcrumbs in a plain top row that stays put. Separate areas by tone and space, not divider lines. Each page has one primary action. Pages are capped by `--content-w`; study sessions are full screen (`--session-w` column), with a bottom feedback sheet after each answer (snaps up for more info) and a results screen at the end. Everything is reachable by keyboard; 44px touch targets below 800px.
- Inspired by how Quizlet and Kahoot structure studying, never their branding, colors or shapes.
- UI text: plain, short, sentence case. No em dashes.
- Dropdowns use the global `select` style (customizable select where supported).
- No box in a box: inside a filled box, text fields are underlined, pick-one bars get a thin outline (no fill) and fill only the chosen segment, selects are quiet until hovered. Cards in a group box are see-through boxes (the editor's style, on the quiz page too): inside a group box the `--surface*` tokens swap to see-through ones so the tint shows; popups use `--popup` (always solid).
- Buttons whose effect isn't obvious from the label (and icon-only buttons) get a native `title` tooltip.
- Icon-only buttons never fill on hover: the icon goes from `--text-muted` to `--text` (delete card: `--bad`) and springs up a size (the SVG's width and height, not a transform, so it stays sharp).
- Anywhere a card is shown, it can be edited: a pencil that opens `CardDialog`.
- Image previews (thumbnails) are always square, cropped to fill; only study shows an image whole. A side's text never shows without its image: wherever a term, definition or statement appears (cards, rows, choices, the sheet's answer), its image or its preview (`thumb` from `CardRow`) goes with it. Removing an image is a small ✕ badge hanging over its thumbnail's top-right corner (positioned, so it takes no layout room; quiet, never red), never a loose ✕. Deleting a card is a trash icon, so it never looks like that badge. Adding or removing an image never moves the field.

## Delegation
The global cost rules in `~/.claude/CLAUDE.md` apply. In agent briefs, point to the file map and contracts below instead of asking the agent to explore.

## File map
- `src/model.ts`: data types (Library > Course > Quiz > Card; a card is a term card or a fill-in-the-blank `ClozeCard`, plus `Group` per quiz; `Card.group` is a group id; images `termImage`, `definitionImage`, a cloze card's `image` are data URLs), `IMAGE_TYPES` (extension > type), `SIDE_IMAGE` (side > its image field), study types, `GROUP_NAME_MAX`, `newId`, `emptyLibrary`
- `src/route.ts`: hash routes `#/`, `#/course/<id>`, `#/quiz/<id>`, `#/quiz/<id>/edit`, `#/quiz/<id>/study/<format>`, `#/debug` (not linked); `href`, `go`, `goToNew` + `takeCreated` (select a just-created name once), `redirect`, `useRoute`
- `src/state/useLibrary.ts`: `LibraryApi`, the only data API the UI uses (`ready` once the backup is read, App renders nothing before; edits, `hasChanges`, backup sync 300ms after the last edit, close warning, open/download)
- `src/storage/StorageAdapter.ts`: `{ loadLabel, saveLabel, loadHint, saveHint, load(), save(library) }`
- `src/storage/format.ts`: `.shrimp` = zip with `library.json` and `images/` (an image field names a file there, `"termImage": "1.png"`; written numbered in write order, one file per distinct image, stored uncompressed; unnamed files ignored; a cloze card is `{ "type": "cloze", "statement", "explanation"? }`: `{ }` marks blanks, `\{ \} \\` are literal, explanation is text for one blank or a list with one entry per blank; in memory always a list, null for none and "" for one opened in the editor but still empty); `libraryToJson(library, images?)` (no ids, one card per line, groups nested with an optional `color` and written only when there are some; fills `images` with data URL > file name), `libraryFromJson(text, files?)`, `checkLibrary(data, 'new' | 'stored', files?)` (strict, errors name the spot; a file can not have an empty or spaces-only name; stored images are data URLs), `encodeLibrary`, `decodeLibrary`
- `src/storage/fileStorage.ts`: the file adapter (file picker, download)
- `src/storage/browserBackup.ts`: IndexedDB copy (one JSON text) of the in-memory library (with ids, so reloads keep the URL, and images) and changed ids; async
- `src/logic/`: `checkAnswer`, `parseCards` (Quizlet, tab, dash paste), `buildRound` (same-group wrong answers first) and `usableCards`, `cardStatus` (`isBlank`, `missingPart`, `unfinishedMessage`), `groups` (`inGroupOrder`: ungrouped cards first, then each group; `nextColor`: first unused group color), `cloze` (parse/write `{ }` blanks, `markBlank`, `shiftBlanks`), `mixUp` (`mixedUpWith`: which other card a wrong answer belongs to), `plural`, `pushToast` (dedupe, never drops), `canScroll` (can a scroll box move further)
- `src/App.tsx`: shell (2x2 grid: corner | top row, sidebar | page), route switch (study routes render full screen without them), Ctrl+S, `*` in the tab title when unsaved, remembered study prefs (`Prefs` = `StudyOptions`: format, side, shuffle)
- `src/layout/Sidebar.tsx`: corner box (brand + toggle, outside the nav so both stay when closed; below 400px the brand is just the shrimp) and the course > quiz tree with "+ New course" at the bottom; closes to width 0 (animated); below 800px a full-height drawer headed by the corner, a click outside it (not darkened) closes it; crossing 800px (resize or zoom) resets it: open when wide, closed when narrow
- `src/layout/TopBar.tsx`: top row on the page background: breadcrumbs starting at Home, lined up with the page content (a "‹ parent" link on mobile), open, download
- `src/screens/`: `HomeScreen` (onboarding or course list), `CourseScreen`, `QuizScreen` (hub: Edit quiz + Start next to the title, study options, card list of `CardRow`s with numbers), `EditScreen` (one box per term/definition pair plus an optional explanation, an `ImageSlot` beside the term, the definition and a statement, in sections: ungrouped, then each group with a name, Ungroup and a per-card move select; one `put` write path, half-filled cards marked in red only after a blocked Done (error toast + shake), Import opens `ImportDialog`), `StudyScreen` (flip cards, a side's image above its text, pencil on the card opens `CardDialog` and updates the round, session > feedback sheet with the answer and mix-up, explanation (and, for choice and typing, the answer side's image) under "More info" > results (score panel with Back to quiz, Study again, Retry missed; every question of the round as a `CardRow` with a right/missed mark, what was picked or typed, and an All / Missed / Right / Marked filter); long card text scrolls inside the card, arrow keys too), `DebugScreen` (test tools: trigger toasts)
- `src/components/CardRow.tsx`: one card in a `.card-rows` list (quiz page, results): a lead column (number or mark, width `--lead-w`), term and definition with thumbnails and explanation, or the statement (all blanks, or one revealed with `blank`), an optional `note` row, and the pencil. Use it for every card list
- `src/components/QuizTiles.tsx`: quiz tile grid shared by Home and Course
- `src/components/Modal.tsx`: `Modal` (native `<dialog>` with title and ✕, focuses the first text field; `narrow` for small forms) and `closeModal(element)`. Use it for every modal
- `src/components/ImportDialog.tsx`: paste import with preview; adds the cards with no group, to an existing group or to a new one
- `src/components/ClozeText.tsx`: renders a statement with blanks as `marks` (stacked colored dashed underlines), `gap`, or `reveal` (that blank's underline only); `blankColor(i)`
- `src/components/ClozeField.tsx`: the fill-in-the-blank editor (statement box with underline overlay and the card's `ImageSlot`, Mark as blank, per-blank explanations)
- `src/components/ImageSlot.tsx`: wraps a field with one image beside it: image button, or square thumbnail (click to replace) with a ✕ badge on its corner; paste or drop an image on the field (text paste stays text); scales big images down to 1600px and keeps WebP when smaller; a spinner takes the same square while an image is read. Use it for every card image
- `src/components/CardDialog.tsx`: edit one card's term, definition, explanation and images (used while studying, in the results and from the quiz page)
- `src/components/Toasts.tsx`: `useToasts` (in App), `Toasts` stack (a top-layer popover fixed bottom right, moved back on top whenever a dialog or popover opens; CSS lifetime bar, older ones clipped until hovered, then scrollable), `Notify` (passed to `useLibrary` for info, warnings, errors)
- `src/components/AutoText.tsx`: textarea that grows to fit its text; `onEnter` makes it single-line, `selectOnMount` focuses and selects it once, `counter` (with `maxLength`) shows a live "12/50" while focused, `required` never passes on empty or spaces-only text (names). Use it for every text field
- `src/components/Segmented.tsx`: pick-one bar (native radios, sliding indicator, a `hint` per option; all hints share one cell so switching keeps the height). Use it for every one-of-many choice
- `src/components/FeedbackSheet.tsx`: bottom sheet below the study column, which it pushes up (the column is its own scroll box and shrinks); only when there is `more` (an explanation) can it open, and only with the round button above it; the answer box is capped and scrolls; writes `--sheet-peek` (the column gives back that much bottom room, so a closed sheet doesn't move the question); its top line drags to resize it (`--sheet-h` on the sheet, dropped once it has closed); `is-moving` hides the session's scrollbars until it has settled
- `src/components/Shortcut.tsx`: shortcut hint (one keycap box), visual only, hidden on touch. Use it for every key hint
- `src/components/ColorPicker.tsx`: a group's color dot; clicking it pops out the swatch palette to its left (below when there is no room), native popover + anchor positioning
- `src/components/Icons.tsx`: inline SVG icons (`PencilIcon`, `PlayIcon`, `ChevronDownIcon`, `CheckIcon`, `CrossIcon`, `GroupIcon`, `ImageIcon`, `TrashIcon`, `PlusIcon` for every add/new button, `ChevronsLeftIcon` for the sidebar toggle, `ShrimpIcon` the filled brand mark, colored by `--brand-*`); icon buttons hold an SVG, never a text glyph
- `samples/edge-cases.shrimp`: test library (every feature and edge case, valid file); open it in the app to check a change
- `samples/how-to-use.shrimp`: short guide to the app and the file format (every JSON field, with the rules as cards), also unzipped in `samples/how-to-use/` as a template to generate quizzes from; update both when `format.ts` changes
- `public/favicon.svg`: the shrimp brand mark (same paths as `ShrimpIcon`; its own colors, as tokens can not reach it)
- `src/theme/themes.css`: tokens (`--brand-*` logo colors, `--group-*` group colors, `--corner-w` closed corner, `--content-w` page column, `--session-w` study column, `--card-img-h` study image, `--thumb-h` / `--thumb-list-h` thumbnails); `src/theme/base.css`: styles that use the tokens
