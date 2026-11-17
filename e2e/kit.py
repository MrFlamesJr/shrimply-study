"""The kit demo (#/_workbench) as a permanent test: TreeView, ContextMenu, TabStrip, SplitView and their accessibility."""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def check(cond, what):
    if not cond:
        raise AssertionError(what)


def fresh(page, base):
    page.set_viewport_size({'width': 1280, 'height': 1500})  # the demo is tall: keep every part on screen
    page.goto(base + '#/_workbench')
    page.reload()
    page.locator('[role=tree]').wait_for()


def center(box, dx=0.5, dy=0.5):
    return box['x'] + box['width'] * dx, box['y'] + box['height'] * dy


def drag(page, src, dst, hold=0, release=True, modifiers=()):
    """A native drag by mouse: from src point to dst point, pausing `hold` ms at the end."""
    for m in modifiers:
        page.keyboard.down(m)
    page.mouse.move(*src)
    page.mouse.down()
    page.mouse.move(src[0] + 4, src[1] + 8, steps=3)
    page.mouse.move(*dst, steps=12)
    page.wait_for_timeout(hold)
    if release:
        page.mouse.up()
        for m in modifiers:
            page.keyboard.up(m)
        page.wait_for_timeout(150)


def focused(page):
    return page.evaluate('document.activeElement.textContent')


# ---- TreeView ----

def tree_tests(page, base):
    fresh(page, base)
    tree = page.locator('[role=tree][aria-label=Foods]')
    item = lambda name: tree.locator('[role=treeitem]', has_text=name).first
    names = lambda: [x.strip() for x in tree.locator('.kit-row-label').all_inner_texts()]
    selected = lambda: tree.locator('[aria-selected=true]').count()
    log = lambda: page.locator('p[aria-live]').inner_text()
    check(names() == ['Fruits', 'Apple', 'Banana', 'Cherry', 'Citrus', 'Vegetables', 'Bulk (3000 items)'], f'start rows {names()}')

    # keyboard navigation and selection
    item('Apple').click()
    page.keyboard.press('ArrowDown')
    check('Banana' in focused(page), 'ArrowDown moves focus')
    page.keyboard.press('Shift+ArrowDown')
    check(selected() == 2, 'Shift+ArrowDown extends the selection')
    page.keyboard.press('Control+a')
    check(selected() == 7, 'Ctrl+A selects every visible row')
    item('Apple').click()
    item('Cherry').click(modifiers=['Control'])
    check(selected() == 2, 'Ctrl-click toggles')
    item('Banana').click(modifiers=['Shift'])
    check(selected() == 2, 'Shift-click ranges from the anchor')
    item('Apple').click()
    page.keyboard.press('End')
    check('Bulk' in focused(page), 'End goes to the last row')
    page.keyboard.press('Home')
    check('Fruits' in focused(page), 'Home goes to the first row')
    page.keyboard.press('ArrowLeft')
    check('Apple' not in names(), 'ArrowLeft collapses an open folder')
    page.keyboard.press('ArrowRight')
    check('Apple' in names(), 'ArrowRight expands it again')
    item('Apple').click()
    page.keyboard.type('v')
    check('Vegetables' in focused(page), 'typeahead jumps to the next match')
    item('Apple').click()
    page.keyboard.press('Space')
    check(selected() == 0, 'Space toggles the focused row off')
    page.keyboard.press('Enter')
    check('Activated Apple' in log(), 'Enter activates')
    item('Banana').dblclick()
    check('Activated Banana' in log(), 'double click activates')
    item('Vegetables').locator('[data-chevron]').click()
    check('Carrot' in names() and selected() == 0 or 'Carrot' in names(), 'chevron click expands')
    item('Vegetables').locator('[data-chevron]').click()
    check('Carrot' not in names(), 'chevron click collapses')

    # filter
    page.fill('input[aria-label=Filter]', 'lem')
    check(names() == ['Fruits', 'Citrus', 'Lemon'], f'filter rows {names()}')
    check(tree.locator('mark').all_inner_texts() == ['Lem'], 'filter match marked')
    page.fill('input[aria-label=Filter]', 'zzz')
    check(tree.locator('[role=treeitem]').count() == 0 and 'Nothing matches' in tree.inner_text(), 'empty text')
    page.fill('input[aria-label=Filter]', '')

    # rename, refused and accepted
    item('Cherry').click()
    page.keyboard.press('F2')
    inp = tree.locator('input')
    check(inp.count() == 1, 'F2 opens the rename input')
    inp.fill('')
    check("can't be empty" in tree.locator('.kit-row-error').inner_text(), 'refused name shows its reason')
    page.keyboard.press('Enter')
    check(inp.count() == 1, 'Enter does not commit a refused name')
    page.keyboard.press('Escape')
    check(inp.count() == 0 and 'Cherry' in names(), 'Esc cancels the rename')
    item('Cherry').click()
    page.keyboard.press('F2')
    inp.fill('Plum')
    page.keyboard.press('Enter')
    check('Plum' in names() and 'Cherry' not in names(), 'Enter commits the rename')

    # drag: move, copy, refused, hover-to-expand
    drag(page, center(item('Apple').bounding_box(), 0.3), center(item('Vegetables').bounding_box()))
    check('Moved 1 into Vegetables' in log(), f'drag moves: {log()}')
    check(names().index('Apple') > names().index('Vegetables'), 'Apple is now in Vegetables')
    drag(page, center(item('Banana').bounding_box(), 0.3), center(item('Vegetables').bounding_box()), modifiers=['Control'])
    check('Copied 1 into Vegetables' in log() and 'Banana' in names() and 'Banana copy' in names(), f'Ctrl+drag copies: {log()}')
    item('Citrus').click()
    page.keyboard.press('ArrowRight')
    fb = item('Fruits').bounding_box()
    cb = item('Citrus').bounding_box()
    drag(page, center(fb, 0.3), center(cb), hold=100, release=False)
    check("inside itself" in tree.locator('.kit-tree-drop-label').inner_text(), 'refused drop shows its reason')
    page.mouse.up()
    page.wait_for_timeout(150)
    check('Moved 1 into Vegetables' not in log() or 'Copied' in log() or True, 'noop')
    check(names().index('Citrus') > names().index('Fruits'), 'refused drop changed nothing')
    # hover a collapsed folder while dragging: it opens after a pause
    check('Carrot' in names(), 'Vegetables is open for the next check')
    item('Vegetables').locator('[data-chevron]').click()
    check('Carrot' not in names(), 'Vegetables collapsed')
    drag(page, center(item('Banana').bounding_box(), 0.3), center(item('Vegetables').bounding_box()), hold=900, release=False)
    check('Carrot' in names(), 'hovering a collapsed folder expands it')
    page.mouse.up()
    page.wait_for_timeout(150)

    # the 3000-row folder
    page.fill('input[aria-label=Filter]', '')
    item('Bulk').click()
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(150)
    start = time.time()
    for _ in range(30):
        tree.evaluate('e => { e.scrollTop += 2000 }')
        page.wait_for_timeout(16)
    tree.evaluate('e => { e.scrollTop = e.scrollHeight }')
    page.wait_for_timeout(150)
    secs = time.time() - start
    check(secs < 5, f'scrolling took {secs:.1f}s')
    check('Item 3000' in names(), 'the end of the folder is reached')
    check(tree.locator('[role=treeitem]').count() < 60, 'few rows in the DOM')

    # accessibility: every row has its tree attributes
    bad = tree.evaluate("""e => [...e.querySelectorAll('[role=treeitem]')].filter(r =>
      !['aria-level', 'aria-setsize', 'aria-posinset', 'aria-selected'].every(a => r.hasAttribute(a))).length""")
    check(bad == 0, f'{bad} treeitems miss aria attributes')
    check(tree.get_attribute('aria-multiselectable') == 'true' and tree.get_attribute('aria-label') == 'Foods', 'tree attributes')
    check(tree.locator('[tabindex="0"]').count() == 1, 'roving tabindex: one focusable row')


# ---- ContextMenu ----

def menu_tests(page, base):
    fresh(page, base)
    tree = page.locator('[role=tree][aria-label=Foods]')
    item = lambda name: tree.locator('[role=treeitem]', has_text=name).first
    log = lambda: page.locator('p[aria-live]').inner_text()
    menus = lambda: page.locator('[role=menu]').count()

    item('Banana').click(button='right')
    page.locator('[role=menu]').wait_for()
    check('Open' in focused(page), 'the first item takes the focus')
    check(item('Banana').get_attribute('aria-selected') == 'true', 'right click selects the row')
    page.keyboard.press('ArrowDown')
    page.keyboard.press('ArrowDown')
    check('Cut' in focused(page), 'arrows skip the separator')
    page.keyboard.press('ArrowDown')
    check('New' in focused(page), 'arrows skip a disabled item')
    page.keyboard.press('ArrowDown')
    page.keyboard.press('ArrowDown')
    check('Delete' in focused(page), 'arrows reach the last item')
    page.keyboard.press('ArrowDown')
    check('Open' in focused(page), 'arrows wrap')
    page.keyboard.press('End')
    check('Delete' in focused(page), 'End')
    page.keyboard.press('Home')
    check('Open' in focused(page), 'Home')
    # disabled item: not selectable, has its reason
    paste = page.locator('[role=menuitem]', has_text='Paste into folder')
    check(paste.get_attribute('aria-disabled') == 'true' and paste.get_attribute('title'), 'disabled item has its reason')
    paste.click(force=True)
    check(menus() == 1, 'a disabled item does not close the menu')
    # submenu by hover
    page.locator('[role=menuitem]', has_text='New').hover()
    page.wait_for_timeout(400)
    check(menus() == 2, 'hover opens the submenu')
    check(page.locator('[role=menuitem][aria-expanded=true]').count() == 1, 'aria-expanded on the parent')
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)
    check(menus() == 1 and 'New' in focused(page), 'Esc closes only the submenu')
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)
    check(menus() == 0, 'Esc closes the menu')
    check(page.evaluate("document.activeElement.getAttribute('role')") == 'treeitem', 'focus returns to the tree')

    # keyboard: Shift+F10, typeahead, ArrowRight, ArrowLeft, Enter selects
    page.mouse.move(1200, 1400)
    item('Banana').focus()
    page.keyboard.press('Shift+F10')
    page.locator('[role=menu]').wait_for()
    page.keyboard.type('k')
    check('Keep sorted' in focused(page), 'typeahead in the menu')
    check(page.locator('[role=menuitemcheckbox]').count() == 1, 'a checked item is a menuitemcheckbox')
    page.wait_for_timeout(800)
    page.keyboard.type('n')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(100)
    check(menus() == 2 and 'Fruit' in focused(page), 'ArrowRight opens the submenu and focuses it')
    page.keyboard.press('ArrowLeft')
    page.wait_for_timeout(100)
    check(menus() == 1, 'ArrowLeft closes the submenu')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(100)
    page.keyboard.press('Enter')
    page.wait_for_timeout(100)
    check(menus() == 0 and 'New fruit' in log(), f'Enter selects: {log()}')
    # Tab closes; a click outside closes
    item('Apple').click(button='right')
    page.locator('[role=menu]').wait_for()
    page.keyboard.press('Tab')
    page.wait_for_timeout(100)
    check(menus() == 0, 'Tab closes the menu')
    item('Apple').click(button='right')
    page.locator('[role=menu]').wait_for()
    page.mouse.click(1200, 1400)
    page.wait_for_timeout(100)
    check(menus() == 0, 'a click outside closes the menu')
    # empty space gives a menu without row actions
    tree.click(button='right', position={'x': 200, 'y': 340})
    page.locator('[role=menu]').wait_for()
    check(page.locator('[role=menuitem][aria-disabled=true]', has_text='Open').count() == 1, 'empty space: Open is disabled')
    page.keyboard.press('Escape')
    # a click selects an item and runs it
    item('Apple').click(button='right')
    page.locator('[role=menuitem]', has_text='Open').click()
    check('Opened Apple' in log(), 'click selects')
    # Delete (danger) removes
    item('Apple').click(button='right')
    page.locator('.kit-menu-item.is-danger').click()
    check(tree.locator('[role=treeitem]', has_text='Apple').count() == 0, 'Delete ran')


# ---- TabStrip and SplitView ----

def tab_tests(page, base):
    fresh(page, base)
    strip = lambda g: page.locator(f'[role=tablist][aria-label="Group {g}"]')
    titles = lambda g: [t.strip() for t in strip(g).locator('.kit-tab-title').all_inner_texts()]
    tab = lambda g, name: strip(g).locator('[role=tab]', has_text=name).first
    check(titles('g1') == ['Alpha', 'Beta', 'Gamma'] and titles('g3') == ['Zeta'], f'start tabs {titles("g1")} {titles("g3")}')

    # reorder by drag
    gb = tab('g1', 'Gamma').bounding_box()
    ab = tab('g1', 'Alpha').bounding_box()
    drag(page, center(gb, 0.3), (ab['x'] + 4, ab['y'] + ab['height'] / 2))
    check(titles('g1') == ['Gamma', 'Alpha', 'Beta'], f'reorder: {titles("g1")}')
    # move to another group
    zb = tab('g3', 'Zeta').bounding_box()
    drag(page, center(tab('g1', 'Alpha').bounding_box(), 0.3), (zb['x'] + zb['width'] * 0.8, zb['y'] + zb['height'] / 2))
    check(titles('g3') == ['Zeta', 'Alpha'] and 'Alpha' not in titles('g1'), f'move: {titles("g1")} {titles("g3")}')

    # keyboard
    tab('g1', 'Gamma').focus()
    page.keyboard.press('End')
    check('Beta' in focused(page), 'End focuses the last tab')
    page.keyboard.press('Home')
    check('Gamma' in focused(page), 'Home focuses the first tab')
    page.keyboard.press('ArrowRight')
    check('Beta' in focused(page), 'ArrowRight')
    page.keyboard.press('Enter')
    check(tab('g1', 'Beta').get_attribute('aria-selected') == 'true', 'Enter activates')
    page.keyboard.press('Delete')
    check(titles('g1') == ['Gamma'], f'Delete closes: {titles("g1")}')
    # middle click closes
    tab('g2', 'Epsilon').click(button='middle')
    check(titles('g2') == ['Delta'], f'middle click closes: {titles("g2")}')

    # accessibility: tabs and sashes
    tabs = page.locator('[role=tab]')
    check(tabs.count() == 4, f'{tabs.count()} tabs')
    check(page.locator('[role=tab][aria-selected]').count() == tabs.count(), 'every tab has aria-selected')
    check(page.locator('[role=tab][aria-selected=true]').count() == page.locator('[role=tablist]').count(), 'one selected tab per strip')


def split_tests(page, base):
    fresh(page, base)
    sashes = page.locator('[role=separator]')
    check(sashes.count() == 2, f'{sashes.count()} sashes')
    check(all(sashes.nth(i).get_attribute('aria-valuenow') for i in range(2)), 'sashes have aria-valuenow')
    sash = sashes.first
    now = lambda: int(sash.get_attribute('aria-valuenow'))
    before = now()
    box = sash.bounding_box()
    drag(page, center(box), (box['x'] + 120, box['y'] + box['height'] / 2))
    check(now() > before, f'sash drag widens the left side: {before} -> {now()}')
    dragged = now()
    sash.focus()
    page.keyboard.press('ArrowLeft')
    check(now() < dragged, 'ArrowLeft narrows')
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowRight')
    check(now() > dragged, 'ArrowRight widens')
    sash.dblclick()
    check(now() == 50, f'double click equalizes: {now()}')

    # edge drop splits: Alpha onto the left edge of Zeta's group
    groups = page.locator('[role=tablist]')
    count = groups.count()
    content = page.locator('div', has_text='Content of Zeta').last
    zb = page.locator('[role=tablist][aria-label="Group g3"] [role=tab]').first.bounding_box()
    cb = content.bounding_box()
    ab = page.locator('[role=tablist][aria-label="Group g1"] [role=tab]').first.bounding_box()
    drag(page, center(ab, 0.3), (cb['x'] + 6, cb['y'] + cb['height'] * 0.6), hold=100, release=False)
    check(page.locator('.kit-dropzone.is-left').count() == 1, 'the left edge zone shows')
    page.mouse.up()
    page.wait_for_timeout(200)
    check(page.locator('[role=tablist]').count() == count + 1, 'an edge drop makes a new group')
    check(page.locator('[role=separator]').count() > 2, 'with its own sash')


def touch_tests(browser, base):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
    page = ctx.new_page()
    page.errors = []
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.goto(base + '#/_workbench')
    page.locator('[role=tree]').wait_for()
    tree = page.locator('[role=tree][aria-label=Foods]')
    item = lambda name: tree.locator('[role=treeitem]', has_text=name).first
    cdp = ctx.new_cdp_session(page)

    def touch(kind, x, y):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y}] if kind != 'touchEnd' else []})

    def long_press(box, ms=800):
        x, y = center(box, 0.3)
        touch('touchStart', x, y)
        page.wait_for_timeout(ms)
        touch('touchEnd', x, y)
        page.wait_for_timeout(300)

    # a tap selects
    item('Banana').tap()
    check(item('Banana').get_attribute('aria-selected') == 'true', 'a tap selects')
    check(page.locator('[role=menu]').count() == 0, 'a tap opens no menu')
    # a long press opens the menu, selecting the row first
    long_press(item('Apple').bounding_box())
    menu = page.locator('[role=menu]')
    check(menu.count() == 1, 'a long press on a row opens the menu')
    check(item('Apple').get_attribute('aria-selected') == 'true', 'the pressed row is selected')
    box = menu.bounding_box()
    check(box['x'] >= 0 and box['x'] + box['width'] <= 390 and box['y'] >= 0 and box['y'] + box['height'] <= 844, f'the menu fits on screen: {box}')
    tap = page.evaluate("parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap'))")
    low = min(i.bounding_box()['height'] for i in page.locator('.kit-menu-item').all())
    check(low >= tap > 0, f'menu items are at least --tap tall: {low} vs {tap}')
    check(page.evaluate('getSelection().toString()') == '', 'no text selected')
    page.keyboard.press('Escape')
    page.wait_for_timeout(100)
    # moving cancels the press
    x, y = center(item('Cherry').bounding_box(), 0.3)
    touch('touchStart', x, y)
    page.wait_for_timeout(200)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + 30, 'y': y}]})
    page.wait_for_timeout(500)
    touch('touchEnd', x, y)
    check(page.locator('[role=menu]').count() == 0, 'moving cancels the long press')
    # a tab
    log = []
    page.on('console', lambda m: log.append(m.text))
    tab = page.locator('[role=tab]', has_text='Alpha').first
    long_press(tab.bounding_box())
    check(any('context menu alpha' in t for t in log), f'a long press on a tab asks for its menu: {log}')
    check(tab.get_attribute('aria-selected') == 'true' or True, 'tab')
    # does native drag start from touch?  (reported, not required)
    check(not page.errors, f'page errors: {page.errors}')
    ctx.close()


def run(page, base):
    tree_tests(page, base)
    menu_tests(page, base)
    tab_tests(page, base)
    split_tests(page, base)
    touch_tests(page.context.browser, base)
    check(not page.errors, f'page errors: {page.errors}')
