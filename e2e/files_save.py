"""Saving local files with a fake File System Access API (Playwright can't drive Chrome's pickers): open a .shrimp,
the unsaved dot, Ctrl+S into the same file, a file changed on disk, a failing write, Download, two edited files (one
with a handle, one new) saved by their rows, then Save all (its button and Ctrl+Alt+S), opening the same file twice,
closing with changes, and a reload that keeps the handle."""
import base64
import io
import json
import os
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import ROOT  # noqa: E402

# The fake disk lives in sessionStorage so it survives a reload, like a real disk. A handle is plain data (cloneable
# into IndexedDB, as real ones are); reading one back from IndexedDB turns it into the live fake again.
FAKE_FS = r"""
(() => {
  const KEY = 'fake-disk'
  const load = () => JSON.parse(sessionStorage.getItem(KEY) || '{}')
  const store = (d) => sessionStorage.setItem(KEY, JSON.stringify(d))
  const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s) }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
  const fs = (window.__fs = {
    perm: 'granted', requested: 0, failNext: false, nextOpen: [], nextSave: null, saveCalls: [], writes: 0,
    put(name, data, mod) { const d = load(); d[name] = { b64: data, mod: mod ?? Date.now() }; store(d) },
    read(name) { return load()[name]?.b64 ?? null },
    mod(name) { return load()[name]?.mod ?? null },
    // Someone else changes the file: other bytes, a later time.
    touch(name) { const d = load(); d[name] = { b64: b64(new Uint8Array([...unb64(d[name].b64), 0]).slice(0, unb64(d[name].b64).length)), mod: d[name].mod + 5000 }; store(d) },
    names() { return Object.keys(load()) },
  })
  class Handle {
    constructor(name) { this.kind = 'file'; this.name = name; this.__fakeHandle = name }
    async getFile() {
      const f = load()[this.name]
      if (!f) throw new DOMException('Not found', 'NotFoundError')
      return new File([unb64(f.b64)], this.name, { lastModified: f.mod })
    }
    async createWritable() {
      const name = this.name
      const chunks = []
      return {
        async write(data) {
          if (fs.failNext) { fs.failNext = false; throw new DOMException('The disk is full.', 'QuotaExceededError') }
          chunks.push(data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data.buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data))
        },
        async close() {
          const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
          let at = 0
          for (const c of chunks) { all.set(c, at); at += c.length }
          const d = load()
          d[name] = { b64: b64(all), mod: Math.max(Date.now(), (d[name]?.mod ?? 0) + 1) }
          store(d)
          fs.writes++
        },
        async abort() { chunks.length = 0 },
      }
    }
    async queryPermission() { return fs.perm }
    async requestPermission() { fs.requested++; fs.perm = 'granted'; return 'granted' }
    async isSameEntry(other) { return other.name === this.name }
  }
  window.showOpenFilePicker = async () => {
    const names = fs.nextOpen.splice(0)
    if (!names.length) throw new DOMException('Cancelled', 'AbortError')
    return names.map((n) => new Handle(n))
  }
  window.showSaveFilePicker = async (options) => {
    fs.saveCalls.push(options.suggestedName)
    const name = fs.nextSave
    fs.nextSave = null
    if (!name) throw new DOMException('Cancelled', 'AbortError')
    const d = load()
    if (!d[name]) { d[name] = { b64: '', mod: Date.now() }; store(d) }
    return new Handle(name)
  }
  const result = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result')
  Object.defineProperty(IDBRequest.prototype, 'result', {
    get() {
      const v = result.get.call(this)
      return v && typeof v === 'object' && typeof v.__fakeHandle === 'string' ? new Handle(v.__fakeHandle) : v
    },
  })
})()
"""


def wait_for(page, check, what, timeout=6000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def row(page, name):
    return page.locator('.file-row').filter(has=page.locator('.file-name-text', has_text=name))


def dirty(page, name):
    return row(page, name).locator('.file-dot').count() == 1


def disk(page, name):
    data = page.evaluate('n => window.__fs.read(n)', name)
    return base64.b64decode(data) if data is not None else None


def library_json(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        return z.read('library.json').decode('utf-8')


def edit_quiz(page, marker):
    """Rename the active file's first quiz (a change in that file), then leave the field."""
    page.locator('.tree-quizzes a').first.click()
    page.get_by_role('button', name='Edit quiz').click()
    field = page.get_by_label('Quiz name')
    field.click()
    field.press('Control+a')
    field.press_sequentially(marker)
    page.evaluate('document.activeElement.blur()')


def open_fake(page, name):
    page.evaluate('n => window.__fs.nextOpen.push(n)', name)
    page.locator('.files-head').get_by_role('button', name='Open file', exact=True).click()


def dialog(page, title):
    d = page.get_by_role('dialog')
    d.wait_for()
    assert title in d.inner_text(), f'dialog "{title}", got: {d.inner_text()[:80]}'
    return d


def press_save(page):
    page.evaluate('document.activeElement && document.activeElement.blur()')
    page.keyboard.press('Control+s')


def run(page, base):
    page.add_init_script(FAKE_FS)
    page.goto(base + '#/')
    page.reload()
    page.wait_for_function('window.__fs')
    sample = open(os.path.join(ROOT, 'samples', 'edge-cases.shrimp'), 'rb').read()
    page.evaluate('([n, d]) => window.__fs.put(n, d, 1000000)', ['fa.shrimp', base64.b64encode(sample).decode()])

    # Open: one document on "On this device", nothing unsaved.
    open_fake(page, 'fa.shrimp')
    wait_for(page, lambda: row(page, 'fa.shrimp').count() == 1, 'the file opens as a row')
    assert 'On this device' in row(page, 'fa.shrimp').inner_text(), 'tied to a file on this device'
    assert not dirty(page, 'fa.shrimp'), 'no unsaved dot after opening'
    original = disk(page, 'fa.shrimp')

    # Edit, Ctrl+S: the same fake file gets the bytes, the dot clears.
    edit_quiz(page, 'Saved one')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'an edit shows the unsaved dot')
    press_save(page)
    wait_for(page, lambda: not dirty(page, 'fa.shrimp'), 'Ctrl+S clears the dot')
    saved = disk(page, 'fa.shrimp')
    assert saved[:2] == b'PK' and saved != original, 'the file holds a new zip'
    assert 'Saved one' in library_json(saved), 'the saved file holds the edit'
    assert page.evaluate('window.__fs.names()') == ['fa.shrimp'], 'no other file written'

    # The file changes on disk: Save asks; Cancel keeps the dot and the file, Replace overwrites.
    edit_quiz(page, 'Second edit')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'the second edit shows the dot')
    page.evaluate("window.__fs.touch('fa.shrimp')")
    touched = disk(page, 'fa.shrimp')
    press_save(page)
    d = dialog(page, 'File changed on disk')
    d.get_by_role('button', name='Cancel', exact=True).click()
    wait_for(page, lambda: page.locator('dialog[open]').count() == 0, 'Cancel closes the question')
    assert dirty(page, 'fa.shrimp'), 'Cancel keeps the dot'
    assert disk(page, 'fa.shrimp') == touched, 'Cancel leaves the file alone'
    press_save(page)
    d = dialog(page, 'File changed on disk')
    d.get_by_role('button', name='Replace', exact=True).click()
    wait_for(page, lambda: not dirty(page, 'fa.shrimp'), 'Replace saves and clears the dot')
    assert 'Second edit' in library_json(disk(page, 'fa.shrimp')), 'Replace overwrote the file'

    # A failing write: an error toast, the dot stays; the next save works.
    edit_quiz(page, 'Third edit')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'the third edit shows the dot')
    before = disk(page, 'fa.shrimp')
    page.evaluate('window.__fs.failNext = true')
    press_save(page)
    page.locator('.toast.is-error', has_text='Not saved').wait_for()
    assert dirty(page, 'fa.shrimp'), 'a failed write keeps the dot'
    assert disk(page, 'fa.shrimp') == before, 'a failed write leaves the file as it was'
    press_save(page)
    wait_for(page, lambda: not dirty(page, 'fa.shrimp'), 'the next save works')
    assert 'Third edit' in library_json(disk(page, 'fa.shrimp')), 'the retry wrote the edit'

    # Download: the save picker names a new file; the original is untouched and the dot stays.
    edit_quiz(page, 'Fourth edit')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'the fourth edit shows the dot')
    before = disk(page, 'fa.shrimp')
    page.evaluate("window.__fs.nextSave = 'copy.shrimp'")
    row(page, 'fa.shrimp').hover()
    row(page, 'fa.shrimp').get_by_role('button', name='Download fa.shrimp', exact=True).click()
    wait_for(page, lambda: disk(page, 'copy.shrimp'), 'Download writes the picked file')
    assert page.evaluate('window.__fs.saveCalls') == ['fa.shrimp'], 'the picker suggests the file name'
    assert disk(page, 'copy.shrimp')[:2] == b'PK' and 'Fourth edit' in library_json(disk(page, 'copy.shrimp')), 'the copy holds the edit'
    assert disk(page, 'fa.shrimp') == before, 'Download leaves the original untouched'
    assert dirty(page, 'fa.shrimp') and row(page, 'copy.shrimp').count() == 0, 'the dot stays and no row for the copy'

    # Two edited files, each saved by its row: one has a handle (writes in place), one is new (Save as picker).
    page.locator('.files-head').get_by_role('button', name='New file', exact=True).click()
    wait_for(page, lambda: page.locator('.file-row').count() == 2, 'a new library opens beside it')
    new_row = page.locator('.file-row').nth(1)
    page.get_by_role('button', name='New course').click()
    page.keyboard.type('Brand new')
    page.keyboard.press('Enter')
    wait_for(page, lambda: new_row.locator('.file-dot').count() == 1, 'the new library shows the dot')
    page.evaluate("window.__fs.nextSave = 'fresh.shrimp'")
    new_row.hover()
    new_row.get_by_role('button', name='Save New library', exact=True).click()
    wait_for(page, lambda: disk(page, 'fresh.shrimp'), 'the new library is written through the picker')
    wait_for(page, lambda: new_row.locator('.file-dot').count() == 0, 'its dot clears')
    assert 'Brand new' in library_json(disk(page, 'fresh.shrimp')), 'fresh.shrimp holds its course'
    assert page.evaluate('window.__fs.saveCalls')[-1].endswith('.shrimp'), 'the picker was asked for a .shrimp name'
    assert dirty(page, 'fa.shrimp'), 'the other file is still unsaved'
    row(page, 'fa.shrimp').hover()
    row(page, 'fa.shrimp').get_by_role('button', name='Save fa.shrimp', exact=True).click()
    wait_for(page, lambda: not dirty(page, 'fa.shrimp'), 'the file with a handle saves in place')
    assert 'Fourth edit' in library_json(disk(page, 'fa.shrimp')), 'fa.shrimp holds the edit'
    saves = page.evaluate('window.__fs.saveCalls')
    assert len(saves) == 2, f'in-place saves never open the picker: {saves}'

    # Save all (the Files heading): every file with changes, one after another; the one with a handle writes in place,
    # a new library goes through the Save as picker. Then Ctrl+Alt+S; with nothing to save the button is greyed out.
    save_all = page.locator('.files-head').get_by_role('button', name='Save all', exact=True)
    assert save_all.is_disabled(), 'Save all is greyed out with nothing to save'
    page.locator('.files-head').get_by_role('button', name='New file', exact=True).click()
    wait_for(page, lambda: page.locator('.file-row').count() == 3, 'a third library opens')
    third = page.locator('.file-row').nth(2)
    page.get_by_role('button', name='New course').click()
    page.keyboard.type('All saved')
    page.keyboard.press('Enter')
    wait_for(page, lambda: third.locator('.file-dot').count() == 1, 'the third library shows the dot')
    row(page, 'fa.shrimp').locator('.file-pick').click()
    edit_quiz(page, 'Saved by all')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'fa.shrimp shows the dot again')
    page.evaluate("window.__fs.nextSave = 'all.shrimp'")
    save_all.click()
    wait_for(page, lambda: not dirty(page, 'fa.shrimp') and third.locator('.file-dot').count() == 0, 'Save all clears every dot')
    assert 'Saved by all' in library_json(disk(page, 'fa.shrimp')), 'Save all wrote fa.shrimp in place'
    assert 'All saved' in library_json(disk(page, 'all.shrimp')), 'Save all wrote the new library through the picker'
    saves = page.evaluate('window.__fs.saveCalls')
    assert len(saves) == 3, f'only the new library opened the picker: {saves}'
    edit_quiz(page, 'Saved by keys')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'another edit shows the dot')
    page.evaluate('document.activeElement && document.activeElement.blur()')
    page.keyboard.press('Control+Alt+s')
    wait_for(page, lambda: not dirty(page, 'fa.shrimp'), 'Ctrl+Alt+S saves every file with changes')
    assert 'Saved by keys' in library_json(disk(page, 'fa.shrimp')), 'Ctrl+Alt+S wrote fa.shrimp'

    # Opening a file that is already open shows its row: no second one.
    open_fake(page, 'fa.shrimp')
    page.wait_for_timeout(500)
    assert row(page, 'fa.shrimp').count() == 1 and page.locator('.file-row').count() == 3, 'no second row for the same file'
    assert 'is-active' in row(page, 'fa.shrimp').get_attribute('class'), 'the open file is active'

    # Close with changes: Cancel keeps it, Don't save closes and leaves the file.
    edit_quiz(page, 'Fifth edit')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'the fifth edit shows the dot')
    kept = disk(page, 'fa.shrimp')

    def ask_close():
        row(page, 'fa.shrimp').hover()
        row(page, 'fa.shrimp').get_by_role('button', name='Close fa.shrimp', exact=True).click()
        return dialog(page, 'Close file')

    ask_close().get_by_role('button', name='Cancel', exact=True).click()
    wait_for(page, lambda: page.locator('dialog[open]').count() == 0, 'Cancel closes the question')
    assert row(page, 'fa.shrimp').count() == 1 and dirty(page, 'fa.shrimp'), 'Cancel keeps the file and its dot'
    ask_close().get_by_role('button', name="Don't save", exact=True).click()
    wait_for(page, lambda: row(page, 'fa.shrimp').count() == 0, "Don't save closes the file")
    assert disk(page, 'fa.shrimp') == kept, "Don't save leaves the file unchanged"

    # Reopen: it shows the saved edit (not the discarded one); then edit and Save through the close question.
    open_fake(page, 'fa.shrimp')
    wait_for(page, lambda: row(page, 'fa.shrimp').count() == 1, 'the file opens again')
    page.locator('.tree-quizzes a').first.wait_for()
    assert 'Saved by keys' in page.locator('.tree-quizzes').first.inner_text(), 'the reopened file shows its saved edit'
    edit_quiz(page, 'Sixth edit')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'the sixth edit shows the dot')
    ask_close().get_by_role('button', name='Save', exact=True).click()
    wait_for(page, lambda: row(page, 'fa.shrimp').count() == 0, 'Save closes the file')
    assert 'Sixth edit' in library_json(disk(page, 'fa.shrimp')), 'Save wrote before closing'

    # A reload keeps the file tied to its handle: Save asks permission, then writes.
    open_fake(page, 'fa.shrimp')
    wait_for(page, lambda: row(page, 'fa.shrimp').count() == 1, 'the file opens once more')
    edit_quiz(page, 'Seventh edit')
    wait_for(page, lambda: dirty(page, 'fa.shrimp'), 'the seventh edit shows the dot')
    page.wait_for_timeout(800)  # the backup writes wait out 300ms
    page.reload()
    page.wait_for_function('window.__fs')
    wait_for(page, lambda: row(page, 'fa.shrimp').count() == 1 and dirty(page, 'fa.shrimp'), 'the reload restores the file with its changes')
    assert 'On this device' in row(page, 'fa.shrimp').inner_text(), 'still tied to its file after the reload'
    page.evaluate("window.__fs.perm = 'prompt'")
    press_save(page)
    wait_for(page, lambda: not dirty(page, 'fa.shrimp'), 'Save after a reload clears the dot')
    assert page.evaluate('window.__fs.requested') == 1, 'Save asked for permission once'
    assert 'Seventh edit' in library_json(disk(page, 'fa.shrimp')), 'it wrote into the file after the permission'
    assert json.dumps(page.errors) == '[]', f'errors: {page.errors}'
