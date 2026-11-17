"""Performance check: large libraries (the debug page's 2000-card stress quiz, the bio130 sample with images).
Prints a table of timings and fails only past generous ceilings, so it catches big regressions, not noise."""
import json
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import ROOT, load_test_library  # noqa: E402

BIO = os.path.join(ROOT, 'samples', 'bio130-les-vers.shrimp')
STRESS = '#/stress-test/2000-cards'
# Ceilings in ms, several times what a normal run takes.
CEILINGS = {
    'page 2000': 4000, 'editor 2000': 8000, 'type a character': 250,  # 150 once the :has() rules go (shell.css, dialogs.css)
     'move a card': 1500,
    'study start 2000': 4000, 'answer a card': 500, 'results 20': 1500, 'bio editor': 8000,
}

NAV = """
async ([hash, selector, min]) => {
  const t0 = performance.now()
  location.hash = hash
  await new Promise((done) => {
    const poll = () => (document.querySelectorAll(selector).length >= min ? done() : requestAnimationFrame(poll))
    poll()
  })
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return performance.now() - t0
}
"""


def nav(page, hash, selector, minimum=1):
    page.evaluate('() => { window.scrollTo(0, 0) }')
    return page.evaluate(NAV, [hash, selector, minimum])


def key_to(page, key, cond, target=None):
    """Milliseconds from pressing key (on target, else the page) until the page function cond is true (checked every frame)."""
    page.evaluate('() => { addEventListener("keydown", () => { window.__t0 = performance.now() }, { capture: true, once: true }) }')
    (target or page.keyboard).press(key)
    page.wait_for_function(f'() => ({cond}) && (window.__t1 = performance.now(), true)', polling='raf', timeout=20000)
    return page.evaluate('() => window.__t1 - window.__t0')


def replace(page, action):
    """Run a button that replaces the library, confirming the unsaved-changes question if it comes."""
    action()
    confirm = page.locator('dialog[open] .actions .primary')
    try:
        confirm.wait_for(timeout=1500)
        confirm.click()
    except Exception:
        pass


def round_of(page, hash, cards):
    """Start a flashcards round; answers `cards` cards. Returns (start ms, first answer ms, results ms)."""
    start = nav(page, hash + '/study/flashcards', '.session-stack')
    first = None
    for i in range(cards):
        page.keyboard.press(' ')
        t = key_to(page, '2', 'document.querySelector(".sheet")')
        if first is None:
            first = t
        if i < cards - 1:
            page.keyboard.press('Enter')
            page.wait_for_function('() => !document.querySelector(".sheet.is-docked, .sheet")', polling='raf')
    final = key_to(page, 'Enter', 'document.querySelector(".results-summary")') if cards else None
    return start, first, final


def run(page, base):
    rows = []
    add = lambda name, ms, note='': rows.append((name, ms, note))  # noqa: E731

    # A 20-card quiz, loaded from library.json text.
    small = {'version': 3, 'courses': [{'name': 'Small', 'quizzes': [{'name': 'Twenty', 'cards': [
        {'term': f'Term {i}', 'definition': f'Definition {i}'} for i in range(20)]}]}]}
    page.goto(base + '#/_debug')
    page.get_by_label('library.json').fill(json.dumps(small))
    page.get_by_role('button', name='Load', exact=True).click()
    page.get_by_text('Loaded the library from the text.').first.wait_for()
    start, first, results = round_of(page, '#/small/twenty', 20)
    add('study start 20', start)
    add('results 20', results, 'last Enter to results')

    # bio130 (456 cards with images), through the Open file button.
    page.goto(base + '#/_debug')
    page.evaluate('() => { window.showOpenFilePicker = undefined }')
    with page.expect_file_chooser() as chooser:
        replace(page, lambda: page.get_by_role('button', name='Open file').first.click())
    chooser.value.set_files(BIO)
    page.wait_for_timeout(1500)
    page.evaluate('() => { location.hash = "#/_debug" }')
    page.locator('.debug-stats').wait_for()
    page.wait_for_function('() => document.querySelector(".debug-stats").textContent.includes("456")', timeout=30000)
    largest = page.evaluate('() => [...document.querySelectorAll(".debug-stats dt")].find(d => d.textContent === "Largest quiz").nextSibling.textContent')
    name = largest.split('“')[1].split('”')[0]
    page.evaluate('() => { location.hash = "#/" }')
    page.locator('h1').first.wait_for()
    found = None
    for course in page.eval_on_selector_all('a[href^="#/"]', 'els => [...new Set(els.map(e => e.getAttribute("href")))]'):
        if len([p for p in course[2:].split('/') if p]) != 1 or course.startswith('#/_'):
            continue
        page.evaluate('h => { location.hash = h }', course)
        page.wait_for_timeout(300)
        for quiz in page.eval_on_selector_all('a[href^="#/"]', 'els => [...new Set(els.map(e => e.getAttribute("href")))]'):
            if len([p for p in quiz[2:].split('/') if p]) == 2:
                page.evaluate('h => { location.hash = h }', quiz)
                page.wait_for_timeout(300)
                if page.locator('h1').first.inner_text().strip() == name:
                    found = quiz
                    break
        if found:
            break
    if found:
        add('bio page', nav(page, '#/', 'h1') and nav(page, found, '.quiz-rows > li', 2), largest)
        add('bio editor', nav(page, found + '/edit', '.pair', 2), largest)
        pairs = page.locator('.pair').count()
        add('bio editor cards', pairs, 'count, not ms')
    else:
        print(f'bio130: quiz "{name}" not found, skipped')

    # The stress course.
    page.evaluate('() => { location.hash = "#/_debug" }')
    replace(page, lambda: page.get_by_role('button', name='Load test library').click())
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Add stress course').click()
    page.get_by_text('Added the stress course.').first.wait_for()
    page.wait_for_timeout(800)
    nav(page, '#/', 'h1')
    add('page 2000', nav(page, STRESS, '.quiz-rows > li', 2000))
    add('editor 2000', nav(page, STRESS + '/edit', '.pair', 1500), 'until 1500+ .pair in the DOM')
    add('editor cards', page.locator('.pair').count(), 'count, not ms')

    field = page.locator('.pairs > .pair textarea').first
    field.focus()
    page.evaluate('''() => {
      window.__lat = []
      addEventListener('keydown', () => {
        const t0 = performance.now()
        requestAnimationFrame(() => requestAnimationFrame(() => window.__lat.push(performance.now() - t0)))
      }, true)
    }''')
    for ch in 'abcde':
        page.keyboard.press(ch)
        page.wait_for_timeout(250)
    lat = page.evaluate('() => window.__lat')
    add('type a character', statistics.median(lat), f'median of {len(lat)}, max {max(lat):.0f}')

    first_id = page.evaluate('() => document.querySelector(".pairs > .pair [data-card]").dataset.card')
    field.focus()
    add('move a card', key_to(page, 'Alt+Shift+ArrowDown',
                              f'document.querySelectorAll(".pairs > .pair")[1].querySelector("[data-card]").dataset.card === "{first_id}"'))

    start, first, _ = round_of(page, STRESS, 0)
    add('study start 2000', start)
    page.keyboard.press(' ')
    add('answer a card', key_to(page, '2', 'document.querySelector(".sheet")'), 'grade to sheet')

    print(f'\n{"measure":<20}{"ms":>9}  note')
    for name, ms, note in rows:
        print(f'{name:<20}{ms:>9.0f}  {note}')
    print()
    over = [f'{n} took {ms:.0f} ms (ceiling {CEILINGS[n]})' for n, ms, _ in rows if n in CEILINGS and ms > CEILINGS[n]]
    if over:
        raise AssertionError('; '.join(over))
