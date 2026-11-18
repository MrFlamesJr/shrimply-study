"""Local .shrimp files save when asked (a fake File System Access API; Playwright can't drive Chrome's pickers). A file
opened with a handle is "On this device · name.shrimp"; an edit says "Unsaved changes" and never reaches the file by
itself; Save on its row (greyed out with nothing to save) or Ctrl+S writes it, the first Save asking the browser for
write access in the click; closing it with changes asks (Save and close). Its hover card says it is still there.
Opening it again focuses the library it is open in, with an "already open" toast. A file changed outside is taken when
nothing is unsaved, and Save asks (Keep mine / Take the file's version) when both changed. A moved file turns the line
red ("Moved or deleted: only in this browser now") and offers Locate file (same content ties again; other content asks
Replace) and Download a copy. A reload keeps it tied. Without showOpenFilePicker (Firefox, Safari) a copy opens in
this browser."""
import base64
import io
import os
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import THEMES, contrast, set_theme, toast_detail  # noqa: E402
from signout import edit_quiz, need, row, row_button, shrimp, wait_for, where  # noqa: E402

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
    perm: 'granted', requested: 0, nextOpen: [], nextSave: null, writes: 0, picks: 0,
    put(name, data, mod) { const d = load(); d[name] = { b64: data, mod: mod ?? Date.now() }; store(d) },
    read(name) { return load()[name]?.b64 ?? null },
    mod(name) { return load()[name]?.mod ?? null },
    // The file is moved: it is gone under its old name.
    move(from, to) { const d = load(); d[to] = d[from]; delete d[from]; store(d) },
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
      if (!load()[name]) throw new DOMException('Not found', 'NotFoundError')
      const chunks = []
      return {
        async write(data) {
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
    // Renaming the file in place (Chrome): the handle follows it. `fs.moveError` makes it fail.
    async move(to) {
      if (fs.moveError) throw new Error(fs.moveError)
      fs.move(this.name, to); this.name = to; this.__fakeHandle = to
    }
  }
  // A browser whose handles have no move (Firefox's origin private files, Safari).
  fs.canMove = (on) => { if (on) Handle.prototype.move = fs.__move; else { fs.__move = Handle.prototype.move; delete Handle.prototype.move } }
  window.showOpenFilePicker = async () => {
    fs.picks++
    const names = fs.nextOpen.splice(0)
    if (!names.length) throw new DOMException('Cancelled', 'AbortError')
    return names.map((n) => new Handle(n))
  }
  window.showSaveFilePicker = async (options) => {
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


def put(page, name, data):
    page.evaluate('([n, d]) => window.__fs.put(n, d)', [name, base64.b64encode(data).decode()])


def disk_json(page, name):
    data = page.evaluate('n => window.__fs.read(n)', name)
    if data is None:
        return ''
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data))) as z:
        return z.read('library.json').decode('utf-8')


def open_device(page, name):
    """Open file through the Open dialog's This device panel (the fake picker answers with `name`)."""
    page.evaluate('n => window.__fs.nextOpen.push(n)', name)
    d = page.locator('dialog[open]').filter(has=page.locator('.open-panels')).last
    for _ in range(3):
        page.locator('.files-head').get_by_role('button', name='Open', exact=True).click()
        try:
            d.wait_for(timeout=4000)
            break
        except Exception:
            pass
    d.get_by_text('This device', exact=True).first.click()
    section = d.locator('section[aria-label="device"]')
    section.wait_for()
    section.get_by_role('button', name='Choose a file').click()
    d.wait_for(state='hidden')


def dialog(page, title):
    d = page.get_by_role('dialog').last
    d.wait_for()
    need(title in d.inner_text(), f'dialog "{title}", got: {d.inner_text()[:80]}')
    return d


def courses(page):
    return page.locator('.file-block.is-active .file-course .file-label').all_inner_texts()


def focus_window(page):
    page.evaluate("window.dispatchEvent(new Event('focus'))")


def save_button(page, name):
    r = row(page, name, True)
    r.hover()
    return r.get_by_role('button', name=f'Save {name}', exact=True)


def run(page, base):
    page.add_init_script(FAKE_FS)
    page.goto(base + '#/')
    page.reload()
    page.wait_for_function('window.__fs')
    put(page, 'alpha.shrimp', shrimp())

    # Open: tied to the file, "On this device · alpha.shrimp", nothing unsaved, no toast.
    open_device(page, 'alpha.shrimp')
    wait_for(page, lambda: row(page, 'alpha', True).count() == 1, 'the file opens as a row named after it')
    need(where(page, 'alpha', True) == 'On this device · alpha.shrimp · Saved', f'the where line names the file: {where(page, "alpha", True)}')
    need(page.locator('.toast').count() == 0, 'no toast for a file that opens tied')

    # Saves only when asked (asked for): Save is greyed out with nothing to save; an edit waits ("Unsaved changes") and
    # never reaches the file by itself; Save writes it and greys out again. The first Save asks for write access.
    page.evaluate("window.__fs.perm = 'prompt'")
    need(save_button(page, 'alpha').is_disabled(), 'Save is greyed out with nothing to save')
    edit_quiz(page, 'First edit')
    wait_for(page, lambda: where(page, 'alpha', True) == 'On this device · alpha.shrimp · Unsaved changes', f'the line says Unsaved changes: {where(page, "alpha", True)}')
    page.wait_for_timeout(2500)
    need('First edit' not in disk_json(page, 'alpha.shrimp') and page.evaluate('window.__fs.writes') == 0, 'nothing is written by itself')
    need(page.evaluate('window.__fs.requested') == 0, 'nothing asks the browser before Save')
    save = save_button(page, 'alpha')
    need(not save.is_disabled(), 'Save is enabled with changes')
    need(save.get_attribute('title') == 'Save to alpha.shrimp (Ctrl+S)', f'its tooltip: {save.get_attribute("title")}')
    save.click()
    wait_for(page, lambda: 'First edit' in disk_json(page, 'alpha.shrimp'), 'Save wrote the edit')
    need(page.evaluate('window.__fs.requested') == 1, 'the first Save asked for write access, once')
    wait_for(page, lambda: where(page, 'alpha', True) == 'On this device · alpha.shrimp · Saved', f'the saved line: {where(page, "alpha", True)}')
    need(save_button(page, 'alpha').is_disabled(), 'Save is greyed out again')
    need(row(page, 'alpha', True).locator('.file-dot').count() == 0, 'no dot')
    # The hover card looks at the file: still there (the pointer comes onto the row afresh, as the click hid the card).
    page.locator('.files-head').hover()
    row(page, 'alpha', True).hover()
    wait_for(page, lambda: 'Still there' in page.locator('.file-info').inner_text(), 'the hover card says the file is still there')
    card = page.locator('.file-info')
    text = card.inner_text()
    need(text.count('alpha.shrimp') == 1 and text.count('Saved') + text.count('saved') == 1, f'it names the file and says saved once: {text!r}')
    # It stays while the pointer is on it (asked for), and goes once the pointer leaves it.
    card.hover()
    page.wait_for_timeout(400)
    need(page.evaluate("document.querySelector('.file-info').matches(':popover-open')"), 'the card stays while pointed at')
    page.locator('.files-head').hover()
    wait_for(page, lambda: not page.evaluate("document.querySelector('.file-info').matches(':popover-open')"), 'leaving the card hides it')

    # Opening the same file again focuses that library: no new row, and a toast says it is already open.
    open_device(page, 'alpha.shrimp')
    toast = page.locator('.toast', has_text='"alpha" is already open.')
    toast.wait_for()
    need(page.locator('.file-row').count() == 1, 'still one library')
    toast.get_by_role('button', name='Dismiss').click()

    # The file changes outside with nothing unsaved: its version is taken on focus.
    put(page, 'alpha.shrimp', shrimp(course='Outside course'))
    focus_window(page)
    wait_for(page, lambda: 'Outside course' in courses(page), f'the outside version is taken: {courses(page)}')

    # Both changed: Save asks. Keep mine writes over the file (Ctrl+S here).
    edit_quiz(page, 'Mine one')
    put(page, 'alpha.shrimp', shrimp(course='Elsewhere course'))
    focus_window(page)
    page.wait_for_timeout(300)
    need('Elsewhere course' not in courses(page), 'unsaved changes here are never replaced by the file')
    page.keyboard.press('Control+s')
    d = dialog(page, 'Changed on this device')
    d.get_by_role('button', name='Keep mine', exact=True).click()
    wait_for(page, lambda: 'Mine one' in disk_json(page, 'alpha.shrimp'), 'Keep mine overwrote the file')
    # Take the file's version replaces the changes here.
    edit_quiz(page, 'Mine two')
    put(page, 'alpha.shrimp', shrimp(course='Third course'))
    save_button(page, 'alpha').click()
    d = dialog(page, 'Changed on this device')
    d.get_by_role('button', name="Take the file's version", exact=True).click()
    wait_for(page, lambda: 'Third course' in courses(page), f'the file\'s version is taken: {courses(page)}')
    need('Mine two' not in disk_json(page, 'alpha.shrimp'), 'the file was left as it was')
    wait_for(page, lambda: where(page, 'alpha', True).endswith('Saved'), 'saved again')

    # Renamed in the sidebar: the file itself is renamed (handle.move) and the library follows it; a failed move says why
    # and keeps the old name; a browser without move refuses.
    def rename_to(name):
        row(page, 'alpha' if name == 'beta' else 'beta', True).locator('.file-name-text').dblclick()
        page.keyboard.press('Control+a')
        page.keyboard.type(name)
        page.keyboard.press('Enter')

    page.evaluate("window.__fs.moveError = 'Disk is busy'")
    rename_to('beta')
    failed = page.locator('.toast', has_text="wasn't renamed")
    failed.wait_for()
    need('Disk is busy' in toast_detail(failed), f'the failed rename says why: {failed.inner_text()}')
    need(page.evaluate('window.__fs.names()') == ['alpha.shrimp'] and row(page, 'alpha', True).count() == 1, 'a failed move keeps the old file and name')
    page.evaluate("window.__fs.moveError = null; window.__fs.canMove(false)")
    rename_to('beta')
    page.locator('.toast', has_text="This browser can't rename files. Rename it on your computer, then use Locate file.").wait_for()
    need(page.evaluate('window.__fs.names()') == ['alpha.shrimp'] and row(page, 'alpha', True).count() == 1, 'no move: nothing renamed')
    page.evaluate("window.__fs.canMove(true)")
    rename_to('beta')
    wait_for(page, lambda: where(page, 'beta', True) == 'On this device · beta.shrimp · Saved', f'renamed with its file: {where(page, "beta", True)}')
    need(page.evaluate('window.__fs.names()') == ['beta.shrimp'], f'the file was renamed: {page.evaluate("window.__fs.names()")}')
    edit_quiz(page, 'After rename')
    save_button(page, 'beta').click()
    wait_for(page, lambda: 'After rename' in disk_json(page, 'beta.shrimp'), 'it still saves into the renamed file')
    wait_for(page, lambda: where(page, 'beta', True).endswith('Saved'), 'and is saved')
    rename_to('alpha')
    wait_for(page, lambda: where(page, 'alpha', True) == 'On this device · alpha.shrimp · Saved', f'renamed back: {where(page, "alpha", True)}')

    # Moved: the line turns red and says so; Locate file with the same content ties it again and saves.
    page.evaluate("window.__fs.move('alpha.shrimp', 'moved.shrimp')")
    focus_window(page)
    wait_for(page, lambda: 'Moved or deleted' in where(page, 'alpha', True), f'moved is noticed: {where(page, "alpha", True)}')
    need(where(page, 'alpha', True) == 'Moved or deleted: only in this browser now', 'the text')
    colors = page.evaluate(
        """() => { const el = document.querySelector('.file-where.is-missing')
                   const probe = document.createElement('i'); probe.style.color = 'var(--danger-ink)'; document.body.append(probe)
                   const want = getComputedStyle(probe).color; probe.remove(); return [getComputedStyle(el).color, want] }"""
    )
    need(colors[0] == colors[1], f'the missing line is --danger-ink: {colors}')
    for theme in THEMES:
        set_theme(page, theme)
        page.wait_for_timeout(100)
        for sel in ('.file-where.is-missing', '.file-missing .link'):
            for item in contrast(page, sel):
                need(item['ratio'] >= 4.5, f'{theme}: {sel} contrast {item}')
        box = page.evaluate(
            """() => [...document.querySelectorAll('.file-where, .file-missing .link')].map(e => [e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis', e.getBoundingClientRect().height])"""
        )
        need(all(ok and h < 40 for ok, h in box), f'{theme}: the missing line stays on one line: {box}')
    set_theme(page, 'calm')
    page.locator('.file-missing .link', has_text='Locate file').wait_for()
    # Edits while it is missing do not loop or write anywhere.
    edit_quiz(page, 'While missing')
    page.wait_for_timeout(2200)
    need('moved.shrimp' in page.evaluate('window.__fs.names()') and 'While missing' not in disk_json(page, 'moved.shrimp'), 'nothing written while missing')
    page.evaluate("window.__fs.nextOpen.push('moved.shrimp')")
    page.locator('.file-missing .link', has_text='Locate file').click()
    wait_for(page, lambda: 'While missing' in disk_json(page, 'moved.shrimp'), 'Locate file tied it to the moved file and saved')
    wait_for(page, lambda: where(page, 'moved', True) == 'On this device · moved.shrimp · Saved', f'the line: {where(page, "moved", True)}')

    # Moved again, now Download a copy; then Locate file with other content asks Replace.
    page.evaluate("window.__fs.move('moved.shrimp', 'gone.shrimp')")
    focus_window(page)
    wait_for(page, lambda: 'Moved or deleted' in where(page, 'moved', True), 'moved again')
    page.evaluate("window.__fs.nextSave = 'copy.shrimp'")
    row_button(page, 'moved', 'Download a copy of moved').click()
    wait_for(page, lambda: 'While missing' in disk_json(page, 'copy.shrimp'), 'Download a copy wrote the copy')
    put(page, 'other.shrimp', shrimp(course='Other course'))
    page.evaluate("window.__fs.nextOpen.push('other.shrimp')")
    page.locator('.file-missing .link', has_text='Locate file').click()
    d = dialog(page, 'Locate file')
    text = d.inner_text()
    need('"other.shrimp" holds a different library (1 course' in text and 'Replace it with "moved" (' in text and 'What the file holds now is lost.' in text,
         f'asks before replacing, naming the file and what each holds: {text}')
    d.get_by_role('button', name='Replace', exact=True).click()
    wait_for(page, lambda: 'While missing' in disk_json(page, 'other.shrimp'), 'Replace wrote the library into the other file')
    wait_for(page, lambda: where(page, 'other', True) == 'On this device · other.shrimp · Saved', f'the line: {where(page, "other", True)}')

    # A reload keeps it tied, and it still saves.
    page.wait_for_timeout(700)
    page.reload()
    wait_for(page, lambda: row(page, 'other', True).count() == 1, 'the file is back after a reload')
    wait_for(page, lambda: where(page, 'other', True).startswith('On this device · other.shrimp'), f'still tied: {where(page, "other", True)}')
    edit_quiz(page, 'After reload')
    need(where(page, 'other', True).endswith('Unsaved changes'), f'a reload keeps it waiting for Save: {where(page, "other", True)}')
    page.keyboard.press('Control+s')
    wait_for(page, lambda: 'After reload' in disk_json(page, 'other.shrimp'), 'Ctrl+S saves into the file after a reload')

    # Closing it with changes asks; Save and close writes them. Then it is gone from the list; the file is on disk, and
    # the toast says how to open it again.
    edit_quiz(page, 'Before close')
    row_button(page, 'other', 'Close other').click()
    d = dialog(page, 'Close file')
    need("aren't saved to other.shrimp yet" in d.inner_text(), f'the close question: {d.inner_text()[:160]}')
    d.get_by_role('button', name='Save and close', exact=True).click()
    wait_for(page, lambda: 'Before close' in disk_json(page, 'other.shrimp'), 'Save and close wrote the changes')
    toast = page.locator('.toast', has_text='Closed "other"')
    toast.wait_for()
    need("It's on this device: open it again with Open." in toast_detail(toast), f'the close toast: {toast.inner_text()}')
    wait_for(page, lambda: page.locator('.file-row').count() == 0, 'the file closes')
    # Every closed file can be reopened from its toast (asked for): a file on this device opens again from its file.
    toast.get_by_role('button', name='Reopen').click()
    wait_for(page, lambda: where(page, 'other', True) == 'On this device · other.shrimp · Saved', 'Reopen opened it again, tied to its file')
    row_button(page, 'other', 'Close other').click()
    wait_for(page, lambda: page.locator('.file-row').count() == 0, 'closed again')

    # A library kept only in this browser says it can be lost (asked for): its row's line in the warning color, and a line
    # under its pages' titles with Upload to Google Drive and Save to a file. Save to a file ties it to a new .shrimp file.
    page.locator('.files-head').get_by_role('button', name='New file').click()
    page.locator('.file-rename-field').wait_for()
    page.keyboard.type('Loose notes')
    page.keyboard.press('Enter')
    wait_for(page, lambda: row(page, 'Loose notes', True).count() == 1, 'the new library is there')
    need(where(page, 'Loose notes', True) == 'Only in this browser: can be lost', f'its line: {where(page, "Loose notes", True)}')
    row_button(page, 'Loose notes', 'New course in Loose notes').click()
    page.keyboard.type('Loose course')
    page.keyboard.press('Enter')
    note = page.locator('.view-only.is-browser')
    note.wait_for()
    need("Only in this browser: clearing its data loses it, and your other devices can't see it" in note.inner_text(), f'the page note: {note.inner_text()}')
    need(note.get_by_role('button', name='Upload to Google Drive').count() == 1 and note.get_by_role('button', name='Save to a file').count() == 1, 'its two ways off this browser')
    for theme in THEMES:
        set_theme(page, theme)
        page.wait_for_timeout(100)
        for sel in ('.file-where.is-warn', '.view-only.is-browser p'):
            for item in contrast(page, sel):
                need(item['ratio'] >= 4.5, f'{theme}: {sel} contrast {item}')
        box = page.evaluate("() => { const e = document.querySelector('.file-where.is-warn'); return [e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis', e.getBoundingClientRect().height] }")
        need(box[0] and box[1] < 40, f'{theme}: the warning line stays on one line: {box}')
    set_theme(page, 'calm')
    page.evaluate("window.__fs.nextSave = 'loose.shrimp'")
    note.get_by_role('button', name='Save to a file').click()
    wait_for(page, lambda: row(page, 'loose', True).count() == 1 and where(page, 'loose', True) == 'On this device · loose.shrimp · Saved', 'Save to a file tied it to the new file')
    need('Loose course' in disk_json(page, 'loose.shrimp'), 'the new file holds it')
    need(page.locator('.view-only.is-browser').count() == 0, 'the note goes once it is on this device')
    row_button(page, 'loose', 'Close loose').click()
    wait_for(page, lambda: page.locator('.file-row').count() == 0, 'closed')

    # A browser without showOpenFilePicker (Firefox, Safari) opens a copy in this browser, with its toast.
    ctx = page.context.browser.new_context(viewport={'width': 1280, 'height': 800})
    p2 = ctx.new_page()
    p2.add_init_script('window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined')
    p2.goto(base + '#/')
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'ff.shrimp')
        with open(path, 'wb') as f:
            f.write(shrimp())
        d = p2.locator('dialog[open]').filter(has=p2.locator('.open-panels')).last
        for _ in range(3):
            p2.locator('.files-head').get_by_role('button', name='Open', exact=True).click()
            try:
                d.wait_for(timeout=4000)
                break
            except Exception:
                pass
        d.get_by_text('This device', exact=True).first.click()
        section = d.locator('section[aria-label="device"]')
        section.wait_for()
        need('opens a copy' in section.inner_text(), f'the device panel says so: {section.inner_text()[:120]}')
        with p2.expect_file_chooser() as chooser:
            section.get_by_role('button', name='Choose a file').click()
        chooser.value.set_files(path)
    p2.locator('.toast', has_text='Opened "ff" in this browser.').wait_for()
    need(where(p2, 'ff', True) == 'Only in this browser: can be lost', f'a copy is only in this browser: {where(p2, "ff", True)}')
    ctx.close()
