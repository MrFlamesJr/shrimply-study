"""The sidebar's open or closed state survives a reload on a wide screen (asked for); a small screen always starts with
it closed, as there it covers the page."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import load_test_library  # noqa: E402


def closed(page):
    return page.evaluate("document.documentElement.dataset.sidebar === 'closed'")


def run(page, base):
    load_test_library(page, base)
    page.goto(base + '#/')
    page.get_by_role('button', name='Collapse sidebar').wait_for()
    assert not closed(page), 'a wide screen starts with the sidebar open'

    page.get_by_role('button', name='Collapse sidebar').click()
    page.wait_for_function("document.documentElement.dataset.sidebar === 'closed'")
    page.reload()
    page.get_by_role('button', name='Expand sidebar').wait_for()
    assert closed(page), 'closed, it stays closed after a reload'

    page.get_by_role('button', name='Expand sidebar').click()
    page.wait_for_function("document.documentElement.dataset.sidebar === 'open'")
    page.reload()
    page.get_by_role('button', name='Collapse sidebar').wait_for()
    assert not closed(page), 'opened again, it stays open after a reload'

    # Small screens start closed whatever was chosen on a wide one, and that choice stays for the wide screen.
    page.get_by_role('button', name='Collapse sidebar').click()
    page.set_viewport_size({'width': 700, 'height': 800})
    page.reload()
    page.get_by_role('button', name='Expand sidebar').wait_for()
    page.get_by_role('button', name='Expand sidebar').click()
    page.get_by_role('button', name='Collapse sidebar').first.wait_for()
    page.set_viewport_size({'width': 1280, 'height': 800})
    page.get_by_role('button', name='Expand sidebar').wait_for()
    assert closed(page), 'opening the drawer on a small screen does not change the wide screen choice'
