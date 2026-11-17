"""The debug page's Reset to first visit: asks first (what goes), then forgets the whole browser backup and every
shrimply- key, and reloads on home."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

RECORDS = """() => new Promise((resolve, reject) => {
  const open = indexedDB.open('studyquiz', 1)
  open.onerror = () => reject(open.error)
  open.onsuccess = () => {
    const db = open.result
    if (!db.objectStoreNames.contains('backup')) return resolve({ keys: [] })
    const store = db.transaction('backup').objectStore('backup')
    const req = store.getAllKeys()
    req.onsuccess = () => {
      const text = store.get('workspace.v1')
      text.onsuccess = () => resolve({ keys: req.result, workspace: text.result ?? null })
    }
    req.onerror = () => reject(req.error)
  }
})"""


def wait_for(page, check, what, timeout=8000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def run(page, base):
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.wait_for_timeout(800)  # the backup waits out 300ms
    assert page.evaluate(RECORDS)['keys'], 'the open library is in the backup'
    page.evaluate("localStorage.setItem('shrimply-theme', 'kahoot')")

    # Cancel keeps everything.
    page.get_by_role('button', name='Reset to first visit').click()
    dialog = page.get_by_role('dialog')
    assert 'Reset to first visit?' in dialog.inner_text() and '1 library' in dialog.inner_text(), f'it says what goes: {dialog.inner_text()}'
    dialog.get_by_role('button', name='Cancel').click()
    page.wait_for_timeout(300)
    assert page.evaluate(RECORDS)['keys'] and page.evaluate("localStorage.getItem('shrimply-theme')"), 'cancel forgets nothing'

    # Reset forgets all of it, then reloads.
    page.get_by_role('button', name='Reset to first visit').click()
    with page.expect_navigation():
        page.get_by_role('dialog').get_by_role('button', name='Reset').click()
    page.locator('.wb-cell, .own-page').first.wait_for()
    page.wait_for_timeout(800)  # long enough for a stray backup write to come back
    after = page.evaluate(RECORDS)
    keys = after['keys']
    # The app starts again and writes its own empty workspace; nothing of the old one (no file, no closed file) is left.
    assert set(keys) <= {'workspace.v1'}, f'the backup holds no old record after the reset: {keys}'
    workspace = after['workspace']
    assert workspace is None or ('"docs":[]' in workspace and '"closed":[]' in workspace), f'and the workspace is empty: {workspace}'
    left = page.evaluate("Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter(k => k.startsWith('shrimply-'))")
    # The new start notes the release whose welcome page it shows; nothing else (not the theme, not a sign-in) is back.
    assert left == ['shrimply-seen-release'], f'only the new start own key is left: {left}'
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
