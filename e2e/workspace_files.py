"""Open files: two browser libraries from the debug page, no unsaved dot or title mark (browser libraries keep
themselves), Ctrl+Z, a reload that restores both (the right one active), closing a file never asks (a toast with
Reopen, which brings it back)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def rows(page):
    return page.locator('.file-row')


def row(page, name):
    return rows(page).filter(has=page.locator('.file-name-text', has_text=name))


def active_name(page):
    return page.locator('.file-row.is-active .file-name-text').inner_text()


def wait_for(page, check, what, timeout=5000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def first_quiz(page):
    """The active file's first quiz link (unfolding its first course when it is folded)."""
    block = page.locator('.file-block.is-active')
    if block.locator('.file-quiz').count() == 0:
        block.locator('.file-course [data-chevron]').first.click()
    return block.locator('.file-quiz').first


def run(page, base):
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Load guide').click()
    page.get_by_text('Loaded the guide.').first.wait_for()
    assert rows(page).locator('.file-name-text').all_inner_texts() == ['Guide', 'Test library'], 'two open files, by name'
    assert active_name(page) == 'Guide', 'the last opened file is active'
    assert '_debug' in page.url, 'opening from the debug page stays on it'

    # An edit in the guide marks only the guide, and the tab title.
    quiz = first_quiz(page).get_attribute('href')
    page.goto(base + quiz + '/edit')
    field = page.get_by_label('Quiz name')
    before = field.input_value()
    field.click()
    field.press('End')
    field.press_sequentially(' X')
    page.evaluate('document.activeElement.blur()')
    page.wait_for_timeout(500)
    assert rows(page).locator('.file-dot').count() == 0, 'a browser library never shows an unsaved dot'
    assert not page.title().startswith('*'), 'and no mark in the tab title'

    # Ctrl+Z outside any field undoes the rename and clears the marks.
    page.keyboard.press('Control+z')
    wait_for(page, lambda: field.input_value() == before, 'undo puts the name back')
    assert field.input_value() == before, 'undo puts the name back'

    # A reload brings both files back, the same one active.
    page.wait_for_timeout(700)  # the backup writes wait out 300ms
    page.reload()
    page.locator('.file-row').nth(1).wait_for()
    assert rows(page).locator('.file-name-text').all_inner_texts() == ['Guide', 'Test library'], 'both files restored'
    assert active_name(page) == 'Guide', 'the active file restored'

    # Closing never asks, with changes or without; a toast says where the file is and Reopen brings it back.
    test = row(page, 'Test library')
    test.hover()
    test.get_by_role('button', name='Close Test library', exact=True).click()
    wait_for(page, lambda: rows(page).count() == 1, 'the file closes at once')
    assert page.locator('dialog[open]').count() == 0, 'no question'
    toast = page.locator('.toast', has_text='Closed "Test library"')
    toast.wait_for()
    toast.get_by_role('button', name='Reopen').click()
    wait_for(page, lambda: rows(page).count() == 2, 'Reopen opens it again')

    row(page, 'Guide').locator('.file-name-text').click()
    page.goto(base + quiz + '/edit')
    field = page.get_by_label('Quiz name')
    field.click()
    field.press('End')
    field.press_sequentially(' Y')
    page.evaluate('document.activeElement.blur()')
    guide = row(page, 'Guide')
    guide.hover()
    guide.get_by_role('button', name='Close Guide', exact=True).click()
    wait_for(page, lambda: rows(page).count() == 1, 'a file with changes closes at once too')
    assert page.locator('dialog[open]').count() == 0, "no Save / Don't save question"
    page.locator('.toast', has_text='Closed "Guide"').get_by_role('button', name='Reopen').click()
    wait_for(page, lambda: rows(page).count() == 2, 'Reopen brings it back')
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
