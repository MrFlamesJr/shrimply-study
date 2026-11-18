"""Drag and drop: the editor's cards (stay in their section, drop where the gap showed, no autoscroll on grabbing), the
steps of a sequence in the editor and in study, tabs between strips, panes and windows, the Explorer's nodes onto
panes and strips and never onto a tab's drop, a tab refused where it can not split, links, images and files from the
computer that must not be dragged or dropped natively, and our own payload never landing in a text field."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import load_test_library  # noqa: E402
from kit import center, drag  # noqa: E402


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def wait_for(page, check, what, timeout=5000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(what)


def term(term, definition='x'):
    return {'term': term, 'definition': definition}


TALL = 'A long definition that takes many lines. ' * 14


def library():
    """Six ungrouped cards (the third tall), a group of four, a group of four."""
    return {
        'version': 3,
        'courses': [{
            'name': 'C',
            'quizzes': [{
                'name': 'Q',
                'cards': [term('U1'), term('U2'), term('U3', TALL), term('U4'), term('U5'), term('U6')],
                'groups': [
                    {'name': 'Ga', 'color': 'moss', 'cards': [term('A1'), term('A2'), term('A3'), term('A4')]},
                    {'name': 'Gb', 'cards': [term('B1'), term('B2'), term('B3'), term('B4')]},
                ],
            }],
        }],
    }


def open_editor(page, base, height=2600):
    page.set_viewport_size({'width': 1280, 'height': height})
    if not getattr(page, 'has_file', False):
        load_test_library(page, base)
        page.has_file = True
    page.goto(base + '#/_debug')
    page.locator('textarea[aria-label="library.json"]').fill(json.dumps(library()))
    page.get_by_role('button', name='Load', exact=True).click()
    page.get_by_text('Loaded the library from the text.').first.wait_for()
    page.goto(base + '#/c/q/edit')
    page.locator('.pairs .pair').first.wait_for()


def order(page):
    return page.locator('.pairs .pair').evaluate_all("els => els.map(e => e.querySelector('textarea').value)")


def card(page, name):
    return page.locator('.pairs .pair').evaluate_all(
        "(els, n) => els.findIndex(e => e.querySelector('textarea').value === n)", name)


def card_box(page, name):
    i = card(page, name)
    need(i >= 0, f'card {name} not found')
    return page.locator('.pairs .pair').nth(i).bounding_box(), page.locator('.pairs .pair').nth(i).locator('.pair-grip').bounding_box()


def scroller(page):
    return page.locator('.pane-body').first


def scroll_top(page):
    return scroller(page).evaluate('el => el.scrollTop')


def scroll_to_card(page, name):
    i = card(page, name)
    page.locator('.pairs .pair').nth(i).scroll_into_view_if_needed()
    page.wait_for_timeout(100)


def pick_up(page, name, dy=0):
    """Mouse down on a card's grip and a first move (the drag starts)."""
    scroll_to_card(page, name)
    _, g = card_box(page, name)
    x, y = center(g)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + 12, steps=4)
    return x, y + 12


def lift_gap(page):
    """The lifted card's distance in from the cards' box, at its top and at its bottom (0 at the edge, below 0 out)."""
    return page.evaluate("() => { const l = document.querySelector('.pair-lift').getBoundingClientRect(), b = document.querySelector('.pairs').getBoundingClientRect();"
                         " return { top: l.top - b.top, bottom: b.bottom - l.bottom } }")


def group_of(page, name):
    """The name of the group box a card is in, or None."""
    return page.locator('.pairs .pair').evaluate_all(
        "(els, n) => { const e = els.find(e => e.querySelector('textarea').value === n); const g = e && e.closest('.group-box');"
        " return g ? g.querySelector('[aria-label=\"Group name\"]').value : null }", name)


def editor_cards(page, base):
    # G6: a card goes past its section's ends into another section (asked for: in and out of groups), and the page stops
    # scrolling at the end of the list.
    open_editor(page, base)
    need(order(page) == ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'],
         f'the test library loads in order: {order(page)}')
    x, y = pick_up(page, 'A1')
    page.mouse.move(x, y + 1500, steps=30)
    page.wait_for_timeout(1500)
    top_a = scroll_top(page)
    page.wait_for_timeout(500)
    need(abs(scroll_top(page) - top_a) < 2, f'the page stops scrolling at the end of the list: {top_a} then {scroll_top(page)}')
    need(abs(lift_gap(page)['bottom']) <= 1, f'the lifted card stops exactly at the end of the cards: {lift_gap(page)}')
    page.mouse.up()
    page.wait_for_timeout(300)
    got = order(page)
    need(got == ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'A1'] and group_of(page, 'A1') == 'Gb',
         f'a card dropped far below the list goes last in the last group: {got}, in {group_of(page, "A1")}')

    open_editor(page, base)
    x, y = pick_up(page, 'U6')
    page.mouse.move(x, y - 1500, steps=30)
    page.wait_for_timeout(300)
    need(abs(lift_gap(page)['top']) <= 1, f'the lifted card stops exactly at the top of the cards: {lift_gap(page)}')
    page.mouse.up()
    page.wait_for_timeout(300)
    need(order(page)[:6] == ['U6', 'U1', 'U2', 'U3', 'U4', 'U5'], f'dropped above the first card: {order(page)}')

    # Out of a group: A2 held with its middle in the top half of U4 moves before U4 at once, in no group, and stays there.
    open_editor(page, base)
    x, y = pick_up(page, 'A2')
    dbox, _ = card_box(page, 'U4')
    sbox, _ = card_box(page, 'A2')
    ty = y + (dbox['y'] + dbox['height'] * 0.3) - (sbox['y'] + sbox['height'] / 2)
    page.mouse.move(x, ty, steps=20)
    page.wait_for_timeout(300)
    slot = page.locator('.pairs .pair.is-dragging')
    need(slot.evaluate("e => !e.closest('.group-box')"), 'while held, its place is already out of the group')
    u4, _ = card_box(page, 'U4')
    need(slot.bounding_box()['y'] < u4['y'], f'and the cards made way: its place is above U4 ({slot.bounding_box()["y"]:.0f} vs {u4["y"]:.0f})')
    need(page.locator('.pair.is-lifted').count() == 1, 'the card itself is lifted over the page')
    page.mouse.up()
    page.wait_for_timeout(300)
    got = order(page)
    need(got[:7] == ['U1', 'U2', 'U3', 'A2', 'U4', 'U5', 'U6'] and group_of(page, 'A2') is None, f'a card dragged out of its group: {got}, in {group_of(page, "A2")}')
    need(page.locator('[data-drop]').count() == 0, 'no mark is left after the drop')
    page.keyboard.press('Control+z')
    wait_for(page, lambda: order(page)[6:10] == ['A1', 'A2', 'A3', 'A4'], 'Ctrl+Z puts it back in its group in one step')

    # By the head, not only the grip (asked for): grabbed on its number, U5 goes into group Ga, after A1.
    open_editor(page, base)
    scroll_to_card(page, 'U5')
    num = page.locator('.pairs .pair').nth(card(page, 'U5')).locator('.pair-num').bounding_box()
    x, y = center(num)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + 12, steps=4)
    dbox, _ = card_box(page, 'A1')
    sbox, _ = card_box(page, 'U5')
    ty = y + 12 + (dbox['y'] + dbox['height'] * 0.3) - (sbox['y'] + sbox['height'] / 2)
    page.mouse.move(x, ty, steps=20)
    page.wait_for_timeout(300)
    # In the group now (its place before A1, which made way): the pointer on down into the lower part of A1.
    dbox, _ = card_box(page, 'A1')
    page.mouse.move(x, dbox['y'] + dbox['height'] * 0.75, steps=10)
    page.wait_for_timeout(300)
    page.mouse.up()
    page.wait_for_timeout(300)
    got = order(page)
    need(got[:9] == ['U1', 'U2', 'U3', 'U4', 'U6', 'A1', 'U5', 'A2', 'A3'] and group_of(page, 'U5') == 'Ga', f'dragged by its head into a group: {got}, in {group_of(page, "U5")}')

    # G7: the card lands where the gap showed: dropped with its middle over a card (tall one included), it takes that place.
    for src, dst, want in (
        ('U1', 'U4', ['U2', 'U3', 'U4', 'U1', 'U5', 'U6']),
        ('U1', 'U3', ['U2', 'U3', 'U1', 'U4', 'U5', 'U6']),
        ('U5', 'U3', ['U1', 'U2', 'U5', 'U3', 'U4', 'U6']),
        ('U6', 'U2', ['U1', 'U6', 'U2', 'U3', 'U4', 'U5']),
    ):
        open_editor(page, base)
        x, y = pick_up(page, src)
        dbox, _ = card_box(page, dst)
        sbox, _ = card_box(page, src)
        # Middle of the dragged card over the middle of the target.
        ty = y + (dbox['y'] + dbox['height'] / 2) - (sbox['y'] + sbox['height'] / 2)
        page.mouse.move(x, ty, steps=20)
        page.wait_for_timeout(300)
        page.mouse.up()
        page.wait_for_timeout(300)
        need(order(page)[:6] == want, f'{src} dropped over {dst}: wanted {want}, got {order(page)[:6]}')

    # A collapsed group: a card dropped on its head joins it at its end, and the group opens to show it.
    open_editor(page, base)
    page.locator('.group-box').first.locator('.group-head button[aria-expanded]').first.click()
    page.wait_for_timeout(400)
    x, y = pick_up(page, 'U2')
    head = page.locator('.group-box').first.locator('.group-head').bounding_box()
    sbox, _ = card_box(page, 'U2')
    page.mouse.move(x + 200, head['y'] + head['height'] / 2, steps=25)
    page.wait_for_timeout(300)
    need(page.locator('.group-box').first.locator('.group-head').get_attribute('data-drop') == 'inside', 'the collapsed group\'s head is marked')
    page.mouse.up()
    page.wait_for_timeout(300)
    got = order(page)
    need(got[:5] == ['U1', 'U3', 'U4', 'U5', 'U6'] and got[5:10] == ['A1', 'A2', 'A3', 'A4', 'U2'], f'dropped on a collapsed group: {got}')
    need(page.locator('.group-box').first.locator('.group-head button[aria-expanded]').first.get_attribute('aria-expanded') == 'true', 'the group opens')

    # G8: grabbing a card near the pane's top or bottom never scrolls; autoscroll starts once it moved and nears the edge.
    open_editor(page, base, 800)
    pane = scroller(page).bounding_box()
    # Scrolled so a card's grip sits within the bottom 90px of the pane (twice: what scrolls into view may settle).
    for _ in range(2):
        scroller(page).evaluate('''el => {
          const r = el.getBoundingClientRect()
          // Only shown grips: a collapsed group's cards have no place on the page.
          const grips = [...el.querySelectorAll('.pair-grip')].filter((g) => g.getClientRects().length > 0)
          const want = grips[grips.length - 3]
          el.scrollTop += want.getBoundingClientRect().top - (r.bottom - 50)
        }''')
        page.wait_for_timeout(300)
    before = scroll_top(page)
    grip_box = scroller(page).locator('.pair-grip').evaluate_all(
        '(els, bottom) => els.map(e => e.getBoundingClientRect()).filter(r => r.top < bottom && r.top > bottom - 90).map(r => ({x: r.x, y: r.y, width: r.width, height: r.height}))',
        pane['y'] + pane['height'])
    need(grip_box, 'a grip near the pane\'s bottom')
    x, y = center(grip_box[0])
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + 2, steps=2)
    page.wait_for_timeout(600)
    need(abs(scroll_top(page) - before) < 2, f'grabbing a card near the pane\'s bottom scrolls nothing: {before} then {scroll_top(page)}')
    page.mouse.up()
    page.wait_for_timeout(200)

    open_editor(page, base, 800)
    pane = scroller(page).bounding_box()
    scroller(page).evaluate('el => { el.scrollTop = 0 }')
    page.wait_for_timeout(200)
    g = page.locator('.pairs .pair-grip').first.bounding_box()
    x, y = center(g)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + 2, steps=2)
    page.wait_for_timeout(500)
    need(scroll_top(page) == 0, f'grabbing the first card at the top scrolls nothing: {scroll_top(page)}')
    page.mouse.move(x, y + 300, steps=10)
    page.mouse.move(x, pane['y'] + pane['height'] - 20, steps=10)
    page.wait_for_timeout(700)
    need(scroll_top(page) > 0, f'a card moved to the pane\'s bottom edge scrolls the pane: {scroll_top(page)}')
    page.mouse.up()
    page.wait_for_timeout(200)
    need(page.evaluate('window.scrollY') == 0, 'the window itself never scrolls')


def sequence_library():
    steps = ['S1', 'S2', 'S3', 'S4']
    return {
        'version': 3,
        'courses': [{
            'name': 'C',
            'quizzes': [
                {'name': 'Q', 'cards': [{'type': 'sequence', 'title': 'Order', 'steps': steps}]},
            ],
        }],
    }


def load_library(page, base, data):
    if not getattr(page, 'has_file', False):
        load_test_library(page, base)
        page.has_file = True
    page.goto(base + '#/_debug')
    page.locator('textarea[aria-label="library.json"]').fill(json.dumps(data))
    page.get_by_role('button', name='Load', exact=True).click()
    page.get_by_text('Loaded the library from the text.').first.wait_for()


def step_texts(page):
    return page.locator('.step-list .entry.is-step').evaluate_all(
        "els => els.map(e => e.querySelector('textarea') ? e.querySelector('textarea').value : e.textContent.trim())")


def press_drag(page, start, end_y, hold=200):
    """Mouse down at `start`, a small move, then to end_y (same x), release."""
    x, y = start
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x, y + (8 if end_y > y else -8), steps=3)
    page.mouse.move(x, end_y, steps=15)
    page.wait_for_timeout(hold)
    page.mouse.up()
    page.wait_for_timeout(300)


def steps(page, base):
    # A sequence's steps in the editor: dragged by the grip, held to the list.
    load_library(page, base, sequence_library())
    page.goto(base + '#/c/q/edit')
    page.locator('.step-list .entry-grip').first.wait_for()
    need(step_texts(page) == ['S1', 'S2', 'S3', 'S4'], f'the steps load in order: {step_texts(page)}')
    tile = lambda i: page.locator('.step-list .entry.is-step').nth(i).bounding_box()
    grip = lambda i: center(page.locator('.step-list .entry-grip').nth(i).bounding_box())
    press_drag(page, grip(0), tile(2)['y'] + tile(2)['height'] / 2)
    need(step_texts(page) == ['S2', 'S3', 'S1', 'S4'], f'a step dropped over the third takes its place: {step_texts(page)}')
    press_drag(page, grip(2), tile(3)['y'] + 600)
    need(step_texts(page) == ['S2', 'S3', 'S4', 'S1'], f'a step dragged far below goes last: {step_texts(page)}')
    press_drag(page, grip(3), tile(0)['y'] - 600)
    need(step_texts(page) == ['S1', 'S2', 'S3', 'S4'], f'a step dragged far above goes first: {step_texts(page)}')

    # The same tiles when put in order while studying, dragged from anywhere on a tile.
    page.goto(base + '#/c/q/study/choice')
    page.locator('.session-stack').wait_for()
    need(page.locator('.step-list .entry.is-whole').count() == 4, 'a sequence question shows its steps as tiles')
    before = step_texts(page)
    t2 = page.locator('.step-list .entry.is-whole').nth(2).bounding_box()
    press_drag(page, center(page.locator('.step-list .entry.is-whole').nth(0).bounding_box()), t2['y'] + t2['height'] / 2)
    need(step_texts(page) == [before[1], before[2], before[0], before[3]], f'a study tile dragged from anywhere on it: {before} then {step_texts(page)}')


def wb_groups(page):
    return page.locator('.wb-cell .wb-group')


def group_with(page, text, other=False):
    """The group holding a tab titled `text` (or, with `other`, a tab that is not titled so)."""
    for i in range(wb_groups(page).count()):
        g = wb_groups(page).nth(i)
        tabs = g.locator('[role=tab]').all_inner_texts()
        if any((text in t) != other for t in tabs):
            return g
    raise AssertionError(f'no group with a tab {"other than " if other else ""}{text}')


def cancel_drag(page):
    """Lets go over the sidebar, where nothing takes a drop."""
    page.mouse.move(60, 500, steps=5)
    page.mouse.up()
    page.wait_for_timeout(200)


def workbench_tabs(page, base):
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.goto(base + '#/')
    page.keyboard.press('Control+Shift+E')
    page.locator('[role=tab]', has_text='Explorer').wait_for()
    explorer = group_with(page, 'Explorer')
    files = group_with(page, 'Explorer', other=True)
    explorer.locator('[role=tab]', has_text='Explorer').click()
    page.locator('.kit-tree [role=treeitem]').first.wait_for()
    file_tab = files.locator('[role=tab]').first
    pane = explorer.locator('.wb-pane').bounding_box()

    # A tab over the Explorer's rows is the pane's business: its drop zone shows, the tree shows nothing of its own.
    row = page.locator('.kit-tree [role=treeitem]').first.bounding_box()
    drag(page, center(file_tab.bounding_box()), center(row), hold=200, release=False)
    need(page.locator('.kit-tree-drop-label').count() == 0, 'a tab over the Explorer shows no refusal text')
    need(page.locator('.kit-tree [class*="is-drop-"]').count() == 0, 'a tab over the Explorer highlights no row')
    need(page.locator('.kit-dropzone').count() == 1, 'the pane takes the tab over the Explorer')
    cancel_drag(page)

    # An Explorer node over a strip or a pane shows nothing (only a tab is a drop there).
    strip = files.locator('[role=tablist]').bounding_box()
    node = page.locator('.kit-tree [role=treeitem]').first
    drag(page, center(node.bounding_box()), (strip['x'] + strip['width'] / 2, strip['y'] + strip['height'] / 2), hold=150, release=False)
    need(page.locator('.kit-tab-drop').count() == 0, 'an Explorer node shows no drop line on a strip')
    fp = files.locator('.wb-pane').bounding_box()
    page.mouse.move(fp['x'] + fp['width'] - 15, fp['y'] + fp['height'] / 2, steps=8)
    page.wait_for_timeout(100)
    need(page.locator('.kit-dropzone').count() == 0, 'an Explorer node shows no drop zone on a pane')
    cancel_drag(page)

    # Over a pane's edge a tab splits it; the new group holds the tab.
    before = wb_groups(page).count()
    drag(page, center(file_tab.bounding_box()), (pane['x'] + pane['width'] / 2, pane['y'] + pane['height'] - 20), hold=200, release=False)
    need(page.locator('.kit-dropzone.is-bottom').count() == 1, 'the bottom edge shows the split zone')
    page.mouse.up()
    page.wait_for_timeout(400)
    right = group_with(page, 'Explorer', other=True).bounding_box()
    left = group_with(page, 'Explorer').bounding_box()
    need(right['y'] >= left['y'] + left['height'] - 2,
         f'a tab dropped on an edge splits the pane, the tab below it: {left} {right}')

    # A tab between strips moves there.
    explorer = group_with(page, 'Explorer')
    moved = group_with(page, 'Test library').locator('[role=tab]', has_text='Test library')
    dst = explorer.locator('[role=tablist]').bounding_box()
    drag(page, center(moved.bounding_box()), (dst['x'] + dst['width'] - 30, dst['y'] + dst['height'] / 2))
    wait_for(page, lambda: 'Test library' in ' '.join(group_with(page, 'Explorer').locator('[role=tab]').all_inner_texts()),
             'a tab dropped on another strip moves there')

    # Every edge shows its zone, even in a narrow window (the window then shows one pane at a time).
    for _ in range(3):  # every tab into the first group: one pane the width of the window
        if wb_groups(page).count() == 1:
            break
        top = wb_groups(page).first.locator('[role=tablist]').bounding_box()
        drag(page, center(wb_groups(page).last.locator('[role=tab]').first.bounding_box()), (top['x'] + top['width'] - 30, top['y'] + top['height'] / 2))
        page.wait_for_timeout(300)
    need(wb_groups(page).count() == 1, 'one pane the width of the window')
    page.set_viewport_size({'width': 600, 'height': 800})
    page.wait_for_timeout(500)
    group = wb_groups(page).first
    pane = group.locator('.wb-pane').bounding_box()
    src = center(group.locator('[role=tab]').first.bounding_box())
    drag(page, src, (pane['x'] + 15, pane['y'] + pane['height'] / 2), hold=200, release=False)
    need(page.locator('.kit-dropzone.is-left').count() == 1, f'a narrow pane still shows the zone on its side ({pane["width"]:.0f}px wide): splits are never refused')
    page.mouse.move(pane['x'] + pane['width'] / 2, pane['y'] + pane['height'] - 15, steps=8)
    page.wait_for_timeout(100)
    need(page.locator('.kit-dropzone.is-bottom').count() == 1, 'a pane tall enough shows the zone at its bottom')
    cancel_drag(page)
    page.set_viewport_size({'width': 1280, 'height': 800})


PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

# A drag event of a kind on an element: whether it was cancelled and the drop effect it ended with.
FIRE = """(el, [kind, files, own, png]) => {
  const dt = new DataTransfer()
  if (files) dt.items.add(new File([Uint8Array.from(atob(png), c => c.charCodeAt(0))], 'a.png', { type: 'image/png' }))
  if (own) dt.setData('application/x-kit-drag+json', JSON.stringify({ kind: 'tab', ids: ['x'] }))
  const cancelled = !el.dispatchEvent(new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: dt }))
  return { cancelled, effect: dt.dropEffect }
}"""


def fire(page, selector, kind, files=True, own=False):
    return page.locator(selector).first.evaluate(FIRE, [kind, files, own, PNG])


START = "el => !el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))"


def native_guards(page, base):
    # A link or an image can not be dragged natively; a draggable source still can.
    load_library(page, base, library())
    page.goto(base + '#/')
    page.locator('a[href^="#/"]').first.wait_for()
    need(page.locator('a[href^="#/"]').first.evaluate(START), 'dragging a link is cancelled')
    page.evaluate("document.body.insertAdjacentHTML('beforeend', '<img id=\"guard-img\" alt=\"\" src=\"data:image/gif;base64,R0lGODlhAQABAAAAACw=\">')")
    need(page.locator('#guard-img').evaluate(START), 'dragging an image is cancelled')
    need(not page.locator('[role=tab]').first.evaluate(START), 'a draggable source still starts its drag')

    # A file from the computer is refused anywhere but an image slot.
    r = fire(page, 'body', 'dragover')
    need(r['cancelled'] and r['effect'] == 'none', f'a file over the page is refused: {r}')
    need(fire(page, 'body', 'drop')['cancelled'], 'a file dropped on the page does nothing (no navigation)')
    page.goto(base + '#/c/q/edit')
    page.locator('.image-slot').first.wait_for()
    need(fire(page, '.image-slot', 'dragover')['cancelled'], 'an image slot takes a file')
    fire(page, '.image-slot', 'drop')
    page.locator('.image-slot .thumb').first.wait_for()

    # Our own payload never lands in a text field.
    area = page.locator('.pairs textarea').first
    r = fire(page, '.pairs textarea', 'dragover', files=False, own=True)
    need(r['cancelled'] and r['effect'] == 'none', f'our own drag is refused over a text field: {r}')
    before = area.input_value()
    tab = page.locator('[role=tab]').first.bounding_box()
    drag(page, center(tab), center(area.bounding_box()), hold=150)
    need(area.input_value() == before, f'a dragged tab leaves no text in a field: {area.input_value()!r}')


def run(page, base):
    editor_cards(page, base)
    steps(page, base)
    native_guards(page, base)
    workbench_tabs(page, base)
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
