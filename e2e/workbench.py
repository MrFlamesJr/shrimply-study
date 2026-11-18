"""The workbench: two files in split panes that stay independent, a tab moved across groups, a tab closed (its file
stays open), a reload that restores the split and the pages, the Explorer (sidebar button, Ctrl+Shift+E, Reveal in
Explorer), a group popped out and docked, one tab popped out on its own, and study in a split pane and full screen when alone. Then: a study tab
moved to another group goes on with its round, Back returns to the tab an entry belongs to, What's new opens as a
tab (from home and the sidebar, one at most, back after a reload), and the breadcrumbs (every kind of page, each pane
its own trail, a popped-out window, a narrow pane's "< parent" link, long names, in line with the tab strip, a crumb
moving only its pane, renames, a page that is gone). Last, the brand opens the Welcome tab."""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import center, drag  # noqa: E402


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def wait_for(page, check, what, timeout=5000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def groups(page):
    return page.locator('.wb-cell .wb-group')


# True when the element itself (or something inside it) is what a click at its center reaches: no toast, dialog or
# other layer over it.
UNCOVERED = '''el => {
  const r = el.getBoundingClientRect()
  const hit = el.ownerDocument.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return !!hit && (hit === el || el.contains(hit))
}'''


def click_clear(page, locator, what):
    """Clicks the element once nothing covers it (never through a toast); fails when something keeps covering it."""
    locator.wait_for()
    wait_for(page, lambda: locator.evaluate(UNCOVERED), f'{what} is not covered (a toast or a layer over it)')
    locator.click()


def group(page, i):
    return groups(page).nth(i)


# A file's home names itself after the file: "<file> › Your courses" (an empty file's too).
HOME_PAGES = ('Your courses',)


def trail(g):
    """The pane head's crumbs as written."""
    return [c.strip() for c in g.locator('.pane-crumbs li > :not(.pane-sep)').all_inner_texts()]


def crumbs(g):
    """The trail without a home page's own name, so a home reads as the file alone ([file])."""
    t = trail(g)
    return t[:1] if len(t) == 2 and t[1] in HOME_PAGES else t


def tab_titles(g):
    return [t.strip() for t in g.locator('[role=tab] .kit-tab-title').all_inner_texts()]


def shown(g):
    """The shown tab's page in a group."""
    return g.locator('.wb-tab:not([hidden])')


def run(page, base):
    # A first visit opens the Welcome tab; closed like any tab.
    welcome = page.locator('[role=tab]', has_text='Welcome')
    welcome.wait_for()
    need(trail(group(page, 0)) == ['Shrimply Study', 'Welcome'], f'the Welcome tab under the app: {trail(group(page, 0))}')
    welcome.hover()
    welcome.locator('button').click()
    wait_for(page, lambda: welcome.count() == 0, 'the Welcome tab closes')
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Load guide').click()
    page.get_by_text('Loaded the guide.').first.wait_for()
    page.goto(base + '#/')
    groups(page).first.wait_for()
    need(tab_titles(group(page, 0)) == ['Test library', 'Guide'], f'a tab per file: {tab_titles(group(page, 0))}')

    # The test library's tab on a course page, then split: the new group shows a copy of it.
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()
    shown(group(page, 0)).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(group(page, 0))) == 2, 'the test library tab shows a course')
    course = crumbs(group(page, 0))
    group(page, 0).get_by_role('button', name='Split right').click()
    wait_for(page, lambda: groups(page).count() == 2, 'Split right makes a second group')
    need(crumbs(group(page, 1)) == course, 'the new group shows a copy of the tab')

    # The guide's tab moves across into the new group (dragged onto its tab strip).
    src = group(page, 0).locator('[role=tab]', has_text='Guide').bounding_box()
    dst = group(page, 1).locator('[role=tablist]').bounding_box()
    drag(page, center(src), (dst['x'] + dst['width'] - 40, dst['y'] + dst['height'] / 2))
    wait_for(page, lambda: 'Guide' in tab_titles(group(page, 1)), 'the guide tab moved into the second group')
    need('Guide' not in tab_titles(group(page, 0)), 'the guide tab left the first group')

    # In the second group the guide goes to a quiz; the first group's page does not move.
    g2 = group(page, 1)
    g2.locator('[role=tab]', has_text='Guide').click()
    shown(g2).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(g2)) == 2, 'the guide tab shows a course')
    shown(g2).locator('a.tile').first.click()
    wait_for(page, lambda: len(crumbs(g2)) == 3, 'the guide tab shows a quiz')
    quiz = crumbs(g2)
    need(crumbs(group(page, 0)) == course, 'the other pane stays where it was')
    shown(group(page, 0)).locator('a.tile').first.click()
    wait_for(page, lambda: len(crumbs(group(page, 0))) == 3, 'the first pane goes to a quiz of its own')
    need(crumbs(g2) == quiz, 'the second pane stays on its quiz')

    # Closing a tab never closes its file.
    g2.locator('[role=tab]').first.hover()
    first_title = tab_titles(g2)[0]
    # The close button is hidden from the accessibility tree (Delete and the menu close tabs by keyboard).
    g2.locator('[role=tab]').first.locator('button').click()
    wait_for(page, lambda: len(tab_titles(g2)) == 1, 'the tab closes')
    need(page.locator('.file-row').count() == 2, 'both files stay open in the sidebar')

    # A reload brings back the split and both pages.
    page.wait_for_timeout(700)  # the workspace record waits out 300ms
    left, right = crumbs(group(page, 0)), crumbs(group(page, 1))
    page.reload()
    groups(page).nth(1).wait_for()
    wait_for(page, lambda: crumbs(group(page, 0)) == left and crumbs(group(page, 1)) == right, 'the split and its pages are restored')

    # The Explorer from the sidebar, then with Ctrl+Shift+E; Reveal in Explorer selects the tab's quiz.
    page.locator('.sidebar-explorer').click()
    wait_for(page, lambda: page.locator('[role=tab]', has_text='Explorer').count() == 1, 'the sidebar opens the Explorer')
    explorer_tab = page.locator('[role=tab]', has_text='Explorer')
    explorer_tab.hover()
    explorer_tab.locator('button').click()
    wait_for(page, lambda: page.locator('[role=tab]', has_text='Explorer').count() == 0, 'the Explorer closes')
    page.locator('body').click(position={'x': 5, 'y': 790})
    page.keyboard.press('Control+Shift+E')
    wait_for(page, lambda: page.locator('[role=tab]', has_text='Explorer').count() == 1, 'Ctrl+Shift+E opens the Explorer')
    g2 = page.locator('.wb-group', has=page.locator('[role=tab]', has_text=quiz[-1]))
    g2.locator('[role=tab]', has_text=quiz[-1]).first.click(button='right')
    page.get_by_role('menuitem', name='Reveal in Explorer').click()
    wait_for(page, lambda: page.locator('[role=treeitem][aria-selected=true]', has_text=quiz[-1]).count() == 1, 'Reveal selects the quiz in the Explorer')

    # Pop a group out into its own window, then dock it.
    before = groups(page).count()
    target = groups(page).last
    with page.context.expect_page() as info:
        target.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Move group to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup [role=tab]')
    wait_for(page, lambda: groups(page).count() == before - 1, 'the popped-out group leaves the main window')
    compact_popup(pop)
    pop.locator('.kit-tabstrip').get_by_role('button', name='Dock').click()
    wait_for(page, lambda: groups(page).count() == before, 'Dock brings the group back')

    # Study in a split pane: the shell stays; alone in the main window: full screen.
    g2 = page.locator('.wb-group', has=page.locator('[role=tab]', has_text=quiz[-1]))
    g2.locator('[role=tab]', has_text=quiz[-1]).first.click()
    shown(g2).get_by_role('button', name='Start').click()
    shown(g2).locator('.session-stack').wait_for()
    need(groups(page).count() >= 2, 'the other panes stay beside the session')
    need(page.locator('.app.is-session').count() == 0, 'a session in a split pane is not full screen')
    need(page.locator('.sidebar').is_visible(), 'the sidebar stays beside a session in a pane')
    while groups(page).count() > 1:
        other = page.locator('.wb-cell .wb-group:not(:has(.session))').first
        other.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Close all').click()
        page.wait_for_timeout(150)
    wait_for(page, lambda: page.locator('.app.is-session').count() == 1, 'a session alone in the main window is full screen')
    need(not page.locator('.sidebar').is_visible(), 'the shell steps aside for a full-screen session')
    page.keyboard.press('Escape')
    wait_for(page, lambda: page.locator('.app.is-session').count() == 0, 'Esc leaves the session')

    study_moves(page)
    back_returns_to_its_tab(page)
    whats_new_tab(page)
    breadcrumbs(page)
    new_quiz_in_popup(page)
    empty_group_and_brand(page)
    pop_out_one_tab(page)
    address_names_the_page(page, base)
    open_focuses_and_duplicates(page)
    popout_address(page, base)
    crowded_window(page)
    pane_floor(page)
    close_group(page)
    popup_title_follows_focus(page)
    pane_without_page(page)
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))


def compact_popup(pop):
    """A popped-out window has no title row of its own: its tab strip is the first thing under the browser's bar, the
    way back (Dock) in that strip."""
    need(pop.locator('.wb-window-head').count() == 0, 'no title row in the popup')
    strip = pop.locator('.kit-tabstrip').first.bounding_box()
    need(strip['y'] <= 1, f'the tab strip is at the top of the popup: {strip}')
    need(pop.locator('.kit-tabstrip').get_by_role('button', name='Dock').count() == 1, 'Dock sits in the tab strip, once')


def pop_out_one_tab(page):
    """A tab's Move to new window takes only that tab (the rest of its group stays); the main window's lone tab can go
    too, leaving an empty group. The main window counts the tabs in other windows (its strip, its empty page); Dock
    from a window's menu and Dock all bring them back."""
    g = group(page, 0)
    need(len(tab_titles(g)) == 2 and groups(page).count() == 1, f'one group with two tabs: {tab_titles(g)}')
    moved = tab_titles(g)[-1]
    with page.context.expect_page() as info:
        g.locator('[role=tab]').last.click(button='right')
        page.get_by_role('menuitem', name='Move to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup [role=tab]')
    need(pop.locator('[role=tab]').count() == 1, 'the popup holds only that tab')
    wait_for(page, lambda: len(tab_titles(group(page, 0))) == 1 and groups(page).count() == 1, 'the rest of its group stays')
    compact_popup(pop)
    need(pop.title() == moved, f"the browser's bar names the window: {pop.title()} != {moved}")

    with page.context.expect_page() as info:
        group(page, 0).locator('[role=tab]').first.click(button='right')
        page.get_by_role('menuitem', name='Move to new window').click()
    pop2 = info.value
    pop2.wait_for_selector('.workbench.is-popup [role=tab]')
    group(page, 0).locator('.wb-empty').wait_for()
    # The main window counts the tabs in other windows: in its strip and on its empty page.
    need(elsewhere(page) == ('2', '2 tabs in other windows'), f'the strip counts 2 tabs elsewhere: {elsewhere(page)}')
    line = group(page, 0).locator('.wb-empty-elsewhere')
    need(line.inner_text().startswith('2 tabs are in other windows'), f'and so does the empty page: {line.inner_text()}')
    pop2.get_by_role('button', name='More').click()
    pop2.get_by_role('menuitem', name='Dock').click()
    wait_for(page, lambda: groups(page).count() == 1 and len(tab_titles(group(page, 0))) == 1, "the menu's Dock brings the tab back")
    wait_for(page, lambda: elsewhere(page) == ('1', '1 tab in another window'), 'the count follows')

    # Again two elsewhere; Dock all (the strip's count's menu) brings both back and the count goes.
    with page.context.expect_page() as info:
        group(page, 0).locator('[role=tab]').first.click(button='right')
        page.get_by_role('menuitem', name='Move to new window').click()
    info.value.wait_for_selector('.workbench.is-popup [role=tab]')
    wait_for(page, lambda: elsewhere(page) == ('2', '2 tabs in other windows'), 'two tabs elsewhere again')
    page.locator('.wb-elsewhere').click()
    need(page.get_by_role('menuitem').count() == 3, 'the menu lists each window, then Dock all')
    page.get_by_role('menuitem', name='Dock all').click()
    wait_for(page, lambda: groups(page).count() == 2 and page.locator('.wb-elsewhere').count() == 0, 'Dock all brings both back')
    wait_for(page, lambda: pop.is_closed(), 'their windows close')


def hash_of(page):
    return page.evaluate('location.hash')


def address_names_the_page(page, base):
    """The address names the page in the focused group, for every kind of tab, with its file while several are open;
    clicking into another group moves it there; a reload restores that page; an address naming a file shows it; an
    old one without the file works against the active file; an empty focused group names no page."""
    while groups(page).count() > 1:
        groups(page).last.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Close all').click()
        page.wait_for_timeout(150)
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()
    g = group(page, 0)
    wait_for(page, lambda: crumbs(g)[:1] == ['Test library'], 'the test library shows')
    shown(g).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(g)) == 2, 'a course of it')
    wait_for(page, lambda: hash_of(page).endswith('?file=test-library') and len(hash_of(page)) > len('#/?file=test-library'),
             f'its page and its file are in the address: {hash_of(page)}')
    course = hash_of(page)

    # Another group shows the guide; clicking back into the first moves the address back.
    g.get_by_role('button', name='Split right').click()
    wait_for(page, lambda: groups(page).count() == 2, 'split')
    page.locator('.file-row', has_text='Guide').locator('.file-name-text').click()
    wait_for(page, lambda: hash_of(page).endswith('?file=guide'), f'the focused group names the guide: {hash_of(page)}')
    group(page, 0).locator('[role=tab][aria-selected=true]').click()
    wait_for(page, lambda: hash_of(page) == course, f'clicking into the other group names its page: {hash_of(page)}')

    # The app's own tabs have addresses of their own, and a reload restores them.
    page.locator('.sidebar-news').click()
    wait_for(page, lambda: hash_of(page) == '#/_changelog', f"What's new: {hash_of(page)}")
    page.locator('a.brand').click()
    wait_for(page, lambda: hash_of(page) == '#/_welcome', f'the welcome page: {hash_of(page)}')
    page.wait_for_timeout(700)
    page.reload()
    groups(page).first.wait_for()
    wait_for(page, lambda: trail(active_group(page)) == ['Shrimply Study', 'Welcome'] and hash_of(page) == '#/_welcome', 'the reload shows the Welcome tab again')
    page.keyboard.press('Control+Shift+E')
    wait_for(page, lambda: hash_of(page) == '#/_explorer', f'the Explorer: {hash_of(page)}')

    # A file's page: a reload shows exactly it; an address naming the other file shows that file in the focused group.
    page.goto(base + course)
    wait_for(page, lambda: crumbs(active_group(page))[:1] == ['Test library'] and len(crumbs(active_group(page))) == 2, 'its address shows the course')
    page.wait_for_timeout(700)
    page.reload()
    groups(page).first.wait_for()
    wait_for(page, lambda: hash_of(page) == course and len(crumbs(active_group(page))) == 2, f'a reload keeps it: {hash_of(page)}')
    page.goto(base + '#/?file=guide')
    wait_for(page, lambda: crumbs(active_group(page))[:1] == ['Guide'], "the guide's home, named by the address")
    # An old address without the file works against the active file, and gets its file part back.
    page.goto(base + '#/')
    wait_for(page, lambda: crumbs(active_group(page)) == ['Guide'] and hash_of(page) == '#/?file=guide', f'an old address: {hash_of(page)}')

    # An empty focused group names no page.
    while groups(page).count() > 1:
        groups(page).last.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Close all').click()
        page.wait_for_timeout(150)
    group(page, 0).get_by_role('button', name='More').click()
    page.get_by_role('menuitem', name='Close all').click()
    wait_for(page, lambda: hash_of(page) == '#/_empty', f'an empty group: {hash_of(page)}')


def open_focuses_and_duplicates(page):
    """Opening what is already open focuses its tab, in any window; Ctrl opens another; a file's row shows its home;
    Duplicate tab copies a tab, and a duplicated Explorer keeps its own open nodes, after a reload too."""
    g = group(page, 0)
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()
    wait_for(page, lambda: trail(group(page, 0)) == ['Test library', 'Your courses'], "a file's row shows its home")
    # The file's first quiz in the sidebar's tree (its first course unfolded when it isn't).
    block = page.locator('.file-block').filter(has=page.locator('.file-name-text', has_text='Test library'))
    block.locator('.file-course').first.wait_for()
    if block.locator('.file-quiz').count() == 0:
        block.locator('.file-course [data-chevron]').first.click()
    quiz = block.locator('.file-quiz').first
    name = quiz.inner_text().strip()
    quiz.click(modifiers=['Control'])
    wait_for(page, lambda: len(tab_titles(g)) == 2, 'Ctrl opens it in a new tab')
    selected = lambda: g.locator('[role=tab][aria-selected=true] .kit-tab-title').inner_text().strip()  # noqa: E731
    need(selected() == 'Test library', 'beside, without showing it')
    quiz.click()
    wait_for(page, lambda: selected() == name, 'a plain click focuses the tab already showing it')
    need(len(tab_titles(g)) == 2, 'and opens no other')
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()
    wait_for(page, lambda: trail(g) == ['Test library', 'Your courses'] and len(tab_titles(g)) == 2, "the file's row focuses its home tab")

    # A tab in a popped-out window: opening its page again brings that window to the front, its tab focused.
    with page.context.expect_page() as info:
        g.locator('[role=tab]', has_text=name).click(button='right')
        page.get_by_role('menuitem', name='Move to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup [role=tab]')
    pop.evaluate('window.__focused = 0; const own = window.focus.bind(window); window.focus = () => { window.__focused++; own() }')
    g.locator('[role=tab]').first.click()
    quiz.click()
    wait_for(page, lambda: pop.evaluate('window.__focused') > 0, 'the popped-out window comes to the front')
    need(pop.locator('.wb-group.is-focused').count() == 1 and page.locator('.wb-cell .wb-group.is-focused').count() == 0, 'its group has the focus')
    need(len(tab_titles(g)) == 1, 'nothing opened in the main window')
    page.locator('.wb-cell .wb-elsewhere').click()
    page.get_by_role('menuitem', name='Dock all').click()
    wait_for(page, lambda: pop.is_closed(), 'docked again')

    # Duplicate tab: a file's page beside it.
    g = group(page, 0)
    count = len(tab_titles(g))
    g.locator('[role=tab]').first.click(button='right')
    page.get_by_role('menuitem', name='Duplicate tab').click()
    wait_for(page, lambda: len(tab_titles(group(page, 0))) == count + 1, 'Duplicate tab copies it')

    # A duplicated Explorer keeps its own open nodes.
    page.keyboard.press('Control+Shift+E')
    tabs = page.locator('.wb-cell [role=tab]', has_text='Explorer')
    wait_for(page, lambda: tabs.count() == 1, 'the Explorer')
    tabs.first.click(button='right')
    page.get_by_role('menuitem', name='Duplicate tab').click()
    wait_for(page, lambda: tabs.count() == 2, 'a second Explorer')
    eg = page.locator('.wb-cell .wb-group', has=page.locator('[role=tab]', has_text='Explorer'))
    first = lambda: shown(eg).locator('[role=treeitem]').first  # noqa: E731
    before = first().get_attribute('aria-expanded')
    first().locator('[data-chevron]').click()
    wait_for(page, lambda: first().get_attribute('aria-expanded') != before, 'its first file opens or closes')
    after = first().get_attribute('aria-expanded')
    eg.locator('[role=tab]', has_text='Explorer').first.click()
    wait_for(page, lambda: first().get_attribute('aria-expanded') == before, 'the other Explorer keeps its own')
    page.wait_for_timeout(700)
    page.reload()
    eg = page.locator('.wb-cell .wb-group', has=page.locator('[role=tab]', has_text='Explorer'))
    eg.first.wait_for()
    explorers = eg.locator('[role=tab]', has_text='Explorer')
    wait_for(page, lambda: explorers.count() == 2, 'both Explorers come back')
    states = []
    for i in range(2):
        explorers.nth(i).click()
        page.wait_for_timeout(150)
        states.append(shown(eg).locator('[role=treeitem]').first.get_attribute('aria-expanded'))
    need(sorted(states, key=str) == sorted([before, after], key=str), f'each with its own open nodes: {states}')


def elsewhere(page):
    """The main window's count of tabs in other windows: its number and its tooltip, or None."""
    b = page.locator('.wb-cell .wb-elsewhere')
    return (b.inner_text().strip(), b.get_attribute('title')) if b.count() == 1 else None


def active_group(page):
    return page.locator('.wb-cell .wb-group.is-focused')


def start_split(page):
    """The active group split in two (a copy of its tab on the right); returns both groups."""
    active_group(page).get_by_role('button', name='Split right').click()
    wait_for(page, lambda: groups(page).count() == 2, 'the split makes two groups')
    return group(page, 0), group(page, 1)


def study_moves(page):
    """A study tab dragged to another group keeps its round (its screen moves, not mounted anew)."""
    g1, g2 = start_split(page)
    shown(g2).get_by_role('button', name='Start').click()
    shown(g2).locator('.session-stack').wait_for()
    need(shown(g2).locator('.pane-head').count() == 0 and g2.locator('.pane-head').count() == 0, 'a study session has no breadcrumbs (its own head)')
    # By keys (the round is shuffled: a click on a card could land on its picture, which opens big instead).
    page.evaluate('document.activeElement && document.activeElement.blur()')
    page.keyboard.press('Space')
    page.mouse.move(1, 1)
    click_clear(page, shown(g2).get_by_role('button', name=re.compile('^Knew it')), 'Knew it')
    wait_for(page, lambda: shown(g2).locator('.session-count').inner_text().startswith('2 /'), 'the round goes on to question 2')
    src = g2.locator('[role=tab]').first.bounding_box()
    dst = g1.locator('[role=tablist]').bounding_box()
    drag(page, center(src), (dst['x'] + dst['width'] - 40, dst['y'] + dst['height'] / 2))
    wait_for(page, lambda: groups(page).count() == 1, 'the study tab moved into the other group')
    count = shown(group(page, 0)).locator('.session-count')
    count.wait_for()
    need(count.inner_text().startswith('2 /'), f'the moved round goes on where it was, not from the start: {count.inner_text()}')
    page.keyboard.press('Escape')
    wait_for(page, lambda: shown(group(page, 0)).locator('.session-stack').count() == 0, 'Esc leaves the moved session')


def back_returns_to_its_tab(page):
    """Back goes to the tab its entry belongs to, on that page; the other file's tab stays where it is."""
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()
    a = active_group(page)
    if len(crumbs(a)) > 1:
        a.locator('.pane-crumbs a').first.click()
    wait_for(page, lambda: crumbs(active_group(page)) == ['Test library'], 'the test library tab is on its home')
    shown(active_group(page)).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(active_group(page))) == 2, 'the test library tab goes to a course')
    guide = active_group(page).locator('[role=tab]', has_text='Guide').first
    if guide.count() == 0:
        page.locator('.file-row', has_text='Guide').locator('.file-name-text').click()
    else:
        guide.click()
    wait_for(page, lambda: crumbs(active_group(page))[0] == 'Guide', 'the guide tab is shown')
    guide_trail = crumbs(active_group(page))
    page.go_back()
    wait_for(page, lambda: crumbs(active_group(page)) == ['Test library'], 'Back shows the test library tab on its home again')
    tabs = active_group(page).locator('[role=tab]', has_text='Guide')
    tabs.first.click()
    wait_for(page, lambda: crumbs(active_group(page)) == guide_trail, 'the guide tab was left where it was')
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()


def news_tabs(page):
    return page.locator('[role=tab]', has_text="What's new")


def whats_new_tab(page):
    """What's new (every release's notes) opens as a tab beside the files, from the sidebar (and an empty group's What's
    new box: empty_group_and_brand), one at most; a reload brings it back. Home has no What's new box."""
    g = active_group(page)
    if crumbs(g) != ['Test library']:
        g.locator('.pane-crumbs a').first.click()
        wait_for(page, lambda: crumbs(active_group(page)) == ['Test library'], 'home again')
    need(shown(active_group(page)).locator('.info-box', has_text="What's new").count() == 0, "home has no What's new box")
    need(page.locator('.sidebar-bar .sidebar-news').count() == 1, "the sidebar's What's new sits in its footer, under the Theme row")
    need(page.locator('.sidebar-news svg').count() == 1, "the link ends with the opens-elsewhere mark")
    page.locator('.sidebar-news').click()
    wait_for(page, lambda: news_tabs(page).count() == 1, "What's new opens as a tab")
    need(page.locator('.sidebar').is_visible(), 'the shell stays')
    g = active_group(page)
    need(trail(g) == ['Shrimply Study', "What's new"], f'its pane head names it, under the app: {trail(g)}')
    need(shown(g).get_by_role('heading', name="What's new").count() == 1, 'its page is titled What\'s new')
    need(shown(g).locator('.release-head').count() >= 1, "every release's notes")
    # Again from the sidebar: the same tab, shown again.
    g.locator('[role=tab]').first.click()
    page.locator('.sidebar-news').click()
    wait_for(page, lambda: news_tabs(page).first.get_attribute('aria-selected') == 'true', 'the sidebar shows it again')
    need(news_tabs(page).count() == 1, 'never a second one')
    # Back after a reload.
    page.wait_for_timeout(700)
    page.reload()
    groups(page).first.wait_for()
    wait_for(page, lambda: news_tabs(page).count() == 1, "What's new comes back after a reload")
    news_tabs(page).first.hover()
    news_tabs(page).first.locator('button').click()
    wait_for(page, lambda: news_tabs(page).count() == 0, 'its tab closes like any other')
    # The reload showed the address's tab; back on the test library's, as before.
    active_group(page).locator('[role=tab]', has_text='Test library').first.click()


def lined_up(g):
    """The crumb row starts at the pane's left, where the tab strip's first tab's text does (the strip unscrolled)."""
    return g.evaluate('''g => {
      const strip = g.querySelector('.kit-tabstrip'), tab = g.querySelector('[role=tab]')
      const pad = (el) => parseFloat(getComputedStyle(el).paddingLeft)
      const start = strip.getBoundingClientRect().left + pad(strip) + pad(tab)
      return Math.abs(g.querySelector('.pane-crumbs li').getBoundingClientRect().left - start) <= 2
    }''')


def breadcrumbs(page):
    a = active_group(page)
    if crumbs(a) != ['Test library']:
        a.locator('.pane-crumbs a').first.click()
    # A file's home: the file (with where it lives, not a link: it is this page's root), then the page's own name, as
    # in its title; the same file name as its row in the sidebar.
    wait_for(page, lambda: trail(active_group(page)) == ['Test library', 'Your courses'], 'a home reads file, then Your courses')
    need(active_group(page).locator('.pane-crumbs a').count() == 0, 'on its home, nothing in the trail is a link')
    need(active_group(page).locator('.pane-crumbs li').first.locator('.pane-icon svg').count() == 1, 'the file crumb shows where it lives')
    need(shown(active_group(page)).get_by_role('heading', name='Your courses').count() == 1, 'the same words as the page title')
    need(page.locator('.file-row .file-name-text', has_text='Test library').count() == 1, 'the same name as its sidebar row')

    # Split: a course page on the right, the quiz's editor on the left; each pane its own trail.
    g1, g2 = start_split(page)
    shown(g2).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(g2)) == 2, 'the right pane shows a course')
    course = crumbs(g2)[1]
    shown(g1).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(g1)) == 2, 'the left pane shows the course')
    shown(g1).locator('a.tile').first.click()
    wait_for(page, lambda: len(crumbs(g1)) == 3, 'the left pane shows a quiz')
    quiz = crumbs(g1)[2]
    shown(g1).get_by_role('button', name='Edit quiz').click()
    wait_for(page, lambda: crumbs(g1) == ['Test library', course, quiz, 'Edit'], 'the editor: file, course, quiz, Edit')
    need(crumbs(g2) == ['Test library', course], 'the right pane keeps its own trail')

    # A crumb moves only its own pane.
    g1.locator('.pane-crumbs a', has_text=quiz).click()
    wait_for(page, lambda: crumbs(g1) == ['Test library', course, quiz], 'the quiz crumb goes to the quiz page')
    need(crumbs(g2) == ['Test library', course], 'the other pane does not move')
    need(lined_up(g1) and lined_up(g2), 'the crumbs start in line with each tab strip')

    # A rename shows in every trail at once (before the address follows), in both panes.
    field = shown(g2).get_by_label('Course name')
    field.click()
    field.press('End')
    field.press_sequentially(' renamed')
    page.wait_for_timeout(120)
    need(crumbs(g2)[1] == course + ' renamed' and crumbs(g1)[1] == course + ' renamed', f'renames show at once: {crumbs(g2)} {crumbs(g1)}')

    # Long names truncate inside the pane head, which keeps its height; no crumb overlaps the next.
    field.press_sequentially(' with a very long name that goes on and on and on, far past what a pane can show in one line')
    page.evaluate('document.activeElement.blur()')
    page.wait_for_timeout(400)
    for g in (g1, g2):
        head = g.locator('.pane-head').bounding_box()
        need(head['height'] <= 44, f'the pane head keeps its height: {head}')
        boxes = [b for b in (li.bounding_box() for li in g.locator('.pane-crumbs li').all()) if b]
        need(all(b['x'] + b['width'] <= head['x'] + head['width'] + 1 for b in boxes), 'crumbs stay inside the pane head')
        need(all(boxes[i]['x'] + boxes[i]['width'] <= boxes[i + 1]['x'] + 1 for i in range(len(boxes) - 1)), 'crumbs never overlap')
        tabs = g.locator('[role=tablist]').bounding_box()
        need(head['y'] >= tabs['y'] + tabs['height'] - 1, 'the pane head stays under the tab strip')

    # In a popped-out window the pane keeps its trail.
    with page.context.expect_page() as info:
        g2.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Move group to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup .pane-crumbs')
    popped = [c.strip() for c in pop.locator('.pane-crumbs li > :not(.pane-sep)').all_inner_texts()]
    need(popped[0] == 'Test library' and len(popped) == 2, f'the popped-out pane keeps its trail: {popped}')
    pop.get_by_role('button', name='Dock').click()
    wait_for(page, lambda: groups(page).count() == 2, 'docked again')
    g1, g2 = group(page, 0), group(page, 1)

    # A narrow pane shows "< parent" instead of the trail.
    page.set_viewport_size({'width': 390, 'height': 760})
    page.wait_for_timeout(300)
    g = active_group(page)
    parent = g.locator('.pane-parent')
    wait_for(page, lambda: parent.is_visible(), 'a narrow pane shows the parent link')
    need(not g.locator('.pane-crumbs').is_visible(), 'and not the trail')
    need(parent.inner_text().strip().startswith('‹'), f'the parent link: {parent.inner_text()}')
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.wait_for_timeout(300)

    # A page that is gone (its course deleted in the other pane): the pane moves home, its trail the file alone.
    g1, g2 = group(page, 0), group(page, 1)
    if len(crumbs(g1)) != 3:
        g1.locator('.pane-crumbs a').nth(1).click()
    shown(g2).get_by_role('button', name='Delete course').click()
    page.get_by_role('dialog').get_by_role('button', name='Delete course').click()
    wait_for(page, lambda: crumbs(g1) == ['Test library'] and crumbs(g2) == ['Test library'], 'both panes go home once the course is gone')
    page.locator('.toast', has_text="Couldn't find").first.wait_for()
    page.evaluate('document.activeElement && document.activeElement.blur()')
    page.keyboard.press('Control+z')
    page.wait_for_timeout(200)


def new_quiz_in_popup(page):
    """New quiz on a file's home in a popped-out pane goes to the editor in that pane; the main window stays put."""
    g1 = group(page, 0)
    main_trail = crumbs(g1)
    g2 = group(page, 1)
    if crumbs(g2) != ['Test library']:
        g2.locator('.pane-crumbs a').first.click()
        wait_for(page, lambda: crumbs(group(page, 1)) == ['Test library'], 'the right pane on its home')
    with page.context.expect_page() as info:
        group(page, 1).get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Move group to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup .tile-new')
    pop.locator('.workbench.is-popup .wb-tab:not([hidden]) .tile-new').first.click()
    pop.wait_for_function("[...document.querySelectorAll('.pane-crumbs li')].some(li => li.textContent.includes('Edit'))", timeout=5000)
    need(crumbs(group(page, 0)) == main_trail, f'the main window stays where it was: {crumbs(group(page, 0))} != {main_trail}')
    pop.get_by_role('button', name='Dock').click()
    wait_for(page, lambda: groups(page).count() == 2, 'docked again')


def empty_group_and_brand(page):
    """An empty group shows what can go there (an open file's home opens in it); the brand shows the active file's
    home: its tab when there is one, else a new tab."""
    while groups(page).count() > 1:
        groups(page).last.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Close all').click()
        page.wait_for_timeout(150)
    group(page, 0).get_by_role('button', name='More').click()
    page.get_by_role('menuitem', name='Close all').click()
    empty = group(page, 0).locator('.wb-empty')
    empty.wait_for()
    need(empty.locator('.wb-empty-mark svg').count() == 1, 'the empty group shows the faded shrimp')
    need(empty.get_by_role('heading', name='No tab open').count() == 1, 'and says no tab is open')
    # What's new is here (asked for): the newest notes, and the way to its tab, which opens in this group.
    news = empty.locator('.info-box', has_text="What's new")
    need(news.count() == 1 and news.locator('.tips-list').count() == 1, "the empty page shows What's new")
    news.get_by_role('link', name="Open What's new").click()
    wait_for(page, lambda: trail(group(page, 0)) == ['Shrimply Study', "What's new"], "its link opens What's new in this group")
    news_tabs(page).first.hover()
    news_tabs(page).first.locator('button').click()
    empty.wait_for()
    for name in ['Show the Explorer', 'New file', 'Open', 'Test library', 'Guide']:
        need(empty.get_by_role('button', name=re.compile(name)).count() >= 1, f'the empty group offers {name}')
    empty.get_by_role('button', name=re.compile('^Test library')).click()
    wait_for(page, lambda: crumbs(group(page, 0)) == ['Test library'], "a file's home opens in the empty group")

    # The brand: the Welcome tab (the welcome page), one at most; its Go to my courses shows the file's home here.
    shown(group(page, 0)).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(group(page, 0))) == 2, 'the tab goes to a course')
    before = len(tab_titles(group(page, 0)))
    page.locator('a.brand').click()
    wait_for(page, lambda: trail(group(page, 0)) == ['Shrimply Study', 'Welcome'], 'the brand opens the Welcome tab')
    need(len(tab_titles(group(page, 0))) == before + 1, 'in a new tab')
    need(shown(group(page, 0)).get_by_role('heading', name='Shrimply Study').count() == 1, 'showing the welcome page')
    group(page, 0).locator('[role=tab]').first.click()
    wait_for(page, lambda: len(crumbs(group(page, 0))) == 2, 'back on the course tab')
    page.locator('a.brand').click()
    wait_for(page, lambda: trail(group(page, 0)) == ['Shrimply Study', 'Welcome'], 'the brand shows the Welcome tab again')
    need(len(tab_titles(group(page, 0))) == before + 1, 'without opening another tab')
    shown(group(page, 0)).get_by_role('button', name='Go to my courses').click()
    wait_for(page, lambda: crumbs(group(page, 0)) == ['Test library'], "Go to my courses shows the file's home")
    need(len(tab_titles(group(page, 0))) == before + 1, "in the file's tab there")


def popout_address(page, base):
    """A popped-out window has a real address: the popped tab's page with `pane`. A reload keeps it popped out (same
    tabs, the main window's groups unchanged) and Dock still works. A new tab at that address shows just that page, no
    sidebar, with Open full app, which then shows the full app on the same page; the main window's layout survives."""
    while groups(page).count() > 1:
        groups(page).last.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Close all').click()
        page.wait_for_timeout(150)
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()
    g = group(page, 0)
    wait_for(page, lambda: crumbs(g)[:1] == ['Test library'], 'the test library shows')
    shown(g).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(g)) == 2, 'a course of it')
    course = crumbs(g)
    route = hash_of(page).split('?')[0]
    g.get_by_role('button', name='Split right').click()
    wait_for(page, lambda: groups(page).count() == 2, 'split')
    with page.context.expect_page() as info:
        group(page, 1).get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Move group to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup [role=tab]')
    wait_for(page, lambda: groups(page).count() == 1, 'the popped-out group leaves the main window')
    url = pop.url
    need(route in url and re.search(r'[?&]pane', url), f"the popup's address is the popped page with pane: {url} (page {route!r} in {url!r}: {route in url}, {bool(re.search(r'[?&]pane', url))})")
    titles = [t.strip() for t in pop.locator('[role=tab] .kit-tab-title').all_inner_texts()]

    # A reload keeps it popped out.
    pop.reload()
    pop.wait_for_selector('.workbench.is-popup [role=tab]', timeout=10000)
    need([t.strip() for t in pop.locator('[role=tab] .kit-tab-title').all_inner_texts()] == titles, 'the same tabs after the reload')
    page.wait_for_timeout(500)
    need(groups(page).count() == 1, 'the main window did not take it back')
    need(re.search(r'[?&]pane', pop.url) and route in pop.url, f"and the popup keeps its address: {pop.url}")
    pop.get_by_role('button', name='Dock').click()
    wait_for(page, lambda: groups(page).count() == 2, 'Dock still works after a reload')

    # A new tab at that address: that page alone, then Open full app.
    page.wait_for_timeout(700)  # the workspace record waits out 300ms
    fresh = page.context.new_page()
    fresh.goto(url)
    fresh.locator('.wb-cell .wb-group').first.wait_for()
    need(fresh.locator('.wb-cell .wb-group').count() == 1 and fresh.locator('[role=tab]').count() == 1, 'one group with one tab')
    need(not fresh.locator('.sidebar').is_visible(), 'no sidebar')
    wait_for(fresh, lambda: crumbs(fresh.locator('.wb-cell .wb-group').first) == course, f"it shows the popped page: {trail(fresh.locator('.wb-cell .wb-group').first)}")
    fresh.get_by_role('button', name='Open full app').click()
    fresh.locator('.sidebar').wait_for(state='visible')
    need(not re.search(r'[?&]pane', fresh.evaluate('location.hash')), 'the full app has no pane in its address')
    wait_for(fresh, lambda: crumbs(active_group(fresh)) == course, 'on the same page')
    fresh.close()
    page.reload()
    groups(page).first.wait_for()
    need(groups(page).count() == 2, "the main tab's saved layout survived")


def visible_groups(page):
    return [g for g in groups(page).all() if g.is_visible()]


def crowded_window(page):
    """Under 800px the window shows only the shown group, with a "+N panes" button in its strip listing the others;
    choosing one shows it; widening brings every group back. (Panes keep up to 200px before that: see pane_floor.)"""
    page.set_viewport_size({'width': 1600, 'height': 900})
    while groups(page).count() > 1:
        groups(page).last.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Close all').click()
        page.wait_for_timeout(150)
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()
    for _ in range(2):
        groups(page).last.get_by_role('button', name='Split right').click()
        page.wait_for_timeout(300)
    need(groups(page).count() == 3, 'three groups')
    page.wait_for_timeout(300)
    need(len(visible_groups(page)) == 3 and page.locator('.wb-panes').count() == 0, 'three panes fit at 1600px, no list button')
    for width in (390,):
        page.set_viewport_size({'width': width, 'height': 800})
        page.wait_for_timeout(400)
        vis = visible_groups(page)
        need(len(vis) == 1, f'at {width}px only the shown group shows ({len(vis)})')
        box = vis[0].bounding_box()
        need(box['width'] >= min(200, width) - 1, f'the pane is never squeezed: {box["width"]} at {width}px')
        btn = vis[0].locator('.wb-panes')
        need(btn.count() == 1 and btn.inner_text().strip() == '+2 panes', f'a +2 panes button at {width}px')
        need(bool(btn.get_attribute('title')), 'with a tooltip')
        need(btn.evaluate('b => b.scrollWidth <= b.clientWidth && b.getBoundingClientRect().height <= 44'), 'the button is one line')
        need(vis[0].locator('.kit-tabs-actions').evaluate('a => a.getBoundingClientRect().right <= innerWidth + 1'), 'the strip actions stay on screen')
        btn.click()
        items = page.locator('.kit-menu [role=menuitem]')
        need(items.count() == 2, f'the menu lists the 2 hidden groups ({items.count()})')
        names = [t.strip() for t in items.all_inner_texts()]
        items.nth(1).click()
        page.wait_for_timeout(300)
        now = visible_groups(page)
        need(len(now) == 1 and now[0].get_attribute('data-group') != vis[0].get_attribute('data-group'), 'choosing one shows that group')
        need('is-focused' in now[0].get_attribute('class'), f'and focuses it (listed {names})')
    page.set_viewport_size({'width': 1600, 'height': 900})
    wait_for(page, lambda: len(visible_groups(page)) == 3 and page.locator('.wb-panes').count() == 0, 'widening brings every group back')


def close_extra_groups(page):
    """Closes every group but the first, whatever it holds (an empty group too)."""
    page.set_viewport_size({'width': 1600, 'height': 900})
    while groups(page).count() > 1:
        groups(page).last.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Close group').click()
        page.wait_for_timeout(150)


def pane_floor(page):
    """A split is never refused: panes share the window down to 200px each (the splits equalized with a double click on
    a sash, as halving the last pane alone would go under it); one more split that would go under 200px makes the window
    show one pane at a time."""
    close_extra_groups(page)
    page.set_viewport_size({'width': 1200, 'height': 800})
    page.wait_for_timeout(300)
    room = page.locator('.workbench:not(.is-popup) .wb-win').evaluate('el => el.clientWidth')
    fit = int((room + 4) // 204)
    need(fit >= 3, f'the test window has room for at least 3 panes ({room}px)')
    for _ in range(fit - 1):
        visible_groups(page)[-1].get_by_role('button', name='Split right').click()
        page.wait_for_timeout(250)
    page.locator('.workbench:not(.is-popup) .kit-sash').first.dblclick()
    page.wait_for_timeout(300)
    vis = visible_groups(page)
    need(len(vis) == fit and page.locator('.wb-panes').count() == 0, f'{fit} panes fit in {room}px, no list button ({len(vis)})')
    widths = [g.bounding_box()['width'] for g in vis]
    need(all(w >= 199 for w in widths), f'every pane keeps 200px: {widths}')
    visible_groups(page)[-1].get_by_role('button', name='Split right').click()
    wait_for(page, lambda: page.locator('.wb-win.is-crowded').count() == 1 and page.locator('.wb-panes').count() == 1,
             'one split too many shows one pane at a time with a +N panes button')
    close_extra_groups(page)
    wait_for(page, lambda: page.locator('.wb-win.is-crowded').count() == 0, 'one group is never crowded')


def close_group(page):
    """An empty group (the Explorer split beside itself) closes from its own menu; the main window's last group stays."""
    close_extra_groups(page)
    g = group(page, 0)
    g.get_by_role('button', name='More').click()
    page.get_by_role('menuitem', name='Close all').click()
    page.wait_for_timeout(200)
    page.keyboard.press('Control+Shift+E')
    explorer = page.locator('[role=tab]', has_text='Explorer')
    wait_for(page, lambda: explorer.count() == 1, 'the Explorer opens')
    need(groups(page).count() == 1, 'the Explorer is alone in its group')
    group(page, 0).get_by_role('button', name='More').click()
    page.get_by_role('menuitem', name='Split right').click()
    wait_for(page, lambda: groups(page).count() == 2, 'splitting the Explorer makes a second group')
    need('No tab open' in group(page, 1).inner_text(), 'the new group is empty')
    group(page, 1).get_by_role('button', name='More').click()
    item = page.get_by_role('menuitem', name='Close group')
    need(item.get_attribute('aria-disabled') != 'true' and not item.is_disabled(), 'Close group is available')
    item.click()
    wait_for(page, lambda: groups(page).count() == 1, 'Close group removes the empty group')
    need(explorer.count() == 1, 'the Explorer stays in the other group')
    group(page, 0).get_by_role('button', name='More').click()
    item = page.get_by_role('menuitem', name='Close group')
    need(item.is_disabled() or item.get_attribute('aria-disabled') == 'true', 'Close group is greyed out for the only group')
    need(item.get_attribute('title') == 'The main window keeps one group.', 'with its reason')
    page.keyboard.press('Escape')
    group(page, 0).get_by_role('button', name='More').click()
    page.get_by_role('menuitem', name='Close all').click()
    wait_for(page, lambda: explorer.count() == 0, 'the Explorer closes')


def popup_title_follows_focus(page):
    """A popup's window title is its focused group's active tab, as its address is."""
    page.set_viewport_size({'width': 1600, 'height': 900})
    while groups(page).count() > 1:
        groups(page).last.get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Close all').click()
        page.wait_for_timeout(150)
    page.locator('.file-row', has_text='Test library').locator('.file-name-text').click()
    page.locator('.file-row', has_text='Guide').locator('.file-name-text').click()
    with page.context.expect_page() as info:
        group(page, 0).get_by_role('button', name='More').click()
        page.get_by_role('menuitem', name='Move group to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup [role=tab]')
    pop.get_by_role('button', name='Split right').first.click()
    pg = pop.locator('.workbench.is-popup .wb-group')
    wait_for(pop, lambda: pg.count() == 2, 'the popup splits')
    pg.nth(0).get_by_role('tab').first.click()
    for gi in (0, 1, 0):
        pg.nth(gi).get_by_role('tab').first.click()
        pop.wait_for_timeout(300)
        active = pg.nth(gi).locator('[role=tab][aria-selected=true] .kit-tab-title').inner_text().strip()
        wait_for(pop, lambda: pop.title() == active, f'the popup title is its focused group tab: {pop.title()!r} not {active!r}')
    pop.get_by_role('button', name='Dock').first.click()
    wait_for(page, lambda: pop.is_closed(), 'the popup docks')


def pane_without_page(page):
    """Pane mode for a page this browser does not have: an empty group that says so, with Open full app."""
    other = page.context.browser.new_context(viewport={'width': 1280, 'height': 800}).new_page()
    other.goto(page.url.split('#')[0] + '#/some-course/some-quiz?file=nope&pane')
    other.locator('.wb-cell .wb-group').first.wait_for()
    note = other.locator('.wb-empty')
    wait_for(other, lambda: note.count() == 1 and 'not open in this browser' in note.inner_text(), 'the empty pane says the page is not open')
    btn = other.get_by_role('button', name='Open full app')
    need(btn.count() == 1, f'one Open full app ({btn.count()})')
    btn.click()
    other.locator('.sidebar').wait_for(state='visible')
    need(not re.search(r'[?&]pane', other.evaluate('location.hash')), 'the full app has no pane in its address')
    other.context.close()
