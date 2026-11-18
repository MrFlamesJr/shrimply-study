"""Shared helpers for the browser checks: serve a frozen build, open pages, themes, screenshots, contrast."""
import contextlib
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEMES = ['calm', 'arcade', 'underwater', 'forest', 'unicorn', 'quizlet', 'kahoot']
WINDOWS = sys.platform == 'win32'


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def kill_tree(proc):
    if WINDOWS:
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], capture_output=True)
    else:
        proc.kill()
    proc.wait()


@contextlib.contextmanager
def serve(tmp=None):
    """Build a frozen copy of the app and serve it with vite preview; yields the base URL."""
    own = tmp is None
    tmp = tmp or tempfile.mkdtemp(prefix='shrimply-e2e-')
    dist = os.path.join(tmp, 'dist')
    proc = None
    try:
        subprocess.run(f'npx vite build --outDir "{dist}" --emptyOutDir', cwd=ROOT, shell=True, check=True,
                       stdout=subprocess.DEVNULL)
        port = free_port()
        proc = subprocess.Popen(f'npx vite preview --outDir "{dist}" --host 127.0.0.1 --port {port} --strictPort', cwd=ROOT,
                                shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f'http://127.0.0.1:{port}/'
        for _ in range(100):
            try:
                urllib.request.urlopen(base, timeout=1).close()
                break
            except OSError:
                if proc.poll() is not None:
                    raise RuntimeError('vite preview exited early')
                time.sleep(0.3)
        else:
            raise RuntimeError('vite preview did not answer')
        yield base
    finally:
        if proc:
            kill_tree(proc)
        if own:
            shutil.rmtree(tmp, ignore_errors=True)


def open_app(browser, base, width=1280, height=800, reduced_motion=None):
    """A fresh page; console errors and page errors collect on page.errors."""
    kwargs = {'viewport': {'width': width, 'height': height}}
    if reduced_motion is not None:
        kwargs['reduced_motion'] = 'reduce' if reduced_motion else 'no-preference'
    page = browser.new_context(**kwargs).new_page()
    page.errors = []
    page.on('console', lambda m: page.errors.append(f'console: {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: page.errors.append(f'pageerror: {e}'))
    page.goto(base)
    return page


def load_test_library(page, base):
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Load test library').click()
    page.get_by_text('Loaded the test library.').first.wait_for()


def set_theme(page, theme):
    page.evaluate('t => { document.documentElement.dataset.theme = t }', theme)


def shots(page, name, outdir, themes=THEMES):
    os.makedirs(outdir, exist_ok=True)
    paths = []
    for theme in themes:
        set_theme(page, theme)
        page.wait_for_timeout(150)
        path = os.path.join(outdir, f'{name}-{theme}.png')
        page.screenshot(path=path)
        paths.append(path)
    return paths


CONTRAST_JS = """
sel => {
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a),
                                b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  // Resolve any CSS color (oklch, color-mix) to rgb through a canvas pixel.
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = css => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const rgb = c => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own && !(el instanceof SVGElement)) continue;
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const bg = rgba(getComputedStyle(e).backgroundColor);
      if (bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
    }
    let bg = { r: 0, g: 0, b: 0, a: 1 };
    if (layers.length && layers[layers.length - 1].a >= 1) bg = layers.pop();
    while (layers.length) bg = over(layers.pop(), bg);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    out.push({ text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
               ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, color: rgb(fg), background: rgb(bg) });
  }
  return out;
}
"""


def contrast(page, selector):
    """WCAG contrast of each matching element's color against its effective background (approximate for glass)."""
    return page.evaluate(CONTRAST_JS, selector)


def toast_detail(toast):
    """What a toast says under More info: opens it when it is shut, then reads its detail lines."""
    more = toast.get_by_role('button', name='More info')
    if more.get_attribute('aria-expanded') != 'true':
        more.click()
    return toast.locator('.toast-detail').inner_text()
