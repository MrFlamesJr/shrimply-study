"""The Explorer in the real app: two open files in one tree, keyboard, copy / cut / paste and drag across files, Move to,
new course with inline rename, delete (cards with an Undo toast, a quiz after asking), search, Enter and Reveal across
panes, a reload that keeps the open nodes and selection, Ctrl+Z after a cross-file move, and the Google Drive root
(against a stubbed Google: its sign-in script and the Drive API are answered by the test)."""
import os
import json
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import center  # noqa: E402

KIND = {'doc': 'd', 'course': 'c', 'quiz': 'q', 'card': 'k', 'drive': 'g'}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Google's sign-in script, as the app calls it: a token client that answers at once.
FAKE_GIS = '''window.google = { accounts: { oauth2: {
  initTokenClient: (cfg) => ({ requestAccessToken: () => setTimeout(() => cfg.callback({ access_token: 'stub-token', expires_in: 3600 }), 0) }),
  hasGrantedAllScopes: () => true } } }'''
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}


def stub_google(page, state):
    """Answers the sign-in script and the Drive calls the Explorer makes. `state` holds the libraries, a switch to fail
    the list, and counts."""
    with open(os.path.join(ROOT, 'samples', 'how-to-use.shrimp'), 'rb') as f:
        guide = f.read()

    def drive(route):
        req = route.request
        if req.method == 'OPTIONS':
            return route.fulfill(status=204, headers=CORS)
        url = req.url
        if 'gsi/client' in url:
            return route.fulfill(content_type='text/javascript', body=FAKE_GIS)
        if '/about' in url:
            return route.fulfill(headers=CORS, json={'user': {'emailAddress': 'stub@example.com'}})
        m = re.search(r'/drive/v3/files/([^?]+)', url)
        if m and req.method == 'PATCH':
            state['trashed'].append(m.group(1))
            state['files'] = [f for f in state['files'] if f['id'] != m.group(1)]
            return route.fulfill(headers=CORS, json={'id': m.group(1)})
        if m and 'alt=media' in url:
            return route.fulfill(headers=CORS, content_type='application/zip', body=guide)
        if m:
            name = next(f['name'] for f in state['files'] if f['id'] == m.group(1))
            return route.fulfill(headers=CORS, json={'name': name, 'md5Checksum': 'abc', 'trashed': False})
        state['lists'] += 1
        if state['fail']:
            return route.fulfill(status=500, headers=CORS, json={'error': {'errors': [{'reason': 'backendError'}]}})
        return route.fulfill(headers=CORS, json={'files': [
            {'id': f['id'], 'name': f['name'], 'mimeType': 'application/zip', 'modifiedTime': '2026-11-01T10:00:00Z'} for f in state['files']]})

    page.context.route(re.compile(r'https://(accounts\.google\.com/gsi/client|www\.googleapis\.com/drive/v3/.*)'), drive)


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def wait_for(page, check, what, timeout=5000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def rows_of(page, kind, label):
    """Every tree row of a kind with this exact name."""
    rows = page.locator(f'.kit-tree .kit-row[data-id^="{KIND[kind]}:"]')
    return rows.filter(has=page.locator('.kit-row-label', has_text=re.compile(f'^{re.escape(label)}$')))


def row(page, kind, label, nth=0):
    return rows_of(page, kind, label).nth(nth)


def labels(page, kind=None):
    prefix = f'[data-id^="{KIND[kind]}:"]' if kind else ''
    return page.locator(f'.kit-tree .kit-row{prefix} .kit-row-label').all_inner_texts()


def children(page, kind, label, nth=0):
    """The names of the rows right under a node, read from the tree in display order."""
    rows = page.evaluate(
        "[...document.querySelectorAll('.kit-tree .kit-row')].map(r => [r.dataset.id[0], +r.getAttribute('aria-level'),"
        " r.querySelector('.kit-row-label')?.textContent])"
    )
    seen = -1
    for i, (k, level, text) in enumerate(rows):
        if k == KIND[kind] and text == label:
            seen += 1
            if seen == nth:
                out = []
                for k2, level2, text2 in rows[i + 1:]:
                    if level2 <= level:
                        break
                    if level2 == level + 1:
                        out.append(text2)
                return out
    raise AssertionError(f'no {kind} "{label}" in the tree')


def selected(page):
    return page.locator('.kit-tree [role=treeitem][aria-selected=true] .kit-row-label').all_inner_texts()


def collapse_all(page):
    page.get_by_role('button', name='Collapse all').click()
    wait_for(page, lambda: page.locator('.kit-tree .kit-row[aria-expanded=true]').count() == 0, 'Collapse all closes every node')


def expand(page, kind, label, nth=0):
    r = row(page, kind, label, nth)
    if r.get_attribute('aria-expanded') == 'false':
        r.locator('[data-chevron]').click()
        wait_for(page, lambda: r.get_attribute('aria-expanded') == 'true', f'{label} opens')


def fold(page, kind, label, nth=0):
    r = row(page, kind, label, nth)
    if r.get_attribute('aria-expanded') == 'true':
        r.locator('[data-chevron]').click()
        wait_for(page, lambda: r.get_attribute('aria-expanded') == 'false', f'{label} closes')


def dot(page, file):
    return row(page, 'doc', file).locator('.file-dot').count() == 1


def menu(page, r, item):
    r.click(button='right')
    page.get_by_role('menuitem', name=re.compile(f'^{re.escape(item)}')).click()


def drag_row(page, src, dst, modifiers=(), release=True, dy=0.5):
    """Drags a row onto another by mouse. The last dragover lags behind the pointer, so it wiggles on the target."""
    box = dst.bounding_box()
    x, y = box['x'] + 60, box['y'] + box['height'] * dy
    for m in modifiers:
        page.keyboard.down(m)
    page.mouse.move(*center(src.bounding_box()))
    page.mouse.down()
    page.mouse.move(x - 40, y - 30, steps=10)
    page.mouse.move(x, y, steps=10)
    page.mouse.move(x + 3, y + 1, steps=3)
    page.wait_for_timeout(200)
    if release:
        page.mouse.up()
        for m in modifiers:
            page.keyboard.up(m)
        page.wait_for_timeout(150)


def drop_label(page):
    return page.evaluate("document.querySelector('.kit-tree-drop-label')?.textContent")


def undo_toast(page):
    return page.locator('button', has_text='Undo')


def drive_rows(page):
    """The libraries in Google Drive that are not open."""
    return page.locator('.kit-tree .kit-row[data-id^="g:f:"] .kit-row-label').all_inner_texts()


def drive_row(page, name):
    return page.locator('.kit-tree .kit-row[data-id^="g:f:"]').filter(has=page.locator('.kit-row-label', has_text=name))


def top_level(page):
    """Every file in the tree, open or not, in order: name, its status in words, the place (the icon's tooltip)."""
    return page.evaluate(
        "[...document.querySelectorAll('.kit-tree .kit-row[aria-level=\"1\"]')].map(r => [r.querySelector('.kit-row-label').textContent,"
        " r.querySelector('.kit-row-desc')?.textContent, r.querySelector('.explorer-icon')?.title])"
    )


def back_to_explorer(page):
    """Opening a library goes to another group; should it ever cover the Explorer, the Explorer's tab brings it back."""
    if not page.locator('.kit-tree').is_visible():
        page.locator('[role=tab]', has_text='Explorer').first.click()
    page.locator('.kit-tree').wait_for()


def drive_tests(page, state):
    """Google Drive among the files: a sign-in button, one sorted list of open and not open files with their status, open in
    place (Enter, expanding), Move to bin, the choose-files link, a failed list."""
    collapse_all(page)
    box = page.locator('.explorer-drive')
    wait_for(page, lambda: box.count() == 1 and box.get_by_role('button', name='Sign in to see your Google Drive').count() == 1, 'signed out, one quiet link asks to sign in')
    need(page.locator('.kit-tree .kit-row[data-id^="g:"]').count() == 0, 'no Drive row is in the tree when signed out')
    need(page.get_by_role('button', name='Refresh Google Drive').count() == 0, 'Refresh waits for a sign-in')
    need(state['lists'] == 0, 'nothing is listed before signing in')
    box.get_by_role('button', name='Sign in to see your Google Drive').click()
    wait_for(page, lambda: drive_rows(page) == ['alpha.shrimp', 'beta.shrimp', 'gamma.shrimp'], f'signed in, every library is listed: {drive_rows(page)}')
    link = page.locator('.explorer-drive').get_by_role('button', name=re.compile('Choose files in Google Drive'))
    need(link.count() == 1 and 'Choose files in Google Drive' in link.inner_text(), 'a link chooses more files')
    need(page.get_by_role('button', name='Refresh Google Drive').count() == 1, 'Refresh shows once signed in')

    # One list sorted by name; each file says whether it is open and where it is.
    files = top_level(page)
    sorted_names = ['alpha.shrimp', 'beta.shrimp', 'gamma.shrimp', 'Guide', 'Test library']
    need([f[0] for f in files] == sorted_names, f'open and not open files are sorted together: {files}')
    need(files[0][1].startswith('Not open') and files[0][2] == 'On Google Drive', f'a library not open says so in words, and where: {files[0]}')
    need(drive_row(page, 'alpha').locator('.explorer-chip').count() == 0, 'but shows no chip')
    need('Open, ' in files[3][1] and files[3][2] == 'Only in this browser', f'an open file says so, and where: {files[3]}')
    need(row(page, 'doc', 'Guide').locator('.explorer-chip').inner_text() == 'Open', 'an open file has an Open chip')

    # Search covers them.
    search = page.locator('.explorer-search textarea')
    search.fill('beta')
    wait_for(page, lambda: drive_rows(page) == ['beta.shrimp'], f'search filters the libraries: {drive_rows(page)}')
    search.press('Escape')
    wait_for(page, lambda: len(drive_rows(page)) == 3, 'Esc brings them back')

    # Nothing can be dropped or pasted into a library that is not open.
    expand(page, 'doc', 'Test library')
    drag_row(page, row(page, 'course', '1. Start here'), drive_row(page, 'beta'), release=False)
    need(drop_label(page) == 'Open the library first.', f'a drop on a library not open says why: {drop_label(page)}')
    page.mouse.up()
    page.wait_for_timeout(150)
    drive_row(page, 'beta').click(button='right')
    names = page.get_by_role('menuitem').all_inner_texts()
    need([n.splitlines()[0] for n in names] == ['Open', 'Paste', 'Move to bin'], f'its menu: {names}')
    need(page.get_by_role('menuitem', name=re.compile('^Paste')).get_attribute('aria-disabled') == 'true', 'Paste is off in its menu')
    page.keyboard.press('Escape')

    fold(page, 'doc', 'Test library')  # fewer rows: the tree draws only the ones near the window
    # Refresh lists again and keeps the rows meanwhile.
    before = state['lists']
    page.get_by_role('button', name='Refresh Google Drive').click()
    wait_for(page, lambda: state['lists'] > before, 'Refresh asks Google again')
    need(len(drive_rows(page)) == 3, 'the list stays')

    # Expanding a library that is not open only shows what is inside: no file, no tab. Expanding an open file does not open a tab.
    tabs = page.locator('[role=tab]').count()
    docs_before = labels(page, 'doc')
    drive_row(page, 'beta').locator('[data-chevron]').click()
    inside = page.locator('.kit-tree .kit-row[data-id^="c:p-beta:"]')
    wait_for(page, lambda: inside.count() >= 1, 'expanding a library not open shows its courses')
    need(page.locator('[role=tab]').count() == tabs and labels(page, 'doc') == docs_before, 'and opens nothing')
    need('Not open' in drive_row(page, 'beta').locator('.kit-row-desc').inner_text() and drive_row(page, 'beta').locator('.explorer-chip').count() == 0, 'the library keeps saying it is not open, in words only')
    row(page, 'doc', 'Guide').locator('[data-chevron]').click()
    page.wait_for_timeout(300)
    need(page.locator('[role=tab]').count() == tabs, 'expanding an open file opens no tab')
    row(page, 'doc', 'Guide').locator('[data-chevron]').click()

    # Inside it is read-only; a copy works and goes into an open file.
    inside.first.locator('[data-chevron]').click()
    quizzes = page.locator('.kit-tree .kit-row[data-id^="q:p-beta:"]')
    wait_for(page, lambda: quizzes.count() >= 1, 'a course inside shows its quizzes')
    quiz_name = quizzes.first.locator('.kit-row-label').inner_text()
    quizzes.first.click(button='right')
    need(page.get_by_role('menuitem', name=re.compile('^Rename')).get_attribute('aria-disabled') == 'true', 'Rename is off inside a library not open')
    need(page.get_by_role('menuitem', name=re.compile('^Delete')).get_attribute('aria-disabled') == 'true', 'Delete is off too')
    page.keyboard.press('Escape')
    quizzes.first.click()
    page.keyboard.press('Control+c')
    inside.first.locator('[data-chevron]').click()  # fold it again: fewer rows
    drive_row(page, 'beta').locator('[data-chevron]').click()
    expand(page, 'doc', 'Test library')
    row(page, 'course', '2. Term cards').click()
    page.keyboard.press('Control+v')
    expand(page, 'course', '2. Term cards')
    wait_for(page, lambda: quiz_name in children(page, 'course', '2. Term cards'), 'the copy from a library not open lands in an open file')
    need(dot(page, 'Test library'), 'and that file shows the unsaved dot')
    fold(page, 'doc', 'Test library')

    # Enter on something inside opens the library, then that item's page.
    drive_row(page, 'beta').locator('[data-chevron]').click()
    wait_for(page, lambda: quizzes.count() == 0 and inside.count() >= 1, 'beta shows its courses again')
    inside.first.locator('[data-chevron]').click()
    wait_for(page, lambda: quizzes.count() >= 1, 'and its quizzes')
    target_quiz = quizzes.first.locator('.kit-row-label').inner_text()
    quizzes.first.click()
    page.keyboard.press('Enter')
    wait_for(page, lambda: 'beta.shrimp' in labels(page, 'doc'), 'Enter on a quiz inside opens the library')
    back_to_explorer(page)
    wait_for(page, lambda: page.locator('.pane-crumbs', has_text=target_quiz).count() >= 1, 'and shows that quiz\'s page')
    need(drive_rows(page) == ['alpha.shrimp', 'gamma.shrimp'], f'it leaves the "not open" ones: {drive_rows(page)}')

    # Enter opens a library as a file of the tree: selected, in the same sorted place, no longer "not open".
    drive_row(page, 'alpha').click()
    page.keyboard.press('Enter')
    page.locator('[role=tab]', has_text='alpha.shrimp').wait_for()
    back_to_explorer(page)
    wait_for(page, lambda: 'alpha.shrimp' in labels(page, 'doc'), 'Enter opens the library as a file')
    wait_for(page, lambda: selected(page) == ['alpha.shrimp'], f'the opened file is selected: {selected(page)}')
    need(drive_rows(page) == ['gamma.shrimp'], f'an open library is not listed twice: {drive_rows(page)}')
    files = top_level(page)
    need([f[0] for f in files] == sorted_names, f'it stays in its place: {files}')
    need('Open, ' in files[0][1] and 'Google Drive' in files[0][2], f'and now says it is open: {files[0]}')

    # Move to bin asks first, then lists again.
    menu(page, drive_row(page, 'gamma'), 'Move to bin')
    dialog = page.locator('dialog[open]')
    dialog.wait_for()
    need('gamma.shrimp' in dialog.inner_text(), 'it asks about that library')
    dialog.get_by_role('button', name='Move to bin').click()
    wait_for(page, lambda: state['trashed'] == ['gamma'] and drive_rows(page) == [], 'the library is moved to the bin and leaves the list')

    # A failed list shows a line and a Retry button under the tree, never a row.
    state['fail'] = True
    page.wait_for_timeout(700)  # the workspace record waits out 300ms
    page.reload()
    box = page.locator('.explorer-drive')
    wait_for(page, lambda: box.count() == 1 and "Couldn't load your Google Drive." in box.inner_text(), 'a list that fails says so')
    need(page.locator('.kit-tree .kit-row[data-id^="g:"]').count() == 0, 'it is not a tree row')
    state['fail'] = False
    box.get_by_role('button', name='Retry').click()
    wait_for(page, lambda: page.locator('.explorer-drive').get_by_role('button', name=re.compile('Choose files in Google Drive')).count() == 1, 'Retry lists again')


def run(page, base):
    state = {'files': [{'id': i, 'name': f'{i}.shrimp'} for i in ('alpha', 'beta', 'gamma')], 'fail': False, 'lists': 0, 'trashed': []}
    stub_google(page, state)
    # With no file open the Explorer is a calm empty state: a title and one set of buttons.
    page.goto(base)
    page.locator('body').click(position={'x': 5, 'y': 790})
    page.keyboard.press('Control+Shift+E')
    empty = page.locator('.explorer-empty')
    wait_for(page, lambda: empty.count() == 1, 'no files: the Explorer shows its empty state')
    need('No files here yet' in empty.inner_text(), 'with a short title')
    buttons = [b.strip() for b in empty.locator('button').all_inner_texts()]
    need(buttons == ['Sign in with Google', 'New file', 'Open file'], f'and one set of buttons: {buttons}')
    need(page.locator('.explorer-tip').count() == 0, 'no tip while there is nothing to right-click')
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Load guide').click()
    page.get_by_text('Loaded the guide.').first.wait_for()
    page.goto(base + '#/')

    # The Explorer opens from the sidebar, and again with Ctrl+Shift+E once closed.
    page.locator('.sidebar-explorer').click()
    wait_for(page, lambda: page.locator('[role=tab]', has_text='Explorer').count() == 1, 'the sidebar opens the Explorer')
    tab = page.locator('[role=tab]', has_text='Explorer')
    tab.hover()
    tab.locator('button').click()
    wait_for(page, lambda: page.locator('[role=tab]', has_text='Explorer').count() == 0, 'the Explorer closes')
    page.locator('body').click(position={'x': 5, 'y': 790})
    page.keyboard.press('Control+Shift+E')
    wait_for(page, lambda: page.locator('.kit-tree').count() == 1, 'Ctrl+Shift+E opens the Explorer')
    need(labels(page, 'doc') == ['Guide', 'Test library'], f'both files are in the tree, sorted by name: {labels(page, "doc")}')
    need(not dot(page, 'Test library') and not dot(page, 'Guide'), 'no file starts with unsaved changes')

    # The tip, the (i) that explains everything (Esc closes it), and the chevron that reacts like the app's other chevrons.
    need('Right-click anything' in page.locator('.explorer-tip').inner_text(), 'a tip says to right-click')
    need(page.locator('.explorer-tip').bounding_box()['y'] < page.locator('.kit-tree').bounding_box()['y'], 'above the tree')
    row(page, 'doc', 'Guide').click(button='right')
    page.get_by_role('menuitem').first.wait_for()
    page.keyboard.press('Escape')
    wait_for(page, lambda: page.locator('.explorer-tip').count() == 0, 'the tip is gone after the first right-click')
    page.get_by_role('button', name='What the Explorer can do').click()
    info = page.locator('.explorer-info')
    wait_for(page, lambda: info.is_visible(), 'the (i) opens the explanation')
    need('Google Drive' in info.inner_text() and 'Ctrl+Z' in info.inner_text() and 'F2' in info.inner_text(), 'it covers the features')
    page.keyboard.press('Escape')
    wait_for(page, lambda: not info.is_visible(), 'Esc closes it')
    chevron = row(page, 'doc', 'Guide').locator('[data-chevron]')
    before = row(page, 'doc', 'Guide').bounding_box()
    chevron.hover()
    page.wait_for_timeout(400)
    need(chevron.evaluate('e => getComputedStyle(e).cursor') == 'pointer', 'the chevron shows the pointer')
    need(chevron.locator('svg').evaluate('e => e.getBoundingClientRect().width') > 20, 'and springs up a size')
    need(row(page, 'doc', 'Guide').bounding_box() == before and chevron.bounding_box()['width'] == 16, 'inside its fixed cell: nothing moves')
    page.mouse.move(700, 600)

    # Keyboard: arrows open and move, Home and End jump.
    row(page, 'doc', 'Test library').click()
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowDown')
    need(selected(page) == ['1. Start here'], f'ArrowDown selects the first course: {selected(page)}')
    page.keyboard.press('ArrowRight')
    page.keyboard.press('ArrowDown')
    need(selected(page) == ['Read me first'], f'a course opens and the arrow goes to its quiz: {selected(page)}')
    page.keyboard.press('ArrowLeft')
    need(selected(page) == ['1. Start here'], 'ArrowLeft goes back to the parent')
    page.keyboard.press('End')
    need(selected(page) != ['1. Start here'], 'End goes to the last row')
    page.keyboard.press('Home')
    need(selected(page) == ['Guide'], 'Home goes to the first row')

    # A course dragged into the other file moves; both files show the unsaved dot; Ctrl+Z restores both.
    collapse_all(page)
    expand(page, 'doc', 'Test library')
    expand(page, 'doc', 'Guide')
    guide_courses = children(page, 'doc', 'Guide')
    test_courses = children(page, 'doc', 'Test library')
    mover = guide_courses[-1]
    drag_row(page, row(page, 'course', mover), row(page, 'doc', 'Test library'))
    wait_for(page, lambda: mover in children(page, 'doc', 'Test library'), 'the course moved into the other file')
    need(children(page, 'doc', 'Guide') == guide_courses[:-1], 'the course left its file')
    need(dot(page, 'Test library') and dot(page, 'Guide'), 'both files show the unsaved dot')
    page.keyboard.press('Control+z')
    wait_for(page, lambda: children(page, 'doc', 'Guide') == guide_courses, 'Ctrl+Z puts the course back')
    need(children(page, 'doc', 'Test library') == test_courses, 'Ctrl+Z restores the other file too')
    wait_for(page, lambda: not dot(page, 'Test library') and not dot(page, 'Guide'), 'Ctrl+Z clears both dots')

    # A refused drop says why.
    expand(page, 'course', '1. Start here')
    expand(page, 'quiz', 'Read me first')
    drag_row(page, row(page, 'card', 'One'), row(page, 'course', '2. Term cards'), release=False)
    need(drop_label(page) == 'A card can only go in a quiz.', f'a refused drop shows its reason: {drop_label(page)}')
    page.mouse.up()
    page.wait_for_timeout(150)
    need(not dot(page, 'Guide') and not dot(page, 'Test library'), 'a refused drop changes nothing')

    # Copy a quiz and paste it into a course of the other file; names are made free on the second paste.
    quiz = 'Read me first'
    target = guide_courses[-1]
    row(page, 'quiz', quiz).click()
    page.keyboard.press('Control+c')
    row(page, 'course', target).click()
    page.keyboard.press('Control+v')
    expand(page, 'course', target)
    wait_for(page, lambda: quiz in children(page, 'course', target), 'the quiz is pasted into the course')
    need(dot(page, 'Guide') and not dot(page, 'Test library'), 'only the file pasted into shows the dot')
    need(quiz in children(page, 'course', '1. Start here'), 'copy leaves the original')
    row(page, 'course', target).click()
    page.keyboard.press('Control+v')
    wait_for(page, lambda: f'{quiz} (2)' in children(page, 'course', target), f'the second paste gets a free name: {children(page, "course", target)}')

    # Cut two cards (picked in reverse) and paste them into another quiz: their order is kept.
    other = 'Paste import samples'
    expand(page, 'quiz', other)
    before = children(page, 'quiz', other)
    row(page, 'card', 'Five').click()
    row(page, 'card', 'Two').click(modifiers=['Control'])
    page.keyboard.press('Control+x')
    need(page.locator('.kit-tree .kit-row.is-dimmed').count() == 2, 'cut cards are dimmed')
    row(page, 'quiz', other).click()
    page.keyboard.press('Control+v')
    wait_for(page, lambda: children(page, 'quiz', other) == before + ['Two', 'Five'], f'cut cards keep their order: {children(page, "quiz", other)}')
    need('Two' not in children(page, 'quiz', quiz) and 'Five' not in children(page, 'quiz', quiz), 'cut cards leave their quiz')

    # Ctrl+drag a quiz into a course: a copy (the cards folded so both files fit on screen).
    fold(page, 'quiz', quiz)
    fold(page, 'quiz', other)
    expand(page, 'doc', 'Guide')
    count = len(children(page, 'course', '1. Start here'))
    drag_row(page, row(page, 'quiz', other), row(page, 'course', target), modifiers=['Control'])
    wait_for(page, lambda: other in children(page, 'course', target), 'Ctrl+drag copies the quiz into the other file')
    need(len(children(page, 'course', '1. Start here')) == count, 'a copy leaves the original')

    # Move to… lists the other files' courses; choosing one moves the quiz there.
    collapse_all(page)
    expand(page, 'doc', 'Guide')
    expand(page, 'course', target)
    menu(page, row(page, 'quiz', other), 'Move to')
    dialog = page.locator('dialog[open]')
    dialog.wait_for()
    need('Move 1 quiz to' in dialog.inner_text(), 'the dialog names what moves')
    dialog.get_by_role('button', name=re.compile('Test library > 2. Term cards')).click()
    page.locator('dialog[open]').wait_for(state='detached')
    expand(page, 'doc', 'Test library')
    expand(page, 'course', '2. Term cards')
    need(other in children(page, 'course', '2. Term cards'), 'Move to moved the quiz into the chosen course')
    need(other not in children(page, 'course', target), 'it left the course it came from')

    # A new course starts in rename; a taken name is refused; a free one is kept.
    menu(page, row(page, 'doc', 'Test library'), 'New course')
    field = page.locator('.kit-row-input')
    field.wait_for()
    need(field.input_value() == 'New course', 'the new course starts as "New course"')
    field.fill('2. Term cards')
    need('already named' in page.locator('.kit-row-error').inner_text(), 'a taken name is refused with a message')
    field.press('Enter')
    need(page.locator('.kit-row-input').count() == 1, 'Enter does nothing while the name is taken')
    field.fill('Zed course')
    field.press('Enter')
    wait_for(page, lambda: 'Zed course' in labels(page, 'course'), 'the new course takes its name')

    # Deleting a card is at once, with an Undo toast; a quiz asks first.
    expand(page, 'course', '1. Start here')
    expand(page, 'quiz', 'Paste import samples')
    n = len(children(page, 'quiz', 'Paste import samples'))
    victim = children(page, 'quiz', 'Paste import samples')[0]
    row(page, 'card', victim).click()
    page.keyboard.press('Delete')
    wait_for(page, lambda: len(children(page, 'quiz', 'Paste import samples')) == n - 1, 'a card is deleted at once')
    need(page.get_by_text('Deleted 1 card.').count() >= 1 and undo_toast(page).count() >= 1, 'the toast says so and offers Undo')
    undo_toast(page).first.click()
    wait_for(page, lambda: children(page, 'quiz', 'Paste import samples')[0] == victim, 'Undo brings the card back in its place')
    copies = rows_of(page, 'quiz', 'Paste import samples').count()
    row(page, 'quiz', 'Paste import samples').click()
    page.keyboard.press('Delete')
    dialog = page.locator('dialog[open]')
    dialog.wait_for()
    need('Delete "Paste import samples" and its' in dialog.inner_text(), f'a quiz asks first: {dialog.inner_text()}')
    dialog.get_by_role('button', name='Delete').click()
    wait_for(page, lambda: rows_of(page, 'quiz', 'Paste import samples').count() == copies - 1, 'the quiz is deleted once confirmed')

    # Search narrows the tree; Esc clears it.
    search = page.locator('.explorer-search textarea')
    search.fill('Opposites')
    wait_for(page, lambda: 'Opposites' in labels(page) and 'Read me first' not in labels(page), f'search filters the tree: {labels(page)}')
    need('2. Term cards' in labels(page), 'a match keeps its parents')
    search.press('Escape')
    wait_for(page, lambda: 'Zed course' in labels(page), 'Esc clears the search')

    # Enter on a quiz opens its page in a group beside the Explorer; Reveal from that tab selects the quiz again.
    expand(page, 'doc', 'Test library')
    expand(page, 'course', '2. Term cards')
    row(page, 'quiz', 'Opposites').click()
    page.keyboard.press('Enter')
    wait_for(
        page,
        lambda: page.locator('.wb-group:not(:has(.kit-tree)) .pane-crumbs', has_text='Opposites').count() >= 1,
        'Enter opens the quiz page in another group',
    )
    need(page.locator('.wb-group:has(.kit-tree) .pane-crumbs', has_text='Opposites').count() == 0, 'not in the Explorer\'s own group')
    row(page, 'doc', 'Guide').click()
    page.get_by_role('button', name='Collapse all').click()
    other_group = page.locator('.wb-group:not(:has(.kit-tree))').first
    other_group.locator('[role=tab][aria-selected=true]').first.click(button='right')
    page.get_by_role('menuitem', name='Reveal in Explorer').click()
    wait_for(page, lambda: selected(page) == ['Opposites'], f'Reveal selects the tab\'s quiz: {selected(page)}')

    # A reload keeps the open nodes and the selection (the rows drawn past the window's edge may differ, so the first ones).
    def shape():
        return page.evaluate(
            "[...document.querySelectorAll('.kit-tree .kit-row')].slice(0, 9).map(r => [r.querySelector('.kit-row-label')?.textContent, r.getAttribute('aria-expanded')])"
        )

    shape_before = shape()
    page.wait_for_timeout(700)  # the workspace record waits out 300ms
    page.reload()
    page.locator('.kit-tree .kit-row').first.wait_for()
    wait_for(page, lambda: selected(page) == ['Opposites'] and shape() == shape_before, f'the selection and open nodes are restored: {shape()} vs {shape_before}')

    drive_tests(page, state)
    # The stubbed list that was made to fail is the one console error expected.
    page.errors[:] = [e for e in page.errors if 'status of 500' not in e]
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))

    # Signed out, a Drive file that is open is not "yours" (nobody can tell): the sidebar's words, never "Your".
    page.evaluate("sessionStorage.removeItem('shrimply-google-sign-in')")
    page.wait_for_timeout(700)  # the workspace record waits out 300ms
    page.reload()
    wait_for(page, lambda: page.locator('.explorer-drive').get_by_role('button', name='Sign in to see your Google Drive').count() == 1, 'signed out again, the link is back')
    where = [f[2] for f in top_level(page) if f[0] in ('alpha.shrimp', 'beta.shrimp')]
    need(len(where) == 2 and all(w in ('On Google Drive', 'Shared on Google Drive') for w in where), f'a Drive file open while signed out is not "your": {where}')

