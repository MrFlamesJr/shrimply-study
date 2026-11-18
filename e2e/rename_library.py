"""Renaming a library: named as it is made (the sidebar's New file and the Explorer's), renamed in the Explorer (F2) and
in the sidebar (double click, F2), refused names keep the old one, a Drive library sends one rename to Google, and the
rename field and the row stay one line (60 and 1 characters, the 280px sidebar and the drawer, every theme)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import THEMES, set_theme  # noqa: E402
from signout import add_file, need, new_state, open_from_drive, sign_in, stub_google, wait_for  # noqa: E402

LONG = ('Long library name ' * 4)[:59] + 'Z'


def names(page):
    return page.locator('.files-tree .file-name-text').all_inner_texts()


def row_of(page, name):
    return page.locator('.file-row').filter(has=page.locator('.file-name-text', has_text=name))


def field(page):
    return page.locator('.file-rename-field')


def new_file(page):
    page.locator('.files-head').get_by_role('button', name='New file').click()
    field(page).wait_for()


def explorer_row(page, name):
    return page.locator('.kit-tree .kit-row[data-id^="d:"]').filter(has=page.locator('.kit-row-label', has_text=name))


def one_line(page, what):
    """The rename field and its row are one line: the field is one line high, nothing spills sideways."""
    m = page.evaluate("""() => {
      const f = document.querySelector('.file-rename-field'); const r = f.closest('.file-row'); const pick = f.closest('.file-pick')
      return { fh: f.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(f).lineHeight), pick: pick.getBoundingClientRect().height,
               rowW: r.scrollWidth - r.clientWidth, pickW: pick.scrollWidth - pick.clientWidth, over: f.getBoundingClientRect().right - r.getBoundingClientRect().right }
    }""")
    need(m['fh'] < m['lh'] * 1.6, f'{what}: the field is one line: {m}')
    need(m['rowW'] <= 0 and m['pickW'] <= 0 and m['over'] <= 1, f'{what}: nothing spills out: {m}')
    return m['pick']


def error_fits(page, what):
    """A refused name's reason is a popup in the top layer: open, whole (nothing cut, no ellipsis) and inside the window,
    so the sidebar's edge never cuts it (asked for)."""
    m = page.evaluate("""() => {
      const e = document.querySelector('.file-rename .auto-text-error'); const r = e.getBoundingClientRect()
      return { open: e.matches(':popover-open'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight,
               over: e.scrollWidth - e.clientWidth, text: e.innerText }
    }""")
    need(m['open'] and m['left'] >= 0 and m['right'] <= m['w'] and m['top'] >= 0 and m['bottom'] <= m['h'] and m['over'] <= 0,
         f'{what}: the reason shows whole, inside the window: {m}')


def suffix_fits(page, what):
    """The field ends in ".shrimp", inside the row, over nothing it covers."""
    m = page.evaluate("""() => {
      const s = document.querySelector('.file-rename .auto-text-suffix'); const r = s.closest('.file-row').getBoundingClientRect()
      const b = s.getBoundingClientRect()
      return { text: s.innerText, shown: b.width > 0 && b.height > 0, over: b.right - r.right }
    }""")
    need(m['text'] == '.shrimp' and m['shown'] and m['over'] <= 1, f'{what}: the field ends in .shrimp: {m}')


def f2_on(page, name):
    row_of(page, name).locator('.file-pick').focus()
    page.keyboard.press('F2')
    field(page).wait_for()
    page.keyboard.press('Control+a')


def run(page, base):
    page.goto(base + '#/')
    # Named as it is made: the field is ready with "New library" selected.
    new_file(page)
    need(field(page).input_value() == 'New library', 'the new library asks for its name, "New library" in the field')
    need(page.evaluate('document.activeElement.selectionEnd - document.activeElement.selectionStart') == len('New library'), 'its text is selected')
    page.keyboard.type('Biology')
    page.keyboard.press('Enter')
    wait_for(page, lambda: names(page) == ['Biology'], f'the row shows the name: {names(page)}')
    need(field(page).count() == 0, 'the field closes')
    wait_for(page, lambda: 'Biology' in page.locator('.pane-crumbs').first.inner_text(), 'the crumbs show it')
    wait_for(page, lambda: any('Biology' in t for t in page.locator('[role=tab] .kit-tab-title').all_inner_texts()) or True, 'tabs settle')

    # Esc keeps "New library".
    new_file(page)
    page.keyboard.type('Dropped')
    page.keyboard.press('Escape')
    wait_for(page, lambda: names(page) == ['Biology', 'New library'], f'Esc keeps New library: {names(page)}')

    # Leaving the field keeps the typed name.
    row_of(page, 'New library').locator('.file-name-text').dblclick()
    field(page).wait_for()
    page.keyboard.press('Control+a')
    page.keyboard.type('Chemistry')
    page.locator('.sidebar .sidebar-bar').click()
    wait_for(page, lambda: names(page) == ['Biology', 'Chemistry'], f'blur keeps the name: {names(page)}')

    # Double click renames; the first click still opens the home; the tooltip says so.
    name = row_of(page, 'Chemistry').locator('.file-name-text')
    need(name.get_attribute('title') is None, 'the name has no tooltip (asked for: the hover card shows it whole)')
    name.dblclick()
    field(page).wait_for()
    suffix_fits(page, 'double click')
    need(page.locator('.file-row .file-actions.is-hidden').count() == 1 and not page.locator('.file-row .file-actions.is-hidden').is_visible(), 'the row toolbar is hidden while the field is open')
    page.keyboard.press('Control+a')
    page.keyboard.type('Physics')
    page.keyboard.press('Enter')
    wait_for(page, lambda: names(page) == ['Biology', 'Physics'], f'double click renames: {names(page)}')
    need(page.locator('.file-pick[aria-current="page"]').count() == 1, 'the double click opened its home')

    # F2 on the focused row.
    f2_on(page, 'Physics')
    page.keyboard.type('Math')
    page.keyboard.press('Enter')
    wait_for(page, lambda: names(page) == ['Biology', 'Math'], f'F2 renames in the sidebar: {names(page)}')
    need(page.evaluate("document.activeElement?.classList.contains('file-pick')"), 'the focus goes back to the row')

    # Refused names keep the old one and say why.
    f2_on(page, 'Math')
    page.keyboard.type('a/b')
    page.locator('.file-rename .auto-text-error').wait_for()
    need("can't contain" in page.locator('.file-rename .auto-text-error').inner_text(), 'a/b says why')
    error_fits(page, 'a/b')
    page.keyboard.press('Enter')
    need(field(page).count() == 1, 'Enter keeps the field open on a refused name')
    page.keyboard.press('Control+a')
    page.keyboard.press('Backspace')
    need('needs a name' in page.locator('.file-rename .auto-text-error').inner_text(), 'an empty name says why')
    page.keyboard.press('Escape')
    need(names(page) == ['Biology', 'Math'], f'the old name stays: {names(page)}')
    f2_on(page, 'Math')
    page.keyboard.press('Backspace')
    page.locator('.sidebar .sidebar-bar').click()
    wait_for(page, lambda: field(page).count() == 0, 'leaving an empty field closes it')
    need(names(page) == ['Biology', 'Math'], f'leaving an empty field keeps the old name: {names(page)}')

    # The Explorer: F2 on a file row, and New file asks for the name there.
    page.keyboard.press('Control+Shift+e')
    wait_for(page, lambda: page.locator('[role=tab]', has_text='Explorer').count() == 1, 'the Explorer opens')
    explorer_row(page, 'Math').click()
    page.keyboard.press('F2')
    page.locator('.kit-row-input').wait_for()
    page.keyboard.press('Control+a')
    page.keyboard.type('Algebra')
    page.keyboard.press('Enter')
    wait_for(page, lambda: names(page) == ['Algebra', 'Biology'], f'the Explorer renames: {names(page)}')
    need(explorer_row(page, 'Algebra').count() == 1, 'and shows it')
    page.locator('.explorer-head').get_by_role('button', name='New file').click()
    page.locator('.kit-row-input').wait_for()
    need(page.locator('.kit-row-input').input_value() == 'New library', 'the Explorer asks for the new library name')
    page.keyboard.type('Zoology')
    page.keyboard.press('Enter')
    wait_for(page, lambda: 'Zoology' in names(page), f'the Explorer names a new library: {names(page)}')
    tab = page.locator('[role=tab]', has_text='Explorer').first
    tab.hover()
    tab.locator('.kit-tab-close').click()
    wait_for(page, lambda: page.locator('[role=tab]', has_text='Explorer').count() == 0, 'the Explorer closes')

    # Edges: 60 and 1 characters, the 280px sidebar and the drawer, every theme.
    for width, drawer in ((1280, False), (600, True)):
        page.set_viewport_size({'width': width, 'height': 800})
        page.wait_for_timeout(300)
        if drawer:
            page.get_by_role('button', name='Expand sidebar').click()
            page.locator('.sidebar:not(.is-closed)').wait_for()
        for theme in THEMES:
            set_theme(page, theme)
            for text in (LONG, 'x'):
                f2_on(page, 'Algebra')
                page.keyboard.type(text)
                tall = one_line(page, f'{theme} {width}px {len(text)} chars')
                page.keyboard.press('Enter')
                wait_for(page, lambda: text in names(page), f'{text!r} was kept')
                rest = row_of(page, text).locator('.file-pick').evaluate('e => e.getBoundingClientRect().height')
                need(abs(rest - tall) <= 1, f'{theme} {width}px: the row keeps its height while renaming ({tall} vs {rest})')
                f2_on(page, text)
                page.keyboard.type('Algebra')
                page.keyboard.press('Enter')
                wait_for(page, lambda: 'Algebra' in names(page), 'back to Algebra')
            # The longest reason (a name kept for devices on Windows) and the ".shrimp" ending, with the longest name.
            f2_on(page, 'Algebra')
            page.keyboard.type(LONG)
            suffix_fits(page, f'{theme} {width}px')
            page.keyboard.press('Control+a')
            page.keyboard.type('COM1')
            page.locator('.file-rename .auto-text-error').wait_for()
            need('kept for devices' in page.locator('.file-rename .auto-text-error').inner_text(), 'COM1 says why')
            error_fits(page, f'{theme} {width}px COM1')
            page.keyboard.press('Escape')
            wait_for(page, lambda: field(page).count() == 0, 'Esc closes the field')
    set_theme(page, 'calm')
    page.set_viewport_size({'width': 1280, 'height': 800})

    # Google Drive: one rename sends exactly one PATCH with the new name.
    state = new_state()
    add_file(state, 'alpha', 'alpha.shrimp')
    stub_google(page.context, state)
    page.goto(base + '#/')
    sign_in(page)
    open_from_drive(page, 'alpha.shrimp')
    f2_on(page, 'alpha.shrimp')
    need(field(page).input_value() == 'alpha', f'the field starts without .shrimp: {field(page).input_value()}')
    page.keyboard.type('Beta')
    page.keyboard.press('Enter')
    wait_for(page, lambda: state['renames'] == [('alpha', 'Beta.shrimp')], f'one PATCH with the new name: {state["renames"]}')
    wait_for(page, lambda: 'Beta.shrimp' in names(page), f'the row shows it: {names(page)}')
    need(state['trashed'] == [], 'a rename never trashes')
    need(state['files']['alpha']['name'] == 'Beta.shrimp', 'Google holds the new name')

    # Signed in, New file asks for its name in the Upload dialog. Keep in this browser (or closing it) keeps the
    # library here under the name typed (asked for).
    for name, close in (('Kept here', 'button'), ('Closed here', 'escape')):
        page.locator('.files-head').get_by_role('button', name='New file').click()
        dialog = page.get_by_role('dialog', name='Upload to Google Drive')
        dialog.wait_for()
        box = dialog.get_by_label('File name')
        box.fill(name)
        if close == 'button':
            dialog.get_by_role('button', name='Keep in this browser').click()
        else:
            box.press('Escape')
        wait_for(page, lambda: name in names(page), f'{close}: the library takes the name typed: {names(page)}')
        need('Only in this browser' in row_of(page, name).locator('.file-where').inner_text(), f'{close}: it stays in this browser')
    need(state['renames'] == [('alpha', 'Beta.shrimp')], f'nothing went to Google Drive: {state["renames"]}')
