"""Open files: two documents from the debug page, the unsaved dot and title mark per file, Ctrl+Z, a reload that
restores both (the right one active), closing a file with and without unsaved changes."""
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


def run(page, base):
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Load guide').click()
    page.get_by_text('Loaded the guide.').first.wait_for()
    assert rows(page).locator('.file-name-text').all_inner_texts() == ['Test library', 'Guide'], 'two open files'
    assert active_name(page) == 'Guide', 'the last opened file is active'
    assert '_debug' in page.url, 'opening from the debug page stays on it'

    # An edit in the guide marks only the guide, and the tab title.
    quiz = page.locator('.tree-quizzes a').first.get_attribute('href')
    page.goto(base + quiz + '/edit')
    field = page.get_by_label('Quiz name')
    before = field.input_value()
    field.click()
    field.press('End')
    field.press_sequentially(' X')
    page.evaluate('document.activeElement.blur()')
    wait_for(page, lambda: row(page, 'Guide').locator('.file-dot').count() == 1, 'the edited file shows the unsaved dot')
    assert row(page, 'Test library').locator('.file-dot').count() == 0, 'the other file shows no dot'
    assert page.title().startswith('*'), 'the tab title is marked'

    # Ctrl+Z outside any field undoes the rename and clears the marks.
    page.keyboard.press('Control+z')
    wait_for(page, lambda: row(page, 'Guide').locator('.file-dot').count() == 0, 'undo clears the dot')
    assert field.input_value() == before, 'undo puts the name back'
    assert not page.title().startswith('*'), 'undo clears the tab title mark'

    # A reload brings both files back, the same one active.
    page.wait_for_timeout(700)  # the backup writes wait out 300ms
    page.reload()
    page.locator('.file-row').nth(1).wait_for()
    assert rows(page).locator('.file-name-text').all_inner_texts() == ['Test library', 'Guide'], 'both files restored'
    assert active_name(page) == 'Guide', 'the active file restored'

    # The unedited file closes without a question.
    test = row(page, 'Test library')
    test.hover()
    test.get_by_role('button', name='Close Test library', exact=True).click()
    wait_for(page, lambda: rows(page).count() == 1, 'the unedited file closes at once')
    assert page.locator('dialog[open]').count() == 0, 'no question for a file without changes'

    # With changes, closing asks Save / Don't save / Cancel; Cancel keeps it.
    field = page.get_by_label('Quiz name')
    field.click()
    field.press('End')
    field.press_sequentially(' Y')
    page.evaluate('document.activeElement.blur()')
    guide = row(page, 'Guide')
    wait_for(page, lambda: guide.locator('.file-dot').count() == 1, 'the second edit shows the dot')
    guide.hover()
    guide.get_by_role('button', name='Close Guide', exact=True).click()
    dialog = page.get_by_role('dialog')
    dialog.wait_for()
    for name in ['Save', "Don't save", 'Cancel']:
        assert dialog.get_by_role('button', name=name, exact=True).count() == 1, f'the question offers {name}'
    dialog.get_by_role('button', name='Cancel', exact=True).click()
    wait_for(page, lambda: page.locator('dialog[open]').count() == 0, 'Cancel closes the question')
    assert rows(page).count() == 1 and guide.locator('.file-dot').count() == 1, 'Cancel keeps the file and its changes'
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
