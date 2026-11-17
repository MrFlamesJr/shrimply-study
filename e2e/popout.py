"""Popup windows (kit Popout) on #/_workbench: styles and theme, shared state, dialog, popover, resize, dock, close, reload, watchdog."""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import set_theme  # noqa: E402

LOOK = 'd => { const c = getComputedStyle(document.body); return c.fontFamily + "|" + c.backgroundColor + "|" + c.color }'


def alive(pop):
    try:
        pop.evaluate('1')
        return True
    except Exception:
        return False


def wait_gone(pop, seconds):
    t = time.time()
    while alive(pop) and time.time() - t < seconds:
        time.sleep(0.1)
    return not alive(pop)


def pop_out(page):
    with page.context.expect_page() as info:
        page.get_by_role('button', name='Pop out').click()
    pop = info.value
    pop.wait_for_selector('[data-testid=panel]')
    return pop


def docked(page, seconds=3):
    try:
        page.wait_for_selector('[data-testid=panel]', timeout=seconds * 1000)
        return True
    except Exception:
        return False


def run(page, base):
    page.goto(base + '#/_workbench')
    page.get_by_role('button', name='Pop out').wait_for()
    pop = pop_out(page)
    assert pop.url.endswith('popout.html'), f'popup url is {pop.url}'

    assert pop.evaluate(LOOK) == page.evaluate(LOOK), 'popup styles differ from the main window'
    assert 'Atkinson' in pop.evaluate(LOOK), 'app font not applied in the popup'
    set_theme(page, 'arcade')
    pop.wait_for_function('document.documentElement.dataset.theme === "arcade"', timeout=2000)
    assert pop.evaluate(LOOK) == page.evaluate(LOOK), 'popup did not follow the theme change'
    set_theme(page, 'calm')

    pop.get_by_test_id('count').click()
    pop.get_by_test_id('count').click()
    assert pop.get_by_test_id('count').inner_text() == 'Count 2', 'counter did not update in the popup'
    pop.get_by_test_id('text').fill('hello')
    assert pop.get_by_test_id('echo').inner_text() == 'Text: hello', 'typed text not echoed in the popup'

    pop.get_by_role('button', name='Show dialog').click()
    assert pop.evaluate('document.querySelector("[data-testid=dialog]").matches(":modal")'), 'dialog not modal in the popup'
    pop.get_by_role('button', name='Close').click()
    pop.get_by_role('button', name='Popover').click()
    assert pop.evaluate('document.querySelector("[data-testid=pop]").matches(":popover-open")'), 'popover not open in the popup'
    pop.keyboard.press('Escape')

    before = pop.get_by_test_id('width').inner_text()
    pop.set_viewport_size({'width': 700, 'height': 500})
    pop.wait_for_timeout(500)
    after = pop.get_by_test_id('width').inner_text()
    assert before != after and '690' in after, f'ResizeObserver width did not follow the resize: {before} -> {after}'

    pop.get_by_role('button', name='Dock').click()
    assert docked(page), 'Dock did not bring the panel back'
    assert page.get_by_test_id('count').inner_text() == 'Count 2', 'counter lost when docked'
    assert page.get_by_test_id('text').input_value() == 'hello', 'text lost when docked'
    assert wait_gone(pop, 3), 'popup stayed open after Dock'

    pop = pop_out(page)
    pop.evaluate('window.close()')
    assert docked(page), 'closing the popup did not dock the panel'

    pop = pop_out(page)
    pop.reload()
    assert docked(page), 'reloading the popup did not dock the panel'
    assert wait_gone(pop, 3), 'popup stayed open after its reload'

    pop = pop_out(page)
    page.reload()
    assert wait_gone(pop, 1.5), 'popup did not close itself after the main page reloaded'
    assert not page.errors, f'page errors: {page.errors}'
