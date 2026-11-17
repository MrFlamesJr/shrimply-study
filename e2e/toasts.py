"""Toasts in every theme: the three kinds show and their text keeps 4.5:1. No debug toast carries an action yet, so an
Undo button is added to each toast's DOM here only to measure the action's look (rest and hover), screenshots in the
scratch folder when E2E_SHOTS is set. Then the layout (shortest and longest texts, with and without an action, at 320
and 1280 wide) and the toasts while a modal dialog is open (hover pauses the countdown, the ✕ works, and the countdown
carries on from where it was when the dialog closes)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import THEMES, contrast, set_theme, shots  # noqa: E402

LONG_NAME = 'Biologie 130 Les vers: notes de cours de la session dhiver complete'
CASES = [
    ('info', 'Saved.', None),
    ('warning', 'Saved.', 'Undo'),
    ('error', f'"{LONG_NAME}" could not be opened. This file is not a Shrimply Study library.', None),
    ('error', f'"{LONG_NAME}" could not be opened. This file is not a Shrimply Study library.', 'Undo'),
    ('info', f'Opened "{LONG_NAME}" in this browser.', 'Upload to Google Drive'),
    ('warning', 'x' * 120, 'Upload to Google Drive'),
]

# Builds one toast per case by copying a real one (its markup, the ✕ icon), without the countdown.
BUILD = """cases => {
  const stack = document.querySelector('.toasts')
  const model = stack.querySelector('.toast')
  const extra = document.createElement('div')
  extra.id = 'layout-cases'
  for (const [kind, text, action] of cases) {
    const t = model.cloneNode(true)
    t.className = `toast is-${kind}`
    t.querySelector('p').textContent = text
    t.querySelector('.toast-life').remove()
    t.querySelector('.toast-action')?.remove()
    if (action) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-action'; b.textContent = action
      t.querySelector('p').after(b)
    }
    stack.append(t)
  }
}"""

MEASURE = """() => [...document.querySelectorAll('.toasts .toast')].slice(-6).map(t => {
  const box = t.getBoundingClientRect(), a = t.querySelector('.toast-action'), x = t.querySelector('.icon-btn')
  const lines = a && (() => { const r = document.createRange(); r.selectNodeContents(a)
    return new Set([...r.getClientRects()].map(q => Math.round(q.top))).size })()
  return { over: t.scrollWidth - t.clientWidth, action: a && { h: a.getBoundingClientRect().height, lines },
           cross: x.getBoundingClientRect().top - box.top, textH: t.querySelector('p').getBoundingClientRect().height }
})"""

PROGRESS = """() => [...document.querySelectorAll('.toast-life')].map(b => {
  const a = b.getAnimations()[0]
  return { id: b.dataset.id, ms: a.currentTime - a.effect.getTiming().delay, state: a.playState }
})"""


def layout(page, shot_dir):
    page.reload()
    section = page.locator('.debug-section', has_text='Toasts').first
    section.get_by_role('button', name='Info', exact=True).click()
    page.locator('.toast').first.wait_for()
    page.evaluate(BUILD, CASES)
    for width in (320, 1280):
        page.set_viewport_size({'width': width, 'height': 900})
        page.locator('.toasts').hover()
        page.wait_for_timeout(300)
        for i, m in enumerate(page.evaluate(MEASURE)):
            where = f'{width}px case {i} {CASES[i][:2]}'
            assert m['over'] <= 0, f'{where} overflows by {m["over"]}'
            if m['action']:
                a = m['action']
                assert a['h'] >= 32, f'{where} action only {a["h"]}px tall'
                assert a['lines'] == 1, f'{where} action wraps ({a})'
                if width < 800:
                    assert a['h'] >= 44, f'{where} touch action only {a["h"]}px tall'
            assert m['cross'] <= 16, f'{where} cross {m["cross"]}px below the top'
        if shot_dir:
            for theme in THEMES:
                set_theme(page, theme)
                page.wait_for_timeout(150)
                os.makedirs(shot_dir, exist_ok=True)
                page.screenshot(path=os.path.join(shot_dir, f'toasts-{width}-{theme}.png'))
            set_theme(page, 'calm')
    page.set_viewport_size({'width': 1280, 'height': 800})


def in_modal(page):
    page.reload()
    section = page.locator('.debug-section', has_text='Toasts').first
    section.get_by_role('button', name='Error', exact=True).click()
    page.locator('.toast').first.wait_for()
    page.wait_for_timeout(1000)
    before = page.evaluate(PROGRESS)[0]['ms']
    page.evaluate("""() => { const d = document.createElement('dialog'); d.id = 'probe'; d.className = 'dialog'
      d.innerHTML = '<div class="dialog-body"><p>Probe</p></div>'; document.body.append(d); d.showModal() }""")
    page.wait_for_timeout(200)
    assert page.evaluate("() => !!document.querySelector('#probe .toasts')"), 'toasts did not move into the dialog'
    moved = page.evaluate(PROGRESS)[0]['ms']
    assert moved >= before, f'countdown restarted on moving in: {before} -> {moved}'
    page.locator('#probe .toast').hover()
    a = page.evaluate(PROGRESS)[0]['ms']
    page.wait_for_timeout(500)
    b = page.evaluate(PROGRESS)[0]['ms']
    assert b - a < 50, f'countdown ran {b - a}ms while hovered in a dialog'
    page.mouse.move(5, 5)
    page.wait_for_timeout(200)
    page.evaluate("() => document.querySelector('#probe').close()")
    page.wait_for_timeout(200)
    assert page.evaluate("() => !!document.body.querySelector(':scope > .toasts')"), 'toasts did not return to the page'
    after = page.evaluate(PROGRESS)[0]['ms']
    assert after >= b, f'countdown restarted on moving out: {b} -> {after}'

    # The ✕ works inside a dialog.
    section.get_by_role('button', name='Warning', exact=True).click()
    page.evaluate("() => document.querySelector('#probe').showModal()")
    page.wait_for_timeout(200)
    count = page.locator('#probe .toast').count()
    page.locator('#probe .toast').first.locator('.icon-btn').click()
    page.wait_for_timeout(200)
    assert page.locator('#probe .toast').count() == count - 1, 'the ✕ did not dismiss the toast in the dialog'
    page.evaluate("() => document.querySelector('#probe').close()")


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
    layout(page, os.environ.get('E2E_SHOTS'))
    in_modal(page)
    assert not page.errors, page.errors
