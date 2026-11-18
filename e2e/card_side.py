"""A term card's side to ask: the compact bar in the editor and the card dialog (Front first or Random), right after the
sides, its mark on the quiz page, saved in library.json, and the longest side name never wrapping or spilling at 320px.
Also: the side type's naming dialog over the card dialog closes alone (Esc), never both."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

LONG = 'W' * 30  # SIDE_NAME_MAX, in the widest letter
LIBRARY = {
    'version': 3,
    'courses': [
        {
            'name': 'Side course',
            'quizzes': [
                {
                    'name': 'Side quiz',
                    'cards': [
                        {'term': 'cat', 'definition': 'chat'},
                        {'sides': [LONG, LONG], 'term': 'dog', 'definition': 'chien'},
                    ],
                }
            ],
        }
    ],
}
QUIZ = '#/side-course/side-quiz'
BAR = '.pair-head .segmented-field.is-compact'


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def measure(page, scope):
    """The bar of the card in `scope` (a locator): its height, and each segment's text overflow."""
    return scope.locator(BAR).first.evaluate(
        "el => ({ h: el.getBoundingClientRect().height,"
        " texts: [...el.querySelectorAll('.segmented-text')].map(t => ({ sw: t.scrollWidth, cw: t.clientWidth,"
        " to: getComputedStyle(t).textOverflow, ws: getComputedStyle(t).whiteSpace, title: t.closest('label').title })),"
        " gap: el.getBoundingClientRect().left - el.parentElement.querySelector('.sides-button').getBoundingClientRect().right })"
    )


def need_one_line(page, scope, where):
    m = measure(page, scope)
    need(m['h'] <= 52, f'{where}: the side bar should be one line (28px, 44px on touch), it is {m["h"]}px high')
    for t in m['texts']:
        need(t['sw'] <= t['cw'] or t['to'] == 'ellipsis', f'{where}: a segment spills ({t}) without an ellipsis')
        need(t['ws'] == 'nowrap', f'{where}: a segment should not wrap ({t})')
        need(t['title'], f'{where}: a segment should have its whole text as a tooltip ({t})')
    need(m['texts'][-1]['sw'] <= m['texts'][-1]['cw'], f'{where}: "Random" should stay whole, never cut: {m["texts"][-1]}')
    docs = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    need(docs <= 0, f'{where}: the page scrolls sideways by {docs}px')


def labels(scope):
    return scope.locator(BAR).first.locator('.segmented-text').all_inner_texts()


def picked(scope):
    return scope.locator(BAR).first.locator('input:checked').evaluate("i => i.closest('label').textContent")


def run(page, base):
    page.goto(base + '#/_debug')
    page.locator('textarea[aria-label="library.json"]').fill(json.dumps(LIBRARY))
    page.get_by_role('button', name='Load', exact=True).click()
    page.get_by_text('Loaded the library from the text.').first.wait_for()

    page.goto(base + QUIZ + '/edit')
    first = page.locator('.pair').nth(0)
    first.locator(BAR).wait_for(timeout=5000)
    need(labels(first) == ['Front first', 'Random'], f'the side bar should offer Front first and Random, got {labels(first)}')
    need(picked(first) == 'Front first', 'a card starts with its front first')
    gap = measure(page, first)['gap']
    need(4 <= gap <= 16, f'the bar sits right after the sides, with a small gap: {gap}px')
    first.locator(BAR).get_by_text('Random').click()
    need(picked(first) == 'Random', 'the card should be Random after picking it')

    page.goto(base + QUIZ)
    heads = page.locator('.row-head .pair-kind').all_inner_texts()
    need(heads[0] == 'Front / Back · Random', f'the random card should read "Front / Back · Random", got {heads}')
    need('Random' not in heads[1], f'the other card should not read Random, got {heads}')

    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Show current').click()
    cards = json.loads(page.locator('textarea[aria-label="library.json"]').input_value())['courses'][0]['quizzes'][0]['cards']
    need(cards[0].get('mixed') is True, f'library.json should hold "mixed": true, got {cards[0]}')
    need('mixed' not in cards[1], f'library.json should not write mixed for the other card, got {cards[1]}')

    # The longest side name at the narrowest window: the editor, then the card dialog.
    page.set_viewport_size({'width': 320, 'height': 800})
    page.goto(base + QUIZ + '/edit')
    second = page.locator('.pair').nth(1)
    second.locator(BAR).wait_for(timeout=5000)
    need(labels(second)[0] == f'{LONG} first', f'the long side name should be in the bar: {labels(second)}')
    need_one_line(page, second, 'editor at 320px')
    need_one_line(page, page.locator('.pair').nth(0), 'editor at 320px, the default names')

    page.goto(base + QUIZ)
    page.get_by_role('button', name='Edit card').nth(1).click()
    dialog = page.locator('dialog[open]')
    dialog.locator(BAR).wait_for(timeout=5000)
    need_one_line(page, dialog, 'card dialog at 320px')
    need(labels(dialog)[0] == f'{LONG} first', 'the dialog should show the long side name')

    # The naming dialog of a new side type over the card dialog: Esc closes it alone, the card dialog stays.
    dialog.locator('.sides-button').click()
    page.locator('.sides-new').click()
    page.wait_for_function("document.querySelectorAll('dialog[open]').length === 2")
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    need(page.locator('dialog[open]').count() == 1, f'Esc closes only the top dialog: {page.locator("dialog[open]").count()} open')
    need(not page.errors, f'errors: {page.errors}')
