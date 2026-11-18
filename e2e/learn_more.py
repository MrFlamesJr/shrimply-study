"""The welcome page: its title, one gold button, and two lists of quiet links, Start and Learn. Learn's links
(How studying works, Saving and sharing, What's new) are .open-links like the sidebar's What's new, each opening its
tab, one at most; Saving and sharing sits at #/_learn-more with the privacy policy link. The lists never spill out of
the page, at a 320px window or a narrow pane, in every theme."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import THEMES, set_theme  # noqa: E402


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def wait_for(page, check, what, timeout=5000):
    for _ in range(timeout // 50):
        if check():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{what} (at {page.url})')


def learn(page, name):
    return page.locator('.wb-tab:not([hidden]) .welcome .open-link', has_text=name)


def fits(page, what):
    """Nothing on the welcome page spills sideways, and each link is one line."""
    m = page.evaluate("""() => {
      const w = document.querySelector('.wb-tab:not([hidden]) .welcome')
      const page = w.closest('.page'); const pr = page.getBoundingClientRect()
      const links = [...w.querySelectorAll('.link-list li > *')]
      return { over: w.scrollWidth - w.clientWidth, pageOver: page.scrollWidth - page.clientWidth,
               out: [...w.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > pr.right + 1).map((e) => e.className || e.tagName).slice(0, 4),
               tall: links.filter((e) => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight) * 1.6 + 24).map((e) => e.innerText) }
    }""")
    need(m['over'] <= 0 and m['pageOver'] <= 0 and not m['out'], f'{what}: nothing spills out: {m}')
    need(not m['tall'], f'{what}: each link is one line: {m}')


def run(page, base):
    page.goto(base + '#/_welcome')
    welcome = page.locator('.wb-tab:not([hidden]) .welcome')
    welcome.wait_for()
    need(welcome.get_by_role('heading', name='Shrimply Study').count() == 1, 'titled Shrimply Study')
    need(welcome.locator('button.primary').count() == 1, 'one gold button')
    need(welcome.locator('.steps').count() == 0, 'no numbered steps')
    for name in ('How studying works', "What's new"):
        need(learn(page, name).count() == 1, f'Learn has {name}')
    link = learn(page, 'Saving and sharing')
    need(link.locator('svg').count() == 1, 'Saving and sharing ends in the OpenIcon')
    news = page.locator('.sidebar-news')
    need(
        page.evaluate('([a, b]) => getComputedStyle(a).color === getComputedStyle(b).color', [link.element_handle(), news.element_handle()]),
        'it looks like the sidebar\'s What\'s new link',
    )
    tabs = page.locator('[role=tab]', has_text='Saving and sharing')
    need(tabs.count() == 0, 'no tab yet')
    link.click()
    wait_for(page, lambda: tabs.count() == 1, 'the link opens the Saving and sharing tab')
    need(page.evaluate('location.hash') == '#/_learn-more', f'at its own address: {page.evaluate("location.hash")}')
    need(page.locator('.wb-tab:not([hidden]) h1', has_text='Saving and sharing').count() == 1, 'with its title')
    need(page.locator('.wb-tab:not([hidden]) .tips-section h2').count() >= 3, 'in sections')
    need(page.locator('.wb-tab:not([hidden]) .tips-list dt').count() >= 5, 'and the notes')
    need(page.locator('.wb-tab:not([hidden]) a[href="privacy.html"]').count() == 1, 'and the privacy policy link')
    need(page.locator('.pane-crumbs', has_text='Shrimply Study').count() >= 1, 'under Shrimply Study in its crumbs')
    need(page.locator('dialog[open]').count() == 0, 'no dialog')

    # One at most: a second click on the welcome page's link focuses the same tab.
    page.locator('[role=tab]', has_text='Welcome').first.click()
    learn(page, 'Saving and sharing').click()
    page.wait_for_timeout(300)
    need(tabs.count() == 1, 'never a second one')

    # The other Learn links open their tabs too.
    for name, title, address in (('How studying works', 'How studying works', '#/_how-to-study'), ("What's new", "What's new", '#/_changelog')):
        page.locator('[role=tab]', has_text='Welcome').first.click()
        learn(page, name).click()
        wait_for(page, lambda: page.evaluate('location.hash') == address, f'{name} opens its tab: {page.evaluate("location.hash")}')
        need(page.locator('.wb-tab:not([hidden]) h1', has_text=title).count() == 1, f'{name}: with its title')

    # Edges: a 320px window and a narrow pane beside another, in every theme.
    page.locator('[role=tab]', has_text='Welcome').first.click()
    for width in (320, 1280):
        page.set_viewport_size({'width': width, 'height': 800})
        page.wait_for_timeout(300)
        for theme in THEMES:
            set_theme(page, theme)
            fits(page, f'{theme} {width}px')
    set_theme(page, 'calm')
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
