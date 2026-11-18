"""Each tab has its own Google account (against a stubbed Google): a new tab starts with the account chosen last; Switch
account changes only its own tab (its Drive libraries close there, the other tabs keep theirs and still save), a reload
keeps it, Sign out is for one tab (only the account's own Drive libraries close: a shared file and a browser library stay), and nothing is ever written into one account's file with another's token."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from signout import EMAIL, EXPECTED, add_file, edit_quiz, need, new_state, open_from_drive, row, sign_in, signed_out, stub_google, wait_for  # noqa: E402

OTHER = 'other@example.com'


def email(page):
    return page.locator('.account-box.is-signed-in .account-email').first.inner_text() if page.locator('.account-box.is-signed-in').count() else None


def new_tab(page, base):
    tab = page.context.new_page()
    tab.errors = []
    tab.on('console', lambda m: tab.errors.append(m.text) if m.type == 'error' else None)
    tab.goto(base + '#/')
    return tab


def run(page, base):
    state = new_state()
    add_file(state, 'alpha', 'alpha.shrimp')
    add_file(state, 'shared1', 'shared.shrimp', mine=False, shared=True)
    stub_google(page.context, state)
    page.goto(base + '#/')
    sign_in(page)
    open_from_drive(page, 'alpha.shrimp')
    edit_quiz(page, 'First')
    wait_for(page, lambda: state['saves'] == 1, 'the edit autosaves')
    # A shared file of someone else's and a browser library, open beside it.
    page.goto(base + '#/_drive/shared1')
    wait_for(page, lambda: row(page, 'shared.shrimp').count() == 1, 'the shared file opens')
    page.locator('.files-head').get_by_role('button', name='New file', exact=True).click()
    wait_for(page, lambda: row(page, 'New library').count() == 1, 'a browser library opens')
    page.keyboard.press('Escape')  # not uploaded: it stays in this browser
    page.locator('dialog[open]').wait_for(state='hidden')
    page.wait_for_timeout(700)  # the browser backup waits out 300ms

    # A new tab starts as the account chosen last, with its library.
    two = new_tab(page, base)
    wait_for(two, lambda: email(two) == EMAIL, 'tab 2 starts as the first account')
    wait_for(two, lambda: row(two, 'alpha.shrimp').count() == 1, 'with its Drive library')
    wait_for(two, lambda: row(two, 'shared.shrimp').count() == 1 and row(two, 'New library').count() == 1, 'and the others')
    need(two.locator('.account-box .link', has_text='Switch account').count() == 1, 'the account box offers Switch account')

    # Tab 2 switches: its libraries close there only.
    page.evaluate(f"localStorage.setItem('e2e-next-account', '{OTHER}')")
    two.locator('.account-box').get_by_role('button', name='Switch account').click()
    wait_for(two, lambda: email(two) == OTHER, f'tab 2 is the other account: {email(two)}')
    wait_for(two, lambda: row(two, 'alpha.shrimp').count() == 0, "the first account's library closes in tab 2")
    two.locator('.toast', has_text=f'Signed in as {OTHER} in this tab').first.wait_for()
    need(row(two, 'shared.shrimp').count() == 1 and row(two, 'New library').count() == 1, 'the shared file and the browser library stay open in tab 2')
    page.wait_for_timeout(500)
    need(email(page) == EMAIL and row(page, 'alpha.shrimp').count() == 1, 'tab 1 is unchanged')
    saves = state['saves']
    row(page, 'alpha.shrimp').locator('.file-name-text').click()
    edit_quiz(page, 'Second')
    wait_for(page, lambda: state['saves'] == saves + 1, 'an edit in tab 1 still saves')

    # A reload keeps the tab's account; a new tab starts as the account chosen last.
    page.wait_for_timeout(700)
    two.reload()
    wait_for(two, lambda: email(two) == OTHER, 'tab 2 is still the other account after a reload')
    two.wait_for_timeout(800)
    need(row(two, 'alpha.shrimp').count() == 0, 'with no library of the first account')
    three = new_tab(page, base)
    wait_for(three, lambda: email(three) == OTHER, 'tab 3 starts as the other account')
    three.wait_for_timeout(800)
    need(row(three, 'alpha.shrimp').count() == 0, 'and never shows the first account\'s library')

    # Signing out in tab 3 changes no other tab.
    three.locator('.account-box').get_by_role('button', name='Sign out').click()
    wait_for(three, lambda: signed_out(three), 'tab 3 signs out')
    page.wait_for_timeout(500)
    need(email(page) == EMAIL and row(page, 'alpha.shrimp').count() == 1, 'tab 1 still has its account and library')
    need(email(two) == OTHER, 'tab 2 still has the other account')
    need(row(three, 'shared.shrimp').count() == 1 and row(three, 'New library').count() == 1, 'tab 3 keeps its shared file and browser library after signing out')
    four = new_tab(page, base)
    wait_for(four, lambda: signed_out(four), 'tab 4 starts signed out')

    # Nothing was written into the first account's file by the other, and the other made no file.
    wrote = [w for w in state['writes'] if w[2] == OTHER]
    need(not wrote, f"the other account wrote nothing: {wrote}")
    need(all(w[2] == EMAIL for w in state['writes'] if w[1] == 'alpha'), f"alpha was written only by its owner: {state['writes']}")
    need(not state['creates'], f"no new file was made: {state['creates']}")
    errors = [e for t in (page, two, three, four) for e in t.errors if not any(x in e for x in EXPECTED)]
    for t in (two, three, four):
        t.close()
    if errors:
        raise AssertionError('errors: ' + '; '.join(errors))
