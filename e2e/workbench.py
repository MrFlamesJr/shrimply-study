"""The workbench: two files in split panes that stay independent, a tab moved across groups, a tab closed (its file
stays open), a reload that restores the split and the pages, the Explorer (sidebar button, Ctrl+Shift+E, Reveal in
Explorer), a group popped out and docked, one tab popped out on its own, and study in a split pane and full screen when alone. Then: a study tab
moved to another group goes on with its round, Back returns to the tab an entry belongs to, every release's notes
open as a tab, and the breadcrumbs (every kind of page, each pane its own trail, a popped-out window, a narrow pane's
"< parent" link, long names, lined up with the page, a crumb moving only its pane, renames, a page that is gone)."""
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


# A file's home names itself after the file: "<file> › Your courses" (or the welcome page's title).
HOME_PAGES = ('Your courses', 'Start studying in three steps')


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
    changelog_tab(page)
    breadcrumbs(page)
    new_quiz_in_popup(page)
    empty_group_and_brand(page)
    pop_out_one_tab(page)
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
    too, leaving an empty group. Dock from the window's menu and from its strip brings them back."""
    g = group(page, 0)
    need(len(tab_titles(g)) == 2 and groups(page).count() == 1, f'one group with two tabs: {tab_titles(g)}')
    with page.context.expect_page() as info:
        g.locator('[role=tab]').last.click(button='right')
        page.get_by_role('menuitem', name='Move to new window').click()
    pop = info.value
    pop.wait_for_selector('.workbench.is-popup [role=tab]')
    need(pop.locator('[role=tab]').count() == 1, 'the popup holds only that tab')
    wait_for(page, lambda: len(tab_titles(group(page, 0))) == 1 and groups(page).count() == 1, 'the rest of its group stays')
    compact_popup(pop)
    need(pop.title() == 'Test library', f"the browser's bar names the window: {pop.title()}")

    with page.context.expect_page() as info:
        group(page, 0).locator('[role=tab]').first.click(button='right')
        page.get_by_role('menuitem', name='Move to new window').click()
    pop2 = info.value
    pop2.wait_for_selector('.workbench.is-popup [role=tab]')
    group(page, 0).locator('.wb-empty').wait_for()
    pop2.get_by_role('button', name='More').click()
    pop2.get_by_role('menuitem', name='Dock').click()
    wait_for(page, lambda: groups(page).count() == 1 and len(tab_titles(group(page, 0))) == 1, "the menu's Dock brings the tab back")
    pop.locator('.kit-tabstrip').get_by_role('button', name='Dock').click()
    wait_for(page, lambda: groups(page).count() == 2, "the strip's Dock brings the other back beside it")


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
    page.locator('.file-row', has_text='Test library').locator('.file-pick').click()
    a = active_group(page)
    if len(crumbs(a)) > 1:
        a.locator('.pane-crumbs a').first.click()
    wait_for(page, lambda: crumbs(active_group(page)) == ['Test library'], 'the test library tab is on its home')
    shown(active_group(page)).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(active_group(page))) == 2, 'the test library tab goes to a course')
    guide = active_group(page).locator('[role=tab]', has_text='Guide').first
    if guide.count() == 0:
        page.locator('.file-row', has_text='Guide').locator('.file-pick').click()
    else:
        guide.click()
    wait_for(page, lambda: crumbs(active_group(page))[0] == 'Guide', 'the guide tab is shown')
    guide_trail = crumbs(active_group(page))
    page.go_back()
    wait_for(page, lambda: crumbs(active_group(page)) == ['Test library'], 'Back shows the test library tab on its home again')
    tabs = active_group(page).locator('[role=tab]', has_text='Guide')
    tabs.first.click()
    wait_for(page, lambda: crumbs(active_group(page)) == guide_trail, 'the guide tab was left where it was')
    page.locator('.file-row', has_text='Test library').locator('.file-pick').click()


def changelog_tab(page):
    """Every release's notes open as a tab beside the files (the shell and any popped-out window stay)."""
    g = active_group(page)
    if crumbs(g) != ['Test library']:
        g.locator('.pane-crumbs a').first.click()
        wait_for(page, lambda: crumbs(active_group(page)) == ['Test library'], 'home again')
    shown(active_group(page)).get_by_role('link', name='See all releases').click()
    wait_for(page, lambda: page.locator('[role=tab]', has_text='All releases').count() == 1, 'the notes open as a tab')
    need(page.locator('.sidebar').is_visible(), 'the shell stays')
    need(trail(active_group(page)) == ['Shrimply Study', 'All releases'], 'its pane head names it, under the app')
    shown(active_group(page)).get_by_role('button', name='Back to the app').click()
    wait_for(page, lambda: page.locator('[role=tab]', has_text='All releases').count() == 0, 'Back to the app closes the tab')


def lined_up(g):
    """The first crumb starts where the page's title does."""
    crumb = g.locator('.pane-crumbs li').first.bounding_box()
    title = shown(g).locator('.page-head h1').first.bounding_box()
    return abs(crumb['x'] - title['x']) <= 2


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
    need(lined_up(g1) and lined_up(g2), 'the crumbs line up with each page')

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
    for name in ['Show the Explorer', 'New file', 'Open file', 'Test library', 'Guide']:
        need(empty.get_by_role('button', name=re.compile(name)).count() >= 1, f'the empty group offers {name}')
    empty.get_by_role('button', name=re.compile('^Test library')).click()
    wait_for(page, lambda: crumbs(group(page, 0)) == ['Test library'], "a file's home opens in the empty group")

    # The brand: no home tab of the active file left (it goes to a course), so a new one; then that one again.
    shown(group(page, 0)).locator('.course-row a').first.click()
    wait_for(page, lambda: len(crumbs(group(page, 0))) == 2, 'the tab goes to a course')
    before = len(tab_titles(group(page, 0)))
    page.locator('a.brand').click()
    wait_for(page, lambda: crumbs(group(page, 0)) == ['Test library'], 'the brand shows the file home')
    need(len(tab_titles(group(page, 0))) == before + 1, 'in a new tab, as no tab showed it')
    group(page, 0).locator('[role=tab]').first.click()
    wait_for(page, lambda: len(crumbs(group(page, 0))) == 2, 'back on the course tab')
    page.locator('a.brand').click()
    wait_for(page, lambda: crumbs(group(page, 0)) == ['Test library'], 'the brand shows the home tab again')
    need(len(tab_titles(group(page, 0))) == before + 1, 'without opening another tab')

