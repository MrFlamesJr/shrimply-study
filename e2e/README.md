# Browser checks

Python Playwright scripts against a frozen build of the app.

Requirements: Python, `pip install playwright`, `playwright install chromium`, and `npm install` done.

Run from the repo root: `python -I e2e/run.py`. It builds the app into a temp folder, serves it with
`vite preview` on a free port, runs every module, prints PASS/FAIL, and kills the server tree after.

- `helpers.py`: `serve`, `open_app` (collects `page.errors`), `load_test_library`, `set_theme`, `shots` (a screenshot per theme), `contrast` (WCAG ratio of text against its effective background; glass is approximate), `THEMES`.
- `smoke.py`: home, course, quiz page, editor and a flashcards session render without errors.
- `workspace_files.py`: two open files from the debug page, the unsaved dot and `*` per file, Ctrl+Z, a reload that restores both (the right one active), closing with and without changes (Save / Don't save / Cancel).
- `run.py`: runs each module with a `run(page, base)` function (smoke first), each in a fresh page.

Add a check by dropping a new `e2e/<name>.py` with `run(page, base)`; start it with the `sys.path` line smoke.py has.
