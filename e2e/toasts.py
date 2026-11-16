"""Toasts in every theme: the three kinds show and their text keeps 4.5:1. No debug toast carries an action yet, so an
Undo button is added to each toast's DOM here only to measure the action's look (rest and hover), screenshots in the
scratch folder when E2E_SHOTS is set."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import THEMES, contrast, set_theme, shots  # noqa: E402


def run(page, base):
    page.goto(base + '#/_debug')
    section = page.locator('.debug-section', has_text='Toasts').first
    for name in ('Info', 'Warning', 'Error'):
        section.get_by_role('button', name=name, exact=True).click()
    page.locator('.toast').nth(2).wait_for()
    page.evaluate("""() => document.querySelectorAll('.toast p').forEach(p => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-action'; b.textContent = 'Undo'
        p.after(b) })""")
    for theme in THEMES:
        set_theme(page, theme)
        page.wait_for_timeout(100)
        for sel in ('.toast p', '.toast-action'):
            for r in contrast(page, sel):
                assert r['ratio'] >= 4.5, f'{theme} {sel} {r}'
        page.locator('.toast-action').first.hover()
        page.wait_for_timeout(200)
        for r in contrast(page, '.toast-action'):
            assert r['ratio'] >= 4.5, f'{theme} hover {r}'
        page.locator('.toast-action').first.focus()
    if os.environ.get('E2E_SHOTS'):
        page.locator('.toasts').hover()
        shots(page, 'toasts', os.environ['E2E_SHOTS'])
    assert not page.errors, page.errors
