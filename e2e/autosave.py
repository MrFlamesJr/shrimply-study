"""Libraries save themselves (against a stubbed Google). A browser library: Ctrl+S opens Upload to Google Drive; closing
never asks and toasts with Reopen; a closed browser library stays in the Explorer without its Open chip, after a reload
too, reopens from there, and Delete from this browser asks first; Download a copy, open it again (a browser library with
a free name) and Upload with Replace it. A Drive library: an edit saves after the delay (typing merges); an expired
token pauses the save and its button resumes it; a change on Google Drive asks once (Cancel stays paused, Keep mine
replaces, Take the Drive version takes it); the close toast's Reopen."""
import os
import re
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from explorer import back_to_explorer, menu  # noqa: E402
from signout import (EXPECTED, add_file, change, edit_quiz, library_of, need, new_state, open_dialog,  # noqa: E402
                     open_from_drive, open_tab, row, row_button, shrimp, stub_google, wait_for, where)


def dialog_with(page, text):
    d = page.get_by_role('dialog').filter(has_text=re.compile(text)).last
    d.wait_for()
    return d


def drive_row(page, name):
    """A closed file's row in the Explorer, by its exact name."""
    return page.locator('.kit-tree .kit-row[data-id^="g:f:"]').filter(has=page.locator('.kit-row-label', has_text=re.compile(f'^{re.escape(name)}$')))


def open_explorer(page):
    page.locator('body').click(position={'x': 5, 'y': 790})
    page.keyboard.press('Control+Shift+E')
    page.locator('.kit-tree').wait_for()


def run(page, base):
    # No native pickers: Download falls back to a download and Open to the file input.
    page.add_init_script('window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined')
    state = new_state()
    add_file(state, 'alpha', 'alpha.shrimp')
    add_file(state, 'existing', 'Test library (2).shrimp', shrimp(course='Old course', quiz='Old quiz'))
    stub_google(page.context, state)
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.goto(base + '#/')
    wait_for(page, lambda: row(page, 'Test library').count() == 1, 'the test library is a file')
    need(where(page, 'Test library') == 'Only in this browser', f'a browser library says so: {where(page, "Test library")}')

    # Ctrl+S on a browser library opens Upload to Google Drive, the name prefilled.
    page.locator('body').click(position={'x': 5, 'y': 790})
    page.keyboard.press('Control+s')
    d = dialog_with(page, 'Upload to Google Drive')
    need(d.get_by_label('File name').input_value() == 'Test library', 'the name is prefilled')
    page.keyboard.press('Escape')
    d.wait_for(state='hidden')

    # Closing a browser library asks nothing and toasts with Reopen, which brings it back.
    row_button(page, 'Test library', 'Close Test library').click()
    toast = page.locator('.toast', has_text='Closed "Test library"')
    toast.wait_for()
    need("It's still in this browser: open it again from the Explorer." in toast.inner_text(), f'the close toast: {toast.inner_text()}')
    need(page.locator('dialog[open]').count() == 0, 'no question')
    wait_for(page, lambda: row(page, 'Test library').count() == 0, 'the file closes')
    toast.get_by_role('button', name='Reopen').click()
    wait_for(page, lambda: row(page, 'Test library').count() == 1, 'Reopen opens it again')

    # Closed, it stays in the Explorer without its Open chip, after a reload too, and Enter opens it.
    row_button(page, 'Test library', 'Close Test library').click()
    wait_for(page, lambda: row(page, 'Test library').count() == 0, 'closed again')
    open_explorer(page)
    closed = drive_row(page, 'Test library')
    wait_for(page, lambda: closed.count() == 1, 'a closed browser library is listed in the Explorer')
    need(closed.locator('.explorer-chip').count() == 0, 'with no Open chip')
    page.wait_for_timeout(700)  # the workspace record waits out 300ms
    page.reload()
    back_to_explorer(page)
    wait_for(page, lambda: drive_row(page, 'Test library').count() == 1, 'still listed after a reload')
    drive_row(page, 'Test library').click()
    page.keyboard.press('Enter')
    wait_for(page, lambda: row(page, 'Test library').count() == 1, 'Enter reopens it')
    back_to_explorer(page)
    wait_for(page, lambda: drive_row(page, 'Test library').count() == 0, 'it leaves the closed ones')

    # Download a copy, open it again: a second browser library with a free name; the toast's Upload with Replace it.
    with page.expect_download() as download:
        row_button(page, 'Test library', 'Download a copy of Test library').click()
    suggested = download.value.suggested_filename
    need(suggested.endswith('.shrimp'), f'a .shrimp file: {suggested}')
    copy = os.path.join(tempfile.mkdtemp(prefix='shrimply-e2e-'), suggested)
    download.value.save_as(copy)
    d = open_dialog(page)
    device = open_tab(d, 'This device')
    with page.expect_file_chooser() as chooser:
        device.get_by_role('button', name='Choose a file', exact=True).click()
    chooser.value.set_files(copy)
    toast = page.locator('.toast', has_text='in this browser')
    toast.first.wait_for()
    need('Opened "Test library (2)" in this browser.' in toast.first.inner_text(), f'it opens as a browser library with a free name: {toast.first.inner_text()}')
    wait_for(page, lambda: row(page, 'Test library (2)').count() == 1, 'the copy is a second file')
    toast.first.get_by_role('button', name='Upload to Google Drive').click()
    ask = dialog_with(page, 'already has a library (named|called)')
    for name in ('Replace it', 'Keep both'):
        need(ask.get_by_role('button', name=name, exact=True).count() == 1, f'it offers {name}')
    ask.get_by_role('button', name='Replace it', exact=True).click()
    wait_for(page, lambda: state['saves'] == 1, 'Replace it writes into the existing Drive file')
    need(state['creates'] == [], f'and makes no new file: {state["creates"]}')
    need(library_of(state['files']['existing']['data'])['courses'][0]['name'] != 'Old course', 'it holds the uploaded library')
    wait_for(page, lambda: page.locator('.file-where', has_text='Google Drive').count() == 1, 'the library is now a Drive file')
    
    # Closing a Drive file flushes, then toasts where it is.
    drive_name = page.locator('.file-row', has=page.locator('.file-where', has_text='Google Drive')).locator('.file-name-text').inner_text()
    row_button(page, drive_name, f'Close {drive_name}').click()
    toast = page.locator('.toast', has_text=f'Closed "{drive_name}"')
    toast.wait_for()
    need("It's in your Google Drive: open it again from the Explorer." in toast.inner_text(), f'the Drive close toast: {toast.inner_text()}')
    wait_for(page, lambda: row(page, drive_name).count() == 0, 'the Drive file closes')

    # Delete from this browser asks first.
    row_button(page, 'Test library', 'Close Test library').click()
    wait_for(page, lambda: row(page, 'Test library').count() == 0, 'the other library closes')
    open_explorer(page)
    wait_for(page, lambda: drive_row(page, 'Test library').count() == 1, 'it is listed closed')
    menu(page, drive_row(page, 'Test library'), 'Delete from this browser')
    ask = page.locator('dialog[open]')
    ask.wait_for()
    ask.get_by_role('button', name='Cancel', exact=True).click()
    ask.wait_for(state='hidden')
    need(drive_row(page, 'Test library').count() == 1, 'Cancel keeps it')
    menu(page, drive_row(page, 'Test library'), 'Delete from this browser')
    ask.wait_for()
    ask.locator('.actions button').last.click()
    wait_for(page, lambda: drive_row(page, 'Test library').count() == 0, 'confirming removes it')

    # A Drive library: an edit saves after the delay, typing merges into one save.
    open_from_drive(page, 'alpha.shrimp')
    need('Saved' in where(page, 'alpha.shrimp') or 'Your Google Drive' in where(page, 'alpha.shrimp'), f'an untouched Drive library: {where(page, "alpha.shrimp")}')
    saves = state['saves']
    edit_quiz(page, 'Changed here')
    wait_for(page, lambda: 'Saving…' in where(page, 'alpha.shrimp'), 'an edit shows Saving…')
    page.wait_for_timeout(500)
    need(state['saves'] == saves, 'it waits out the delay')
    wait_for(page, lambda: state['saves'] == saves + 1 and 'Saved' in where(page, 'alpha.shrimp'), 'then saves, and says Saved')
    page.wait_for_timeout(2500)
    need(state['saves'] == saves + 1, 'typing merged into one save')
    need('Changed here' in str(library_of(state['files']['alpha']['data'])), 'the saved file holds the edit')
    need(row(page, 'alpha.shrimp').locator('.file-dot').count() == 0, 'no dot while all is well')
    save_slot = row_button(page, 'alpha.shrimp', 'Save alpha.shrimp')
    need(save_slot.is_disabled(), 'the Save button is greyed out while everything is saved')

    # An expired token pauses the save; the button resumes it.
    state['expired'] = True
    edit_quiz(page, 'Second edit')
    wait_for(page, lambda: 'Not saved: sign in again' in where(page, 'alpha.shrimp'), f'a pause says why: {where(page, "alpha.shrimp")}')
    need(row(page, 'alpha.shrimp').locator('.file-dot').count() == 1, 'with the dot')
    need(page.locator('.file-where', has_text='Not saved').evaluate('e => getComputedStyle(e).color') != page.locator('.file-name-text').first.evaluate('e => getComputedStyle(e).color'), 'in the warning color')
    state['expired'] = False
    saves = state['saves']
    save_slot = row_button(page, 'alpha.shrimp', 'Save alpha.shrimp')
    need(save_slot.is_enabled(), 'the Save button is on while paused')
    save_slot.click()
    wait_for(page, lambda: state['saves'] == saves + 1 and 'Saved' in where(page, 'alpha.shrimp'), 'the button resumes it')

    # A change on Google Drive: asks once; Cancel stays paused, Keep mine replaces, Take the Drive version takes it.
    change(state, 'alpha', shrimp(course='Alpha course', quiz='Drive quiz'))
    edit_quiz(page, 'Mine again')
    ask = dialog_with(page, 'Google Drive')
    for name in ('Keep mine', 'Take the Drive version', 'Cancel'):
        need(ask.get_by_role('button', name=re.compile(name)).count() == 1, f'the question offers {name}')
    ask.get_by_role('button', name='Cancel').click()
    ask.wait_for(state='hidden')
    need('Changed on Google Drive' in where(page, 'alpha.shrimp'), f'Cancel stays paused: {where(page, "alpha.shrimp")}')
    page.wait_for_timeout(2500)
    need(page.locator('dialog[open]').count() == 0, 'it asked only once')
    saves = state['saves']
    row_button(page, 'alpha.shrimp', 'Save alpha.shrimp').click()
    ask = dialog_with(page, 'Google Drive')
    ask.get_by_role('button', name=re.compile('Keep mine')).click()
    wait_for(page, lambda: state['saves'] == saves + 1 and 'Saved' in where(page, 'alpha.shrimp'), 'Keep mine replaces the Drive version')
    need('Mine again' in str(library_of(state['files']['alpha']['data'])), 'with ours')
    change(state, 'alpha', shrimp(course='Alpha course', quiz='Drive quiz'))
    saves = state['saves']
    edit_quiz(page, 'Mine third')
    ask = dialog_with(page, 'Google Drive')
    ask.get_by_role('button', name=re.compile('Take the Drive version')).click()
    block = page.locator('.file-block.is-active')
    wait_for(page, lambda: 'Drive quiz' in block.inner_text() and 'Mine third' not in block.inner_text(), 'Take the Drive version shows the Drive library')
    need(state['saves'] == saves and 'Saved' in where(page, 'alpha.shrimp'), 'and saves nothing')

    # Close, then Reopen from the toast.
    row_button(page, 'alpha.shrimp', 'Close alpha.shrimp').click()
    toast = page.locator('.toast', has_text='Closed "alpha.shrimp"')
    toast.wait_for()
    toast.get_by_role('button', name='Reopen').click()
    wait_for(page, lambda: row(page, 'alpha.shrimp').count() == 1, 'Reopen opens the Drive library again')
    errors = [e for e in page.errors if not any(x in e for x in EXPECTED)]
    if errors:
        raise AssertionError('errors: ' + '; '.join(errors))
