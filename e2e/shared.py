"""Shared libraries are view only, and sharing made plain (against a stubbed Google).
View only: no way to edit (no Edit quiz, no New quiz tile), the edit address goes to the quiz page, a change in Drive
arrives without Pull and keeps the page and a running study round, Make a copy opens an editable copy on the same
page, copying out in the Explorer works and pasting in is refused with the reason.
Sharing: Copy link shares and copies in one click, Stop sharing asks first and then stops, Upload and copy link on a
browser library with Replace it / Keep both, and Paste a link opens a shared library."""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from explorer import children, collapse_all, expand, labels, row as tree_row  # noqa: E402
from signout import (EXPECTED, add_file, change, need, new_state, open_dialog, open_from_drive, open_tab, row, row_button,  # noqa: E402
                     shrimp, sign_in, stub_google, wait_for, where)

VIEW_ONLY = 'This library is view only. Make a copy to change it.'
NOTE = 'View only: shared with you, kept in sync with Google Drive'


def dialog_with(page, text):
    d = page.get_by_role('dialog').filter(has_text=re.compile(text)).last
    d.wait_for()
    return d


def clipboard(page):
    return page.evaluate('navigator.clipboard.readText()')


def regain_focus(page):
    page.evaluate("window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))")


def teacher(cards):
    return shrimp(course='Teacher course', quiz='Teacher quiz', cards=cards)


def view_only_part(page, base, state):
    page.goto(base + '#/_drive/shared1')
    wait_for(page, lambda: row(page, 'Teacher set').count() == 1, 'the link opens the shared library')
    need(where(page, 'Teacher set') == 'View only', f'its where line says View only: {where(page, "Teacher set")}')
    block = page.locator('.file-block.is-active')
    block.locator('.file-course').first.click()
    page.locator('h1:visible').first.wait_for()
    need(page.locator('.tile-new').count() == 0, 'no New quiz tile on a view-only course')
    need(page.locator('.view-only', has_text=NOTE).count() >= 1, 'a quiet line says it is view only')
    if block.locator('.file-quiz').count() == 0:
        block.locator('.file-course [data-chevron]').first.click()
    block.locator('.file-quiz').first.click()
    note = page.locator('.view-only', has_text=NOTE).first
    note.wait_for()
    need(note.get_by_role('button', name='Make a copy').count() == 1, 'with Make a copy')
    need(page.get_by_role('button', name='Edit quiz').count() == 0, 'there is no Edit quiz')
    need(page.get_by_role('button', name='Start').count() >= 1, 'Start stays')

    # The edit address goes to the quiz page.
    page.evaluate("location.hash = '#/teacher-course/teacher-quiz/edit'")
    page.wait_for_timeout(500)
    need('/edit' not in page.evaluate('location.hash'), f'the edit address goes to the quiz page: {page.evaluate("location.hash")}')
    need(page.get_by_label('Quiz name').count() == 0 and page.locator('.view-only').count() >= 1, 'no editor, the quiz page')

    # A change in Drive arrives with no Pull, on the page.
    reads = state['reads'].get('shared1', 0)
    change(state, 'shared1', teacher([('Changed term', 'x'), ('Dog', 'Chien'), ('Cat', 'Chat')]))
    regain_focus(page)
    wait_for(page, lambda: 'Changed term' in page.locator('.quiz-rows').inner_text(), 'a change in Drive arrives without Pull', 8000)
    need(state['reads']['shared1'] > reads and page.get_by_role('button', name=re.compile('Pull')).count() == 0, 'no Pull button')
    need(page.evaluate('location.hash').split('?')[0].endswith('/teacher-course/teacher-quiz'), 'the page is kept')

    # ...and a running study round goes on.
    page.get_by_role('button', name='Start').first.click()
    page.locator('.session-stack').wait_for()
    reads = state['reads']['shared1']
    change(state, 'shared1', teacher([('Changed term', 'x'), ('Dog', 'Chien'), ('Cat', 'Chat'), ('Fifth card', 'y')]))
    regain_focus(page)
    wait_for(page, lambda: state['reads']['shared1'] > reads, 'the round checks Drive too', 8000)
    page.wait_for_timeout(500)
    need(page.locator('.session-stack').count() == 1 and '/study/' in page.evaluate('location.hash'), 'the study round keeps going')
    page.keyboard.press('Escape')
    wait_for(page, lambda: 'Fifth card' in page.locator('.quiz-rows').inner_text(), 'the new card is on the quiz page after the round')


def copy_part(page, state):
    sign_in(page)
    note = page.locator('.view-only', has_text=NOTE).first
    note.get_by_role('button', name='Make a copy').click()
    wait_for(page, lambda: row(page, 'Copy of Teacher set').count() == 1, 'Make a copy opens a copy beside the shared one')
    wait_for(page, lambda: any(n.startswith('Copy of Teacher set') for n in state['creates']), f'in my own Drive: {state["creates"]}')
    wait_for(page, lambda: page.get_by_role('button', name='Edit quiz').count() == 1, 'the copy is editable, on the same page')
    need('teacher-quiz' in page.evaluate('location.hash'), f'on the same page: {page.evaluate("location.hash")}')
    need(where(page, 'Teacher set.shrimp', exact=True) == 'View only', 'the shared one stays open and view only')
    page.get_by_role('button', name='Edit quiz').click()
    field = page.get_by_label('Quiz name')
    field.click()
    field.press('Control+a')
    field.press_sequentially('Edited quiz')
    page.evaluate('document.activeElement.blur()')
    wait_for(page, lambda: state['saves'] >= 1, 'the copy autosaves')


def explorer_part(page):
    page.locator('body').click(position={'x': 5, 'y': 790})
    page.keyboard.press('Control+Shift+E')
    page.locator('.kit-tree').wait_for()
    docs = labels(page, 'doc')
    shared = next(d for d in docs if d.startswith('Teacher set'))
    mine = next(d for d in docs if d.startswith('Copy of Teacher set'))

    # Copy out works...
    collapse_all(page)
    expand(page, 'doc', shared)
    expand(page, 'course', 'Teacher course')
    tree_row(page, 'quiz', 'Teacher quiz').click()
    page.keyboard.press('Control+c')
    collapse_all(page)
    expand(page, 'doc', mine)
    tree_row(page, 'course', 'Teacher course').click()
    page.keyboard.press('Control+v')
    expand(page, 'course', 'Teacher course')
    wait_for(page, lambda: 'Teacher quiz' in children(page, 'course', 'Teacher course'), 'a quiz copied out of a view-only library lands in my own')

    # ...pasting in is refused with the reason.
    collapse_all(page)
    expand(page, 'doc', shared)
    tree_row(page, 'course', 'Teacher course').click()
    page.keyboard.press('Control+v')
    page.locator('.toast', has_text=VIEW_ONLY).first.wait_for()
    tree_row(page, 'course', 'Teacher course').click(button='right')
    paste = page.get_by_role('menuitem', name=re.compile('^Paste'))
    need(paste.get_attribute('aria-disabled') == 'true', 'Paste is greyed out in its menu')
    need(VIEW_ONLY in (paste.get_attribute('title') or ''), 'with the reason')
    page.keyboard.press('Escape')
    collapse_all(page)


def share_part(page, base, state):
    add_file(state, 'own1', 'own1.shrimp')
    add_file(state, 'taken', 'Test library.shrimp', shrimp(course='Old', quiz='Old'))
    add_file(state, 'guide_old', 'Guide.shrimp', shrimp(course='Old', quiz='Old'))
    open_from_drive(page, 'own1.shrimp')

    # Copy link shares and copies in one click; reopened, it offers Stop sharing, which asks first.
    row_button(page, 'own1.shrimp', 'Share own1.shrimp').click()
    d = dialog_with(page, 'Share "own1.shrimp"')
    d.get_by_role('button', name='Copy link', exact=True).click()
    wait_for(page, lambda: state['shared'] == ['own1'], 'Copy link turns sharing on')
    wait_for(page, lambda: clipboard(page) == base + '#/_drive/own1', 'and copies the link')
    wait_for(page, lambda: 'Copied' in d.inner_text(), 'the dialog says Copied')
    page.keyboard.press('Escape')
    d.wait_for(state='hidden')
    row_button(page, 'own1.shrimp', 'Share own1.shrimp').click()
    d = dialog_with(page, 'Share "own1.shrimp"')
    d.get_by_role('button', name='Stop sharing').click()
    ask = dialog_with(page, 'no longer be able to open it')
    ask.get_by_role('button', name='Cancel', exact=True).click()
    ask.wait_for(state='hidden')
    need(state['unshared'] == [] and state['files']['own1']['shared'], 'Cancel keeps it shared')
    d.get_by_role('button', name='Stop sharing').click()
    ask = dialog_with(page, 'no longer be able to open it')
    ask.get_by_role('button', name='Stop sharing', exact=True).click()
    wait_for(page, lambda: state['unshared'] == ['own1'] and not state['files']['own1']['shared'], 'then Stop sharing stops')
    wait_for(page, lambda: d.get_by_role('button', name='Stop sharing').count() == 0, 'the dialog offers Copy link again')
    page.keyboard.press('Escape')

    # A browser library: Upload and copy link, Keep both and Replace it.
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()
    page.get_by_role('button', name='Load guide').click()
    page.get_by_text('Loaded the guide.').first.wait_for()
    page.goto(base + '#/')
    row_button(page, 'Test library', 'Share Test library').click()
    d = dialog_with(page, 'Share "Test library"')
    need('upload it to your Google Drive' in d.inner_text(), 'a browser library says to upload it first')
    d.get_by_role('button', name='Upload and copy link', exact=True).click()
    ask = dialog_with(page, 'already has a library (named|called)')
    ask.get_by_role('button', name='Keep both', exact=True).click()
    wait_for(page, lambda: state['creates'][1:] == ['Test library.shrimp'], f'Keep both makes a new file: {state["creates"]}')
    wait_for(page, lambda: len(state['shared']) == 2, 'and shares it')
    wait_for(page, lambda: clipboard(page) == base + '#/_drive/' + state['shared'][-1], 'and copies its link')
    page.keyboard.press('Escape')
    row_button(page, 'Guide', 'Share Guide').click()
    d = dialog_with(page, 'Share "Guide"')
    d.get_by_role('button', name='Upload and copy link', exact=True).click()
    ask = dialog_with(page, 'already has a library (named|called)')
    saves = state['saves']
    ask.get_by_role('button', name='Replace it', exact=True).click()
    wait_for(page, lambda: state['saves'] == saves + 1 and 'guide_old' in state['shared'], 'Replace it writes into the existing file and shares it')
    need(state['creates'][1:] == ['Test library.shrimp'], 'and makes no new one')
    wait_for(page, lambda: clipboard(page) == base + '#/_drive/guide_old', 'the link is copied')
    page.keyboard.press('Escape')


def paste_link_part(page, base, state):
    add_file(state, 'shared2', 'Other set.shrimp', shrimp(course='Other course', quiz='Other quiz'), mine=False, shared=True)
    add_file(state, 'shared3', 'Third set.shrimp', shrimp(course='Third course', quiz='Third quiz'), mine=False, shared=True)
    d = open_dialog(page)
    panel = open_tab(d, 'Shared link')
    link = panel.get_by_label('Link')
    link.fill('hello')
    panel.get_by_role('button', name='Open', exact=True).click()
    panel.get_by_role('alert').wait_for()
    link.fill(base + '#/_drive/shared2')
    panel.get_by_role('button', name='Open', exact=True).click()
    wait_for(page, lambda: row(page, 'Other set').count() == 1, "a pasted share link opens the shared library")
    d.wait_for(state='hidden')
    d = open_dialog(page)
    panel = open_tab(d, 'Shared link')
    panel.get_by_label('Link').fill('https://drive.google.com/file/d/shared3/view?usp=sharing')
    panel.get_by_role('button', name='Open', exact=True).click()
    wait_for(page, lambda: row(page, 'Third set').count() == 1, 'and so does a Google Drive file address')
    need('View only' in where(page, 'Other set'), 'both are view only')


def run(page, base):
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    state = new_state()
    add_file(state, 'shared1', 'Teacher set.shrimp', teacher([('Apple', 'Pomme'), ('Dog', 'Chien'), ('Cat', 'Chat')]), mine=False, shared=True)
    stub_google(page.context, state)
    page.goto(base + '#/')
    view_only_part(page, base, state)
    copy_part(page, state)
    explorer_part(page)
    share_part(page, base, state)
    paste_link_part(page, base, state)
    errors = [e for e in page.errors if not any(x in e for x in EXPECTED)]
    if errors:
        raise AssertionError('errors: ' + '; '.join(errors))
