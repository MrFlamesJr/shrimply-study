"""Renaming a course or a quiz on its page: while the typing goes on (the tab's route follows the new name only 300ms
after it pauses), the tab's title and the sidebar's selected row keep naming that course or quiz, never the file."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import load_test_library  # noqa: E402


def need(ok, what):
    if not ok:
        raise AssertionError(what)


def watch(page, field, extra, expected_end):
    """Types `extra` a key at a time, faster than the 300ms follow, sampling the active tab's title and the sidebar's
    selected row after each key; both must always end with the name as typed so far."""
    field.click()
    field.press('End')
    typed = ''
    for ch in extra:
        field.press(ch if ch != ' ' else 'Space')
        typed += ch
        page.wait_for_timeout(60)
        title = page.locator('.kit-tab.is-active .kit-tab-title').first.inner_text()
        current = page.locator('.files [aria-current="page"]').first.inner_text()
        need(title.strip() == (expected_end + typed).strip(), f'the tab keeps the name being typed: {title!r}')
        need((expected_end + typed).strip() in current, f'the sidebar keeps its row: {current!r}')
    page.evaluate('document.activeElement.blur()')
    page.wait_for_timeout(400)


def run(page, base):
    load_test_library(page, base)
    page.goto(base + '#/')
    page.locator('.course-row a').first.click()
    field = page.get_by_label('Course name')
    field.wait_for()
    course = field.input_value()
    watch(page, field, ' xyz', course)

    page.locator('a.tile').first.click()
    page.get_by_role('button', name='Edit quiz').click()
    field = page.get_by_label('Quiz name')
    field.wait_for()
    quiz = field.input_value()
    watch(page, field, ' abc', quiz)
