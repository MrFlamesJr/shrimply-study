"""Signing out of Google never loses an edit (against a stubbed Google): with the user's own Drive file open and
unsaved, Sign out asks first. Without saving, the file hides (its tab says why, the sidebar counts it) and comes back
with its changes after signing in; Save all and sign out saves, closes and signs out, and a failed save keeps
everything signed in; a new tab starts signed out with the file hidden, and says so."""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from explorer import CORS, FAKE_GIS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMAIL = 'stub@example.com'


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def wait_for(page, check, what, timeout=6000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def stub_google(context, state):
    """Google's sign-in script and the Drive calls: one library, `alpha.shrimp`, the user's own; saves count, or fail."""
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
            return route.fulfill(headers=CORS, json={'user': {'emailAddress': EMAIL}})
        if '/upload/' in url:
            if state['fail']:
                return route.fulfill(status=400, headers=CORS, json={'error': {'errors': [{'reason': 'badRequest'}], 'message': 'Stub refused'}})
            state['saves'] += 1
            state['md5'] = f"v{state['saves']}"
            return route.fulfill(headers=CORS, json={'md5Checksum': state['md5']})
        m = re.search(r'/drive/v3/files/([^?]+)', url)
        if m and 'alt=media' in url:
            return route.fulfill(headers=CORS, content_type='application/zip', body=guide)
        if m:
            return route.fulfill(headers=CORS, json={'name': 'alpha.shrimp', 'md5Checksum': state['md5'], 'trashed': False, 'capabilities': {'canEdit': True}})
        return route.fulfill(headers=CORS, json={'files': [{'id': 'alpha', 'name': 'alpha.shrimp', 'mimeType': 'application/zip', 'modifiedTime': '2026-11-01T10:00:00Z'}]})

    context.route(re.compile(r'https://(accounts\.google\.com/gsi/client|www\.googleapis\.com/(upload/)?drive/v3/.*)'), drive)


def row(page):
    return page.locator('.file-row').filter(has=page.locator('.file-name-text', has_text='alpha.shrimp'))


def drive_dialog(page):
    page.locator('.files-head').get_by_role('button', name='Google Drive', exact=True).click()
    d = page.get_by_role('dialog').filter(has=page.locator('.drive-panel'))
    d.wait_for()
    return d


def open_alpha(page):
    d = drive_dialog(page)
    if d.get_by_role('button', name='Sign in with Google').count():
        d.get_by_role('button', name='Sign in with Google').click()
    item = d.locator('.drive-files li', has_text='alpha.shrimp')
    item.wait_for()
    item.get_by_role('button', name='Open').click()
    wait_for(page, lambda: row(page).count() == 1, 'alpha opens as a file')
    d.wait_for(state='hidden')


def sign_out(page, answer):
    d = drive_dialog(page)
    d.get_by_role('button', name='Sign out', exact=True).click()
    ask = page.get_by_role('dialog').filter(has_text='Save and close your Google Drive files before signing out?')
    ask.wait_for()
    need('alpha.shrimp (unsaved changes)' in ask.inner_text(), f'the question lists the file and its unsaved mark: {ask.inner_text()[:200]}')
    ask.get_by_role('button', name=answer).click()
    return d


def edit_quiz(page, marker):
    page.locator('.tree-quizzes a').first.click()
    page.get_by_role('button', name='Edit quiz').click()
    field = page.get_by_label('Quiz name')
    field.click()
    field.press('Control+a')
    field.press_sequentially(marker)
    page.evaluate('document.activeElement.blur()')


def run(page, base):
    state = {'saves': 0, 'fail': False, 'md5': 'v0'}
    stub_google(page.context, state)
    page.goto(base + '#/')
    open_alpha(page)
    edit_quiz(page, 'Changed here')
    wait_for(page, lambda: row(page).locator('.file-dot').count() == 1, 'the edit marks alpha unsaved')

    # Sign out without saving: alpha hides, kept with its changes; its tab says why; the sidebar counts it.
    d = sign_out(page, 'Sign out without saving')
    wait_for(page, lambda: d.get_by_role('button', name='Sign in with Google').count() == 1, 'signed out')
    page.keyboard.press('Escape')
    wait_for(page, lambda: row(page).count() == 0, 'alpha is no longer listed')
    note = page.locator('.files .hidden-files')
    need(note.inner_text().startswith('1 Google Drive file is hidden until you sign in.'), f'the sidebar counts it: {note.inner_text()}')
    need('your' not in note.inner_text().lower(), 'never "your" signed out')
    shown = page.locator('.wb-cell .wb-tab:not([hidden])')
    wait_for(page, lambda: shown.locator('.hidden-file').count() == 1, 'its tab shows why it is hidden')
    need('Changed here' not in page.locator('.wb-cell').inner_text(), 'nothing of it shows')
    need(page.locator('.wb-cell [role=tab]', has_text='Hidden file').count() >= 1, 'its tab is named Hidden file')

    # Signing in again brings it back as it was, unsaved changes and all.
    note.get_by_role('button', name='Sign in').click()
    wait_for(page, lambda: row(page).count() == 1 and row(page).locator('.file-dot').count() == 1, 'alpha is back, still unsaved')
    need(page.locator('.files .hidden-files').count() == 0, 'the note goes')
    wait_for(page, lambda: page.get_by_label('Quiz name').count() == 1 and 'Changed here' in page.get_by_label('Quiz name').input_value(), 'with its change')

    # Save all and sign out with a save that fails: nothing closed, still signed in.
    state['fail'] = True
    d = sign_out(page, 'Save all and sign out')
    page.locator('.toast', has_text='Still signed in').first.wait_for()
    need(row(page).count() == 1 and row(page).locator('.file-dot').count() == 1, 'alpha stays open and unsaved')
    need(d.get_by_role('button', name='Sign out', exact=True).count() == 1, 'and the tab stays signed in')
    page.keyboard.press('Escape')

    # It works: saved, closed, signed out.
    state['fail'] = False
    d = sign_out(page, 'Save all and sign out')
    wait_for(page, lambda: state['saves'] == 1 and row(page).count() == 0, 'saved to Drive, then closed')
    wait_for(page, lambda: d.get_by_role('button', name='Sign in with Google').count() == 1, 'then signed out')
    need(page.locator('.files .hidden-files').count() == 0, 'nothing hidden: it was closed')
    page.keyboard.press('Escape')

    # A new tab starts signed out: the user's own file hides there, and it says so.
    open_alpha(page)
    page.wait_for_timeout(700)  # the browser backup waits out 300ms
    fresh = page.context.new_page()
    fresh.goto(base + '#/')
    fresh.locator('.files .hidden-files').wait_for()
    need(row(fresh).count() == 0, 'not listed in the new tab')
    fresh.locator('.toast', has_text='Signed out of Google.').first.wait_for()
    need(row(page).count() == 1, 'still open in the tab signed in')
    fresh.close()
    errors = [e for e in page.errors if 'status of 400' not in e]
    if errors:
        raise AssertionError('errors: ' + '; '.join(errors))
