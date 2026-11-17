"""The workbench: two files in split panes that stay independent, a tab moved across groups, a tab closed (its file
stays open), a reload that restores the split and the pages, the Explorer (sidebar button, Ctrl+Shift+E, Reveal in
Explorer), a group popped out and docked, and study in a split pane and full screen when alone."""
import os
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


def group(page, i):
    return groups(page).nth(i)


def crumbs(g):
    return [c.strip() for c in g.locator('.pane-crumbs li > :not(.pane-sep)').all_inner_texts()]


def tab_titles(g):
    return [t.strip() for t in g.locator('[role=tab] .kit-tab-title').all_inner_texts()]


def shown(g):
    """The shown tab's page in a group."""
    return g.locator('.wb-tab:not([hidden])')


def run(page, base):
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Load guide').click()
    page.get_by_text('Loaded the guide.').first.wait_for()
    page.goto(base + '#/')
    groups(page).first.wait_for()
    need(tab_titles(group(page, 0)) == ['Test library', 'Guide'], f'a tab per file: {tab_titles(group(page, 0))}')

    # The test library's tab on a course page, then split: the new group shows a copy of it.
    page.locator('.file-row', has_text='Test library').locator('.file-pick').click()
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
        page.get_by_role('menuitem', name='Move to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup [role=tab]')
    wait_for(page, lambda: groups(page).count() == before - 1, 'the popped-out group leaves the main window')
    pop.get_by_role('button', name='Dock').click()
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
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
