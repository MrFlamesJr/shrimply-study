"""Smoke check: home, a course, a quiz page, its editor and a flashcards session each render, with no errors."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import load_test_library  # noqa: E402


def heading(page, where, selector='h1'):
    try:
        page.locator(f'{selector}:visible').first.wait_for(timeout=5000)
    except Exception:
        raise AssertionError(f'{where}: no {selector} rendered at {page.url}')


def first_link(page, parts_wanted):
    """First link into the app whose hash has exactly parts_wanted path parts (not a _page)."""
    hrefs = page.eval_on_selector_all('a[href^="#/"]', 'els => els.map(e => e.getAttribute("href"))')
    for h in hrefs:
        parts = [p for p in h[2:].split('/') if p]
        if len(parts) == parts_wanted and not parts[0].startswith('_'):
            return h
    raise AssertionError(f'no link with {parts_wanted} path parts on {page.url}')


def run(page, base):
    load_test_library(page, base)
    page.goto(base + '#/')
    heading(page, 'home')
    course = first_link(page, 1)
    page.goto(base + course)
    heading(page, 'course')
    quiz = first_link(page, 2)
    page.goto(base + quiz)
    heading(page, 'quiz page')
    # Edit quiz and Start stay on one line, beside the title or under it whole (asked for), at a wide and a narrow width.
    for width in (1280, 900, 600):
        page.set_viewport_size({'width': width, 'height': 800})
        page.wait_for_timeout(150)
        tops = page.evaluate("[...document.querySelectorAll('.page-head .actions > *')].map(e => Math.round(e.getBoundingClientRect().top))")
        if len(set(tops)) > 1:
            raise AssertionError(f'quiz page at {width}px: Edit quiz and Start on different lines: {tops}')
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.goto(base + quiz + '/edit')
    heading(page, 'editor')
    page.goto(base + quiz + '/study/flashcards')
    heading(page, 'flashcards session', '.session-stack')
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
