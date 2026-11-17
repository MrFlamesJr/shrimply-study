"""Editor and quiz page card checks: Add cards focus, top Add box, moving (keys, grip, pointer), group Add box, deleting, Done."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import load_test_library  # noqa: E402

UNGROUPED = '.pairs > .pair'


def hrefs(page, parts_wanted):
    found = page.eval_on_selector_all('a[href^="#/"]', 'els => els.map(e => e.getAttribute("href"))')
    out = []
    for h in found:
        parts = [p for p in h[2:].split('/') if p]
        if len(parts) == parts_wanted and not parts[0].startswith('_') and h not in out:
            out.append(h)
    return out


def card_ids(page, selector=UNGROUPED):
    return page.eval_on_selector_all(selector, 'els => els.map(e => e.querySelector("[data-card]").dataset.card)')


def find_grouped_quiz(page, base):
    """A quiz whose editor has a group and at least two ungrouped cards."""
    page.goto(base + '#/')
    page.locator('h1').first.wait_for()
    for course in hrefs(page, 1):
        page.goto(base + course)
        page.locator('h1').first.wait_for()
        for quiz in hrefs(page, 2):
            page.goto(base + quiz + '/edit')
            page.locator('.pairs').wait_for()
            page.wait_for_timeout(100)
            if page.locator('.group-box').count() and len(card_ids(page)) >= 2:
                return quiz
    raise AssertionError('no quiz with a group and two ungrouped cards in the test library')


def active_card(page):
    return page.evaluate('() => { const e = document.activeElement; const c = e && e.closest("[data-card]") ? e.closest("[data-card]") : null; '
                         'return c ? { card: c.dataset.card, field: e.dataset.field || null } : null }')


def wait_order(page, expected, what):
    try:
        page.wait_for_function('exp => JSON.stringify([...document.querySelectorAll(".pairs > .pair")].map(e => e.querySelector("[data-card]").dataset.card)) === JSON.stringify(exp)',
                               arg=expected, timeout=3000)
    except Exception:
        raise AssertionError(f'{what}: expected order {[e[:4] for e in expected]}, got {[e[:4] for e in card_ids(page)]}')


def run(page, base):
    load_test_library(page, base)
    quiz = find_grouped_quiz(page, base)
    page.goto(base + quiz)
    page.locator('.quiz-rows').first.wait_for()
    total = page.locator('.quiz-rows > li').count()

    # "Add cards" opens the editor with the first pill of the top Add box focused.
    page.get_by_role('button', name='Add cards').click()
    page.locator('.pairs').wait_for()
    page.wait_for_function('() => document.activeElement && document.activeElement.closest(".pairs > .add-new")', timeout=3000)
    first_pill = page.evaluate('() => document.activeElement === document.querySelector(".pairs > .add-new button")')
    if not first_pill:
        raise AssertionError('Add cards: the first pill of the top Add box is not focused')
    before = card_ids(page)

    # Adding from the top box puts the card first and focuses its first field.
    page.keyboard.press('Enter')
    page.wait_for_function('n => document.querySelectorAll(".pairs > .pair").length === n', arg=len(before) + 1, timeout=3000)
    after = card_ids(page)
    new = after[0]
    if new in before or after[1:] != before:
        raise AssertionError(f'top Add box: new card not first among ungrouped: before {before}, after {after}')
    page.wait_for_function('id => { const e = document.activeElement; const c = e && e.closest("[data-card]"); return c && c.dataset.card === id }', arg=new, timeout=3000)
    field = active_card(page)['field']

    # Alt+Shift+ArrowDown moves it down one place and keeps focus in the same field.
    page.keyboard.press('Alt+Shift+ArrowDown')
    wait_order(page, [after[1], new] + after[2:], 'Alt+Shift+ArrowDown')
    page.wait_for_function('id => { const e = document.activeElement; const c = e && e.closest("[data-card]"); return c && c.dataset.card === id }', arg=new, timeout=3000)
    now = active_card(page)
    if now['field'] != field:
        raise AssertionError(f'Alt+Shift+ArrowDown: focus moved from field {field} to {now["field"]}')
    order = card_ids(page)

    # The grip with Space, ArrowDown, Space moves a card down.
    grip = page.locator(f'.pair:has([data-card="{new}"]) .pair-grip')
    grip.scroll_into_view_if_needed()
    grip.focus()
    page.keyboard.press('Space')
    page.wait_for_timeout(200)
    page.keyboard.press('ArrowDown')
    page.wait_for_timeout(300)
    page.keyboard.press('Space')
    expected = list(order)
    i = expected.index(new)
    if i + 1 >= len(expected):
        raise AssertionError('test library quiz has too few ungrouped cards for the grip check')
    expected[i], expected[i + 1] = expected[i + 1], expected[i]
    wait_order(page, expected, 'grip Space/ArrowDown/Space')

    # A pointer drag by the grip moves it back up above the previous card.
    grip = page.locator(f'.pair:has([data-card="{new}"]) .pair-grip')
    grip.scroll_into_view_if_needed()
    prev = page.locator(f'.pair:has([data-card="{expected[expected.index(new) - 1]}"])')
    gb = grip.bounding_box()
    pb = prev.bounding_box()
    x, y = gb['x'] + gb['width'] / 2, gb['y'] + gb['height'] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y - 10, steps=3)
    nb = page.locator(f'.pair:has([data-card="{new}"])').bounding_box()
    target = y + (pb['y'] - nb['y']) - 10
    page.mouse.move(x, target, steps=15)
    page.wait_for_timeout(200)
    page.mouse.up()
    j = expected.index(new)
    expected[j - 1], expected[j] = expected[j], expected[j - 1]
    wait_order(page, expected, 'pointer drag by the grip')

    # A group's own Add box is still at that group's end.
    last_is_add = page.evaluate('''() => [...document.querySelectorAll(".group-box .group-body > div")]
        .every(d => d.lastElementChild && d.lastElementChild.classList.contains("add-new"))''')
    if not last_is_add:
        raise AssertionError("a group's Add box is not the last thing in the group")
    box = page.locator('.group-box').first
    gcount = box.locator('.pair').count()
    box.locator('.add-new button').first.click()
    page.wait_for_function('n => document.querySelector(".group-box").querySelectorAll(".pair").length === n', arg=gcount + 1, timeout=3000)
    in_last = page.evaluate('() => { const ps = document.querySelector(".group-box").querySelectorAll(".pair"); const e = document.activeElement; return ps[ps.length - 1].contains(e) }')
    if not in_last:
        raise AssertionError("a card added from a group's Add box is not last in that group, or not focused")

    # Done drops the blank cards (the two just added).
    page.get_by_role('button', name='Done').click()
    page.locator('.quiz-rows').first.wait_for()
    if page.locator('.quiz-rows > li').count() != total:
        raise AssertionError(f'Done: expected {total} cards after dropping blanks, found {page.locator(".quiz-rows > li").count()}')

    # Deleting from a quiz page row (the trash shows on hover) removes the card.
    row = page.locator('.quiz-rows > li').first
    row.hover()
    row.get_by_role('button', name='Delete card').click()
    page.wait_for_function('n => document.querySelectorAll(".quiz-rows > li").length === n', arg=total - 1, timeout=3000)

    # Deleting from the card dialog removes it and closes the dialog.
    page.locator('.quiz-rows > li').first.get_by_role('button', name='Edit card').click()
    dialog = page.locator('dialog[open]')
    dialog.wait_for()
    dialog.locator('.pair-delete').click()
    page.wait_for_function('n => document.querySelectorAll(".quiz-rows > li").length === n', arg=total - 2, timeout=3000)
    if page.locator('dialog[open]').count():
        raise AssertionError('card dialog stayed open after deleting its card')

    # Deleting from the editor says so in a toast with an Undo button (the pane passes the workspace's undo); Ctrl+Z,
    # with the focus outside any field, brings the card back too.
    page.goto(base + quiz + '/edit')
    page.locator('.pairs').wait_for()
    before = len(card_ids(page))
    page.locator(UNGROUPED).first.get_by_role('button', name='Delete card 1').click()
    page.wait_for_function('n => document.querySelectorAll(".pairs > .pair").length === n', arg=before - 1, timeout=3000)
    toast = page.locator('.toast', has_text='Deleted card #1.').first
    toast.wait_for(timeout=3000)
    if toast.get_by_role('button', name='Undo').count() != 1:
        raise AssertionError('the deleted-card toast has no Undo button')
    page.evaluate('() => document.activeElement && document.activeElement.blur()')
    page.keyboard.press('Control+z')
    page.wait_for_function('n => document.querySelectorAll(".pairs > .pair").length === n', arg=before, timeout=3000)

    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
