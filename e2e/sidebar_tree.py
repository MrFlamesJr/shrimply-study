"""The sidebar's one tree (open files > courses > quizzes): the active file unfolded and the others folded, a chevron
unfolding without changing the active file, a quiz of another file opening and making its file active, the current
page row, the keyboard, Fold all and the hover card."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def wait_for(page, check, what, timeout=5000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def block(page, name):
    return page.locator('.file-block').filter(has=page.locator('.file-name-text', has_text=name))


def focused_id(page):
    return page.evaluate("document.activeElement?.dataset?.id ?? null")


def run(page, base):
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Load guide').click()
    page.get_by_text('Loaded the guide.').first.wait_for()
    page.goto(base + '#/')
    guide, test = block(page, 'Guide'), block(page, 'Test library')

    wait_for(page, lambda: guide.locator('.file-course').count() > 0, 'the active file is unfolded')
    # Each file unfolded when it was active, and nothing folds by itself.
    assert test.locator('.file-course').count() > 0, 'the file that was active stays unfolded'

    # A chevron folds and unfolds a file without making it the active one.
    test.locator('.file-pick [data-chevron]').click()
    wait_for(page, lambda: test.locator('.file-course').count() == 0, 'the chevron folds the other file')
    assert page.locator('.file-row.is-active .file-name-text').inner_text() == 'Guide', 'the active file stays'
    test.locator('.file-pick [data-chevron]').click()
    wait_for(page, lambda: test.locator('.file-course').count() > 0, 'the chevron unfolds the other file')
    assert page.locator('.file-row.is-active .file-name-text').inner_text() == 'Guide', 'the active file stays'

    # A quiz of the other file opens and makes its file active.
    for chevron in test.locator('.file-course [data-chevron]').all():
        chevron.click()
    quiz = test.locator('.file-quiz').first
    quiz.wait_for()
    href = quiz.get_attribute('href')
    quiz.click()
    wait_for(page, lambda: page.locator('.file-row.is-active .file-name-text').inner_text() == 'Test library', 'the quiz makes its file active')
    wait_for(page, lambda: href in page.url, 'the quiz page is shown')
    current = page.locator('.files-tree [aria-current="page"]')
    assert current.count() == 1 and 'file-quiz' in current.get_attribute('class'), 'the shown quiz row is the current page'
    assert current.get_attribute('href') == href, 'the current row is that quiz'

    # Keyboard: arrows move between rows, Left goes to the parent, then folds it.
    quiz = test.locator('.file-quiz[aria-current="page"]')
    quiz.focus()
    start = focused_id(page)
    page.keyboard.press('ArrowUp')
    wait_for(page, lambda: focused_id(page) not in (None, start), 'ArrowUp moves the focus to another row')
    assert page.evaluate("document.activeElement.getAttribute('role')") == 'treeitem', 'the focus sits on a treeitem'
    page.keyboard.press('ArrowDown')
    wait_for(page, lambda: focused_id(page) == start, 'ArrowDown moves back')
    page.keyboard.press('ArrowLeft')
    wait_for(page, lambda: (focused_id(page) or '').startswith('c:'), 'Left goes to the parent course')
    count = test.locator('.file-quiz').count()
    page.keyboard.press('ArrowLeft')
    wait_for(page, lambda: test.locator('.file-quiz').count() < count, 'Left folds the course')

    # Fold all folds every file.
    page.get_by_role('button', name='Fold all').click()
    wait_for(page, lambda: page.locator('.file-course').count() == 0, 'Fold all folds every file')
    assert page.locator('.file-row').count() == 2, 'the file rows stay'
    assert page.get_by_role('button', name='Fold all').is_disabled(), 'Fold all is greyed out with nothing unfolded'

    # The selected file row (its home shown) has a layer of its own: its actions must still take their clicks.
    page.goto(base + '#/')
    wait_for(page, lambda: page.locator('.file-row.is-active .file-pick[aria-current="page"]').count() == 1, 'the home shown selects the file row')
    page.locator('.file-row.is-active').hover()
    on_top = page.evaluate("""() => [...document.querySelectorAll('.file-row.is-active .file-actions button')].map(b => {
      const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return b === hit || b.contains(hit) })""")
    assert on_top and all(on_top), f"the selected file's actions are on top: {on_top}"
    page.get_by_role('button', name='Fold all').click()

    # Pointing at a file for a moment shows its card, with its counts.
    page.locator('.file-row').first.hover()
    page.wait_for_timeout(600)
    card = page.locator('.file-info:popover-open')
    card.wait_for()
    assert 'courses' in card.inner_text() and 'quizzes' in card.inner_text(), f'the card shows the counts: {card.inner_text()}'
    page.mouse.move(700, 400)
    wait_for(page, lambda: page.locator('.file-info:popover-open').count() == 0, 'the card goes when the pointer leaves')
    # Pointing at a file shows its New course, which adds a course to that file and opens it.
    row = page.locator('.file-row').filter(has=page.locator('.file-name-text', has_text='Test library'))
    add_course = row.get_by_role('button', name='New course in Test library')
    assert add_course.evaluate('b => getComputedStyle(b.parentElement).opacity') == '0', 'New course hides at rest'
    row.hover()
    wait_for(page, lambda: add_course.evaluate('b => getComputedStyle(b.parentElement).opacity') == '1', 'pointing at the file shows New course')
    add_course.click()
    wait_for(page, lambda: page.locator('.file-row.is-active .file-name-text').inner_text() == 'Test library', 'the new course is in that file')
    test = block(page, 'Test library')
    wait_for(page, lambda: test.locator('.file-course[aria-current="page"]').count() == 1, 'the new course is the page shown')

    # Pointing at a course shows its New quiz, which adds a quiz and opens its editor.
    line = test.locator('.file-course-line').filter(has=page.locator('.file-course[aria-current="page"]'))
    add_quiz = line.locator('.file-add')
    assert add_quiz.evaluate('b => getComputedStyle(b).opacity') == '0', 'New quiz hides at rest'
    line.hover()
    wait_for(page, lambda: add_quiz.evaluate('b => getComputedStyle(b).opacity') == '1', 'pointing at the course shows New quiz')
    add_quiz.click()
    wait_for(page, lambda: '/edit' in page.url, 'New quiz opens its editor')
    wait_for(page, lambda: test.locator('.file-quiz[aria-current="page"]').count() == 1, 'the new quiz is in the tree, as the page shown')
    # A file with no courses looks like any other, with nothing under it; its toolbar's New course adds one. None at
    # the bottom of the sidebar.
    assert page.locator('.sidebar-bar').get_by_role('button', name='New course').count() == 0, 'no New course at the bottom'
    page.locator('.files-head').get_by_role('button', name='New file', exact=True).click()
    wait_for(page, lambda: page.locator('.file-row').count() == 3, 'a new file opens')
    fresh = page.locator('.file-block').filter(has=page.locator('.file-name-text', has_text='New library'))
    assert fresh.locator('.file-course').count() == 0 and fresh.locator('.file-empty').count() == 0, 'nothing under an empty file'
    fresh.locator('.file-row').hover()
    fresh.get_by_role('button', name='New course in New library', exact=True).click()
    wait_for(page, lambda: fresh.locator('.file-course').count() == 1, "the empty file's New course adds a course there")
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
