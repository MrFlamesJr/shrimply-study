"""The Explorer's head stays put and only its tree scrolls: with every node open, wheeling over the tree moves the tree
(few rows drawn), never the pane or the head. Also at 390px wide, in a split and in a popped-out window."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def expand_all(page):
    """Opens every node, top to bottom: the next closed row among the drawn ones, scrolling on when none is left."""
    tree = page.locator('.explorer .kit-tree')
    tree.evaluate('e => { e.scrollTop = 0 }')
    for _ in range(1500):
        closed = tree.locator('.kit-row[aria-expanded=false]')
        if closed.count():
            closed.first.locator('[data-chevron]').click()
            continue
        before = tree.evaluate('e => e.scrollTop')
        tree.evaluate('e => { e.scrollTop += e.clientHeight * 0.8 }')
        page.wait_for_timeout(50)
        if tree.evaluate('e => e.scrollTop') == before:
            break
    tree.evaluate('e => { e.scrollTop = 0 }')


def check(pg, which, explorer=0):
    """Wheel over one Explorer in a page: the head stays, the pane does not scroll, the tree does and draws few rows."""
    ex = pg.locator('.explorer').nth(explorer)
    tree = ex.locator('.kit-tree')
    tree.scroll_into_view_if_needed()
    top = ex.locator('.explorer-top').bounding_box()
    box = tree.bounding_box()
    pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    pg.mouse.wheel(0, 700)
    pg.wait_for_timeout(300)
    pg.mouse.wheel(0, 700)
    pg.wait_for_timeout(300)
    need(ex.locator('.explorer-top').bounding_box() == top, f'{which}: the head stays where it is')
    pane = ex.evaluate("e => e.closest('.pane-body').scrollTop")
    need(pane == 0, f'{which}: the pane does not scroll: {pane}')
    scrolled = tree.evaluate('e => e.scrollTop')
    need(scrolled > 0, f'{which}: the tree scrolls: {scrolled}')
    rows = tree.evaluate("e => [e.querySelectorAll('.kit-row').length, e.querySelector('.kit-row').getBoundingClientRect().height, e.scrollHeight]")
    need(rows[0] < rows[2] / rows[1], f'{which}: only the rows near the window are drawn: {rows}')
    tree.evaluate('e => { e.scrollTop = 0 }')


def run(page, base):
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Load guide').click()
    page.get_by_text('Loaded the guide.').first.wait_for()
    page.goto(base + '#/')
    page.locator('body').click(position={'x': 5, 'y': 790})
    page.keyboard.press('Control+Shift+E')
    page.locator('.explorer .kit-tree .kit-row').first.wait_for()
    expand_all(page)
    check(page, 'wide')

    page.set_viewport_size({'width': 390, 'height': 800})
    page.wait_for_timeout(300)
    check(page, '390px')
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.wait_for_timeout(300)

    # In a split: the Explorer's tab copied into a second group.
    page.locator('[role=tab]', has_text='Explorer').first.click()
    page.keyboard.press('Control+Backslash')
    page.wait_for_function("document.querySelectorAll('.wb-cell .wb-group').length >= 2")
    count = page.locator('.explorer').count()
    for i in range(count):
        if page.locator('.explorer').nth(i).is_visible():
            check(page, f'split {i}', i)

    # In a popped-out window.
    with page.context.expect_page() as info:
        page.locator('[role=tab]', has_text='Explorer').first.click(button='right')
        page.get_by_role('menuitem', name='Move to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup .explorer .kit-row')
    expand_all(pop)
    check(pop, 'popped out')
    pop.get_by_role('button', name='Dock').click()
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
