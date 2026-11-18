"""Every theme: the card editor and the quiz page's new controls (grip, row trash, Add cards, card heads) keep their contrast,
and the signed-out account box reads as a box on the sidebar."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cards import find_grouped_quiz  # noqa: E402
from helpers import THEMES, contrast, load_test_library, set_theme  # noqa: E402

# (selector, minimum ratio): icons need 3, text 4.5.
EDITOR = [('.pair-grip svg', 3), ('.pair-delete svg', 3), ('.pair-head .pair-num', 4.5), ('.pair-kind', 4.5)]
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


# The signed-out account box against the sidebar: its fill a step apart and its line plain (asked for: in five themes
# it took --surface, the sidebar's own tone, and showed no box at all).
ACCOUNT_BOX = """() => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = css => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  const box = document.querySelector('.account-box:not(.is-signed-in)');
  if (!box) return null;
  const side = rgb(getComputedStyle(document.querySelector('.sidebar')).backgroundColor);
  const s = getComputedStyle(box);
  return { fill: ratio(rgb(s.backgroundColor), side), line: ratio(rgb(s.borderTopColor), side) };
}"""


def check_account_box(page, theme, failures):
    found = page.evaluate(ACCOUNT_BOX)
    if not found:
        failures.append((theme, 'sidebar', '.account-box', '-', 'nothing found', '-'))
        return
    if found['fill'] < 1.03:
        failures.append((theme, 'sidebar', '.account-box fill', 'vs sidebar', round(found['fill'], 2), 1.03))
    if found['line'] < 1.5:
        failures.append((theme, 'sidebar', '.account-box line', 'vs sidebar', round(found['line'], 2), 1.5))
    measure(page, theme, 'sidebar', [('.account-box p', 4.5), ('.account-sign-in', 4.5)], failures)


def run(page, base):
    load_test_library(page, base)
    quiz = find_grouped_quiz(page, base)
    failures = []
    for theme in THEMES:
        set_theme(page, theme)
        check_account_box(page, theme, failures)
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
