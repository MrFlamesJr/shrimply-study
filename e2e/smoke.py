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
    page.goto(base + quiz + '/edit')
    heading(page, 'editor')
    page.goto(base + quiz + '/study/flashcards')
    heading(page, 'flashcards session', '.session-stack')
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
