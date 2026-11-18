"""The debug page's Reset to first visit: nothing happens before Reset is clicked (Cancel keeps the sign-in, every
library and every key), and the question lists each step. Reset then signs out, forgets the whole browser backup and
every shrimply- key, and reloads on home. The app's other tabs start afresh too (signed out), so none writes the old
libraries back. A file on this device and a Google Drive library that were open before open again afterwards."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from local_files import FAKE_FS, open_device, put  # noqa: E402
from signout import add_file, new_state, open_from_drive, row, shrimp, sign_in, signed_out, stub_google, where  # noqa: E402

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


def wait_for(page, check, what, timeout=10000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')




def rows(page):
    return sorted(page.locator('.file-row .file-name-text').all_inner_texts())


def reloaded(page, what):
    """Waits for a page that reloads by itself (its `__before` mark gone) to show the app again."""
    def fresh():
        try:
            return page.evaluate('!window.__before && !!document.querySelector(".wb-cell, .own-page")')
        except Exception:  # the page is between documents
            return False
    wait_for(page, fresh, what)


def signed_in(page):
    return page.locator('.account-box.is-signed-in').count() == 1


def run(page, base):
    # Signed in with a Google Drive library open (a stubbed Google), a file on this device (a fake disk: Playwright
    # can't drive Chrome's file picker) and a library kept only in this browser.
    state = new_state()
    add_file(state, 'alpha', 'alpha.shrimp')
    stub_google(page.context, state)
    page.context.add_init_script(FAKE_FS)
    page.goto(base + '#/')
    page.reload()
    page.wait_for_function('window.__fs')
    sign_in(page)
    open_from_drive(page, 'alpha.shrimp')
    put(page, 'beta.shrimp', shrimp(course='Beta course'))
    open_device(page, 'beta.shrimp')
    wait_for(page, lambda: row(page, 'beta', True).count() == 1, 'the file on this device opens')
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.wait_for_timeout(800)  # the backup waits out 300ms
    keys = page.evaluate(RECORDS)['keys']
    assert any(k.startswith('doc.') for k in keys) and any(k.startswith('handle.') for k in keys), f'the libraries and the file handle are in the backup: {keys}'
    page.evaluate("localStorage.setItem('shrimply-theme', 'kahoot')")
    every = ['Test library', 'alpha.shrimp', 'beta']
    assert rows(page) == every, f'three libraries open: {rows(page)}'

    # Another tab of the app, with the same libraries back from the backup. Opened from this one, so it starts with a
    # copy of its sessionStorage: the same sign-in, and the same fake disk, where the file is.
    with page.context.expect_page() as opened:
        page.evaluate("window.open(location.origin + location.pathname + '#/')")
    other = opened.value
    other.errors = []
    other.on('pageerror', lambda e: other.errors.append(f'pageerror: {e}'))
    wait_for(other, lambda: rows(other) == every and signed_in(other), f'the other tab shows them too, signed in: {rows(other)}')
    wait_for(other, lambda: where(other, 'beta', True) == 'On this device · beta.shrimp · Saved', 'tied to the file there too')
    other.evaluate('window.__before = 1')  # a mark a reload drops
    page.bring_to_front()

    # The question lists every step, and nothing happens before Reset: Cancel keeps the sign-in, the libraries and the keys.
    page.get_by_role('button', name='Reset to first visit').click()
    dialog = page.get_by_role('dialog')
    text = dialog.inner_text()
    assert 'Reset to first visit?' in text and 'the one library kept only in this browser, for good' in text, f'it says what goes: {text}'
    steps = dialog.locator('.confirm-list li').all_inner_texts()
    for step in ('Saves what is still waiting', 'Signs out of Google', 'Closes and forgets every library', 'Forgets the tabs',
                 'Forgets the preferences', 'Reloads on the welcome page'):
        assert any(s.startswith(step) for s in steps), f'the list names "{step}": {steps}'
    assert signed_in(page) and rows(page) == every, 'the question alone changes nothing: still signed in, every library open'
    dialog.get_by_role('button', name='Cancel').click()
    page.wait_for_timeout(500)
    assert page.evaluate(RECORDS)['keys'] and page.evaluate("localStorage.getItem('shrimply-theme')"), 'cancel forgets nothing'
    assert signed_in(page) and rows(page) == every, f'cancel keeps the sign-in and every library: {rows(page)}'
    assert page.locator('.toast', has_text='Signed out').count() == 0, 'and says nothing about signing out'

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
    # The new start notes the release whose welcome page it shows, and the tab notes that it is signed out; nothing else
    # (not the theme, not a sign-in) is back.
    assert sorted(left) == ['shrimply-google-tab-sign-in', 'shrimply-seen-release'], f'only the new start own keys are left: {left}'
    assert page.evaluate("sessionStorage.getItem('shrimply-google-tab-sign-in')") == '{"signedOut":true}', 'and the tab is signed out'
    assert signed_out(page) and rows(page) == [], 'signed out, no library open'

    # The other tab started afresh by itself, on home, signed out: it shows none of the old libraries.
    reloaded(other, 'the other tab reloads by itself')
    other.wait_for_timeout(800)
    assert rows(other) == [] and signed_out(other), f'the other tab is signed out with no old library: {rows(other)}'
    # So nothing writes the old libraries back: not its start, not a reload of this one.
    page.reload()
    page.locator('.wb-cell, .own-page').first.wait_for()
    page.wait_for_timeout(800)
    keys = page.evaluate(RECORDS)['keys']
    assert set(keys) <= {'workspace.v1'} and rows(page) == [], f'still nothing of the old backup once both tabs started again: {keys}, {rows(page)}'

    # The libraries open before open again: the file on this device tied to it, the Drive library after signing in.
    open_device(page, 'beta.shrimp')
    wait_for(page, lambda: row(page, 'beta', True).count() == 1, 'the file opens again after the reset')
    wait_for(page, lambda: where(page, 'beta', True) == 'On this device · beta.shrimp · Saved', f'tied to the file again: {where(page, "beta", True)}')
    sign_in(page)
    open_from_drive(page, 'alpha.shrimp')
    assert page.locator('.toast', has_text='already open').count() == 0, 'neither was still open'
    for p in (page, other):
        if p.errors:
            raise AssertionError('errors: ' + '; '.join(p.errors))
