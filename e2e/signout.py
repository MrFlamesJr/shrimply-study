"""One Google account per browser (against a stubbed Google): a new tab is still signed in with its Drive libraries back;
a 401 from Google pauses the save ("Not saved: sign in again") instead of signing out, and signing in again resumes it;
Sign out with a save that fails asks first (Cancel keeps everything signed in), then closes every Drive library in both
tabs and a reload shows none; Sign out anyway closes them too.

Also the stub the other Drive modules share: `new_state`, `add_file`, `change`, `shrimp`, `stub_google` and the small
helpers (`sign_in`, `open_from_drive`, `row`, `edit_quiz`...)."""
import io
import json
import os
import re
import sys
import zipfile
from urllib.parse import unquote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from explorer import FAKE_GIS  # noqa: E402

EMAIL = 'stub@example.com'
CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, *',
    'access-control-allow-methods': '*',
}
# Console errors the stub's refusals cause on purpose.
EXPECTED = ('status of 400', 'status of 401', 'status of 404')


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def wait_for(page, check, what, timeout=6000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def shrimp(course='Alpha course', quiz='Alpha quiz', cards=(('Apple', 'Pomme'), ('Dog', 'Chien'), ('Cat', 'Chat'))):
    """A small .shrimp file (library.json only) as bytes."""
    library = {'version': 3, 'courses': [{'name': course, 'quizzes': [{'name': quiz, 'cards': [{'term': t, 'definition': d} for t, d in cards]}]}]}
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w') as z:
        z.writestr('library.json', json.dumps(library))
    return out.getvalue()


def library_of(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return json.loads(z.read('library.json').decode('utf-8'))


def new_state():
    """What the stubbed Google holds and has been asked: `files` by id, switches `fail` (uploads answer 400) and `expired`
    (uploads answer 401), and counts."""
    return {'files': {}, 'next': 1, 'saves': 0, 'creates': [], 'reads': {}, 'fail': False, 'expired': False, 'lists': 0,
            'trashed': [], 'shared': [], 'unshared': []}


def add_file(state, file_id, name, data=None, mine=True, shared=False):
    state['files'][file_id] = {'name': name, 'data': data or shrimp(), 'md5': 'm0', 'mine': mine, 'shared': shared, 'trashed': False}


def change(state, file_id, data):
    """Someone else changes the file in Drive: other bytes, another checksum."""
    f = state['files'][file_id]
    f['data'] = data
    f['md5'] = f"m{int(f['md5'][1:]) + 1}"


def _multipart(req):
    boundary = re.search(r'boundary=(.+)$', req.headers['content-type']).group(1).encode()
    meta, data = {}, b''
    for part in req.post_data_buffer.split(b'--' + boundary):
        if b'\r\n\r\n' not in part:
            continue
        head, body = part.split(b'\r\n\r\n', 1)
        body = body[:-2] if body.endswith(b'\r\n') else body
        if b'name="metadata"' in head:
            meta = json.loads(body)
        elif b'name="file"' in head:
            data = body
    return meta, data


def stub_google(context, state):
    """Google's sign-in script and the Drive calls, kept in `state`."""

    def drive(route):
        req = route.request
        url = unquote(req.url)
        if req.method == 'OPTIONS':
            return route.fulfill(status=204, headers=CORS)
        if 'gsi/client' in url:
            return route.fulfill(content_type='text/javascript', body=FAKE_GIS)
        if '/about' in url:
            return route.fulfill(headers=CORS, json={'user': {'emailAddress': EMAIL}})
        files = state['files']
        refuse = lambda status, reason: route.fulfill(status=status, headers=CORS, json={'error': {'errors': [{'reason': reason}], 'message': 'Stub refused'}})  # noqa: E731
        up = re.search(r'/upload/drive/v3/files(?:/([^?/]+))?', url)
        if up:
            if state['expired']:
                return refuse(401, 'authError')
            if state['fail']:
                return refuse(400, 'badRequest')
            if req.method == 'POST':
                meta, data = _multipart(req)
                file_id = f"new{state['next']}"
                state['next'] += 1
                add_file(state, file_id, meta['name'], data)
                state['creates'].append(meta['name'])
                return route.fulfill(headers=CORS, json={'id': file_id, 'name': meta['name'], 'md5Checksum': files[file_id]['md5']})
            f = files.get(up.group(1))
            if not f or not f['mine']:
                return refuse(404, 'notFound')
            f['data'] = req.post_data_buffer
            f['md5'] = f"m{int(f['md5'][1:]) + 1}"
            state['saves'] += 1
            return route.fulfill(headers=CORS, json={'md5Checksum': f['md5']})
        m = re.search(r'/drive/v3/files/([^?/]+)(/permissions(?:/([^?]+))?)?', url)
        if m:
            f = files.get(m.group(1))
            signed = 'authorization' in req.headers
            if m.group(2):
                if not f or not f['mine']:
                    return refuse(404, 'notFound')
                if req.method == 'POST':
                    f['shared'] = True
                    state['shared'].append(m.group(1))
                    return route.fulfill(headers=CORS, json={'id': 'anyone1'})
                if req.method == 'DELETE':
                    f['shared'] = False
                    state['unshared'].append(m.group(1))
                    return route.fulfill(status=204, headers=CORS)
                return route.fulfill(headers=CORS, json={'permissions': [{'id': 'anyone1', 'type': 'anyone'}] if f['shared'] else []})
            if req.method == 'PATCH':
                if not f or not f['mine']:
                    return refuse(404, 'notFound')
                f['trashed'] = True
                state['trashed'].append(m.group(1))
                return route.fulfill(headers=CORS, json={'id': m.group(1)})
            if not f or not (f['shared'] or (signed and f['mine'])):
                return refuse(404, 'notFound')
            if 'alt=media' in url:
                state['reads'][m.group(1)] = state['reads'].get(m.group(1), 0) + 1
                return route.fulfill(headers=CORS, content_type='application/zip', body=f['data'])
            return route.fulfill(headers=CORS, json={'name': f['name'], 'md5Checksum': f['md5'], 'trashed': f['trashed'], 'capabilities': {'canEdit': f['mine']}})
        # The list endpoint: the app's folder (looked up, or made), else the user's libraries.
        if req.method == 'POST':
            return route.fulfill(headers=CORS, json={'id': 'folder'})
        if "name = 'Shrimply Study'" in url:
            return route.fulfill(headers=CORS, json={'files': [{'id': 'folder'}]})
        state['lists'] += 1
        return route.fulfill(headers=CORS, json={'files': [
            {'id': i, 'name': f['name'], 'mimeType': 'application/zip', 'modifiedTime': '2026-11-01T10:00:00Z'}
            for i, f in files.items() if f['mine'] and not f['trashed']]})

    context.route(re.compile(r'https://(accounts\.google\.com/gsi/client|www\.googleapis\.com/(upload/)?drive/v3/.*)'), drive)


def row(page, name, exact=False):
    text = re.compile(f'^{re.escape(name)}$') if exact else name
    return page.locator('.file-row').filter(has=page.locator('.file-name-text', has_text=text))


def where(page, name, exact=False):
    return row(page, name, exact).locator('.file-where').inner_text()


def row_button(page, name, label):
    """A button on a file's toolbar (it slides in while the row is pointed at)."""
    r = row(page, name)
    r.hover()
    return r.get_by_role('button', name=label, exact=True)


def sign_in(page):
    page.locator('.account-box .account-sign-in').click()
    wait_for(page, lambda: EMAIL in page.locator('.account-box.is-signed-in .account-email').all_inner_texts(), 'signed in: the account box shows the email')


def open_dialog(page):
    d = page.locator('dialog[open]').filter(has=page.locator('.open-panels')).last
    for _ in range(3):
        page.locator('.files-head').get_by_role('button', name='Open', exact=True).click()
        try:
            d.wait_for(timeout=4000)
            return d
        except Exception:
            pass
    d.wait_for()
    return d


def open_tab(d, name):
    """The Open dialog's tab (Google Drive, Shared link, This device); its panel is the section named by the tab."""
    d.get_by_text(name, exact=True).first.click()
    panel = {'Google Drive': 'drive', 'Shared link': 'link', 'This device': 'device'}[name]
    section = d.locator(f'section[aria-label="{panel}"]')
    section.wait_for()
    return section


def open_from_drive(page, name):
    d = open_dialog(page)
    open_tab(d, 'Google Drive')
    item = d.locator('.drive-files li', has_text=name)
    item.wait_for()
    item.get_by_role('button', name='Open', exact=True).click()
    wait_for(page, lambda: row(page, name).count() == 1, f'{name} opens as a file')
    d.wait_for(state='hidden')


def edit_quiz(page, marker):
    """Rename the active file's first quiz (a change in that file), then leave the field."""
    block = page.locator('.file-block.is-active')
    block.locator('.file-course').first.wait_for()
    if block.locator('.file-quiz').count() == 0:
        block.locator('.file-course [data-chevron]').first.click()
    block.locator('.file-quiz').first.click()
    page.get_by_role('button', name='Edit quiz').click()
    field = page.get_by_label('Quiz name')
    field.click()
    field.press('Control+a')
    field.press_sequentially(marker)
    page.evaluate('document.activeElement.blur()')


def sign_out(page):
    page.locator('.account-box').get_by_role('button', name='Sign out').click()


def signed_out(page):
    return page.locator('.account-box .account-sign-in').count() == 1


def run(page, base):
    state = new_state()
    add_file(state, 'alpha', 'alpha.shrimp')
    stub_google(page.context, state)
    page.goto(base + '#/')
    box = page.locator('.account-box')
    need('Not signed in' in box.inner_text(), f'signed out, the account box says so: {box.inner_text()}')
    sign_in(page)
    open_from_drive(page, 'alpha.shrimp')
    edit_quiz(page, 'Changed here')
    wait_for(page, lambda: state['saves'] == 1, 'the edit autosaves')

    # A new tab is still signed in, and the Drive library is back as it was left.
    page.wait_for_timeout(700)  # the browser backup waits out 300ms
    fresh = page.context.new_page()
    fresh.errors = []
    fresh.on('console', lambda m: fresh.errors.append(m.text) if m.type == 'error' else None)
    fresh.goto(base + '#/')
    wait_for(fresh, lambda: EMAIL in fresh.locator('.account-box.is-signed-in .account-email').all_inner_texts(), 'the new tab is signed in')
    wait_for(fresh, lambda: row(fresh, 'alpha.shrimp').count() == 1, 'with its Drive library back')
    need(not signed_out(fresh), 'no sign-in button in the new tab')

    # A 401 pauses the save; it is no sign-out. Signing in again resumes it.
    state['expired'] = True
    edit_quiz(page, 'Second edit')
    wait_for(page, lambda: 'Not saved: sign in again' in where(page, 'alpha.shrimp'), f'a 401 pauses the save: {where(page, "alpha.shrimp")}')
    need(row(page, 'alpha.shrimp').locator('.file-dot').count() == 1, 'the row shows its dot')
    need(not signed_out(page) and EMAIL in page.locator('.account-box .account-email').inner_text(), 'and the account stays signed in')
    saves = state['saves']
    state['expired'] = False
    row_button(page, 'alpha.shrimp', 'Save alpha.shrimp').click()
    wait_for(page, lambda: state['saves'] == saves + 1 and 'Saved' in where(page, 'alpha.shrimp'), 'Save now resumes it')
    need(row(page, 'alpha.shrimp').locator('.file-dot').count() == 0, 'the dot goes')

    # Sign out with a save that fails asks first; Cancel keeps everything signed in.
    state['fail'] = True
    edit_quiz(page, 'Third edit')
    sign_out(page)
    ask = page.get_by_role('dialog').filter(has_text=re.compile('saved yet'))
    ask.wait_for()
    need('alpha.shrimp' in ask.inner_text(), f'it names the file: {ask.inner_text()[:200]}')
    for name in ('Cancel', 'Download a copy', 'Sign out anyway'):
        need(ask.get_by_role('button', name=name, exact=True).count() == 1, f'the question offers {name}')
    ask.get_by_role('button', name='Cancel', exact=True).click()
    ask.wait_for(state='hidden')
    need(not signed_out(page) and row(page, 'alpha.shrimp').count() == 1 and row(fresh, 'alpha.shrimp').count() == 1, 'Cancel keeps everything open and signed in')

    # With the save working again, Sign out saves first and asks nothing; every Drive library closes in both tabs.
    state['fail'] = False
    saves = state['saves']
    sign_out(page)
    wait_for(page, lambda: signed_out(page), 'signed out')
    need(state['saves'] == saves + 1, 'the pending edit was saved first')
    need(page.get_by_role('dialog').count() == 0 or not page.get_by_role('dialog').is_visible(), 'no question when the save works')
    page.locator('.toast', has_text='Signed out. Your Google Drive libraries are closed.').first.wait_for()
    wait_for(page, lambda: row(page, 'alpha.shrimp').count() == 0, 'its library is closed')
    wait_for(fresh, lambda: signed_out(fresh) and row(fresh, 'alpha.shrimp').count() == 0, 'the other tab signs out and closes it too')
    page.wait_for_timeout(700)
    page.reload()
    wait_for(page, lambda: signed_out(page), 'a reload is still signed out')
    need(page.locator('.file-row').count() == 0, 'and shows no Drive library')
    fresh.reload()
    wait_for(fresh, lambda: signed_out(fresh), 'the other tab too after a reload')
    need(fresh.locator('.file-row').count() == 0, 'with none either')
    fresh.close()

    # Sign out anyway: the unsaved edit is let go, the library closes.
    sign_in(page)
    open_from_drive(page, 'alpha.shrimp')
    state['fail'] = True
    edit_quiz(page, 'Lost edit')
    sign_out(page)
    ask = page.get_by_role('dialog').filter(has_text=re.compile('saved yet'))
    ask.wait_for()
    ask.get_by_role('button', name='Sign out anyway', exact=True).click()
    wait_for(page, lambda: signed_out(page) and row(page, 'alpha.shrimp').count() == 0, 'Sign out anyway signs out and closes the library')
    page.wait_for_timeout(700)
    page.reload()
    wait_for(page, lambda: signed_out(page), 'signed out after a reload')
    need(page.locator('.file-row').count() == 0, 'nothing of the account stays')
    errors = [e for e in page.errors if not any(x in e for x in EXPECTED)] + [e for e in fresh.errors if not any(x in e for x in EXPECTED)]
    if errors:
        raise AssertionError('errors: ' + '; '.join(errors))
