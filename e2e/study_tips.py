"""How studying works: a small link under the quiz page's study options opens its tab (one at most; Ctrl or the middle
button opens it in the background), titled "How studying works", at #/_how-to-study, kept on reload."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import load_test_library  # noqa: E402


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def wait_for(page, check, what, timeout=5000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def run(page, base):
    load_test_library(page, base)
    page.goto(base + '#/')
    block = page.locator('.file-block.is-active')
    block.locator('.file-course').first.wait_for()
    if block.locator('.file-quiz').count() == 0:
        block.locator('.file-course [data-chevron]').first.click()
    block.locator('.file-quiz').first.click()
    link = page.locator('.wb-tab:not([hidden]) a.open-link', has_text='How studying works')
    link.wait_for()
    tabs = page.locator('[role=tab]', has_text='How studying works')
    need(tabs.count() == 0, 'no tips tab yet')
    link.click()
    wait_for(page, lambda: tabs.count() == 1, 'the link opens the How studying works tab')
    need(page.evaluate('location.hash') == '#/_how-to-study', f'at its own address: {page.evaluate("location.hash")}')
    need(page.locator('.wb-tab:not([hidden]) h1', has_text='How studying works').count() == 1, 'with its title')
    need(page.locator('.wb-tab:not([hidden]) .tips-list dt').count() >= 8, 'and the tips')
    need(page.locator('.pane-crumbs', has_text='Shrimply Study').count() >= 1, 'under Shrimply Study in its crumbs')

    # One at most: the quiz page's link shows the same tab. Ctrl+click opens it in the background.
    page.locator('[role=tab]', has_text='Test library').first.click()
    page.locator('.wb-tab:not([hidden]) a.open-link', has_text='How studying works').click()
    page.wait_for_timeout(300)
    need(tabs.count() == 1, 'never a second one')
    tabs.first.hover()
    tabs.first.locator('button').click()
    wait_for(page, lambda: tabs.count() == 0, 'it closes like any tab')
    page.locator('.wb-tab:not([hidden]) a.open-link', has_text='How studying works').click(modifiers=['Control'])
    wait_for(page, lambda: tabs.count() == 1, 'Ctrl+click opens it')
    need(page.get_by_role('button', name='Start').count() >= 1, 'in the background: the quiz page stays in front')
    page.wait_for_timeout(700)
    page.reload()
    wait_for(page, lambda: tabs.count() == 1, 'the tab is back after a reload')
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
