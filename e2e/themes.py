"""Every theme: the card editor and the quiz page's new controls (grip, row trash, Add cards, card heads) keep their contrast."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cards import find_grouped_quiz  # noqa: E402
from helpers import THEMES, contrast, load_test_library, set_theme  # noqa: E402

# (selector, minimum ratio): icons need 3, text 4.5.
EDITOR = [('.pair-grip svg', 3), ('.pair-delete svg', 3), ('.pair-head > span:first-child', 4.5), ('.pair-kind', 4.5)]
QUIZ = [('.list-head button', 4.5), ('.list-head button svg', 3), ('.row-delete svg', 3), ('.row-edit svg', 3),
        ('.row-head .pair-kind', 4.5), ('.row-num', 4.5)]


def measure(page, theme, where, checks, failures):
    for selector, need in checks:
        found = contrast(page, selector)
        if not found:
            failures.append((theme, where, selector, '-', 'nothing found', need))
        for item in found:
            if item['ratio'] < need:
                failures.append((theme, where, selector, item['text'] or '(icon)', item['ratio'], need))


def run(page, base):
    load_test_library(page, base)
    quiz = find_grouped_quiz(page, base)
    failures = []
    for theme in THEMES:
        set_theme(page, theme)
        page.goto(base + quiz + '/edit')
        page.locator('.pairs .pair').first.wait_for()
        page.wait_for_timeout(200)
        measure(page, theme, 'editor', EDITOR, failures)
        page.goto(base + quiz)
        page.locator('.quiz-rows').first.wait_for()
        page.wait_for_timeout(200)
        measure(page, theme, 'quiz page', QUIZ, failures)
        # The row's trash while the row is pointed at, and the trash itself pointed at.
        row = page.locator('.quiz-rows > li').first
        row.hover()
        page.wait_for_timeout(250)
        measure(page, theme, 'row hover', [('.quiz-rows > li:hover .row-delete svg', 3)], failures)
        row.locator('.row-delete').hover()
        page.wait_for_timeout(250)
        measure(page, theme, 'trash hover', [('.row-delete:hover svg', 3)], failures)
    if failures:
        table = '\n'.join(f'  {t:<10} {w:<12} {s:<32} {x[:24]:<24} {r} (needs {n})' for t, w, s, x, r, n in failures)
        raise AssertionError(f'{len(failures)} contrast or lookup failures:\n{table}')
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
