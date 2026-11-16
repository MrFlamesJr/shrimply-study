"""Runs every e2e/*.py module that has run(page, base), each in a fresh page: python -I e2e/run.py"""
import glob
import importlib
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright  # noqa: E402
from helpers import open_app, serve  # noqa: E402


def modules():
    names = sorted(os.path.basename(p)[:-3] for p in glob.glob(os.path.join(HERE, '*.py')))
    names = [n for n in names if n not in ('helpers', 'run')]
    names.sort(key=lambda n: n != 'smoke')
    mods = [importlib.import_module(n) for n in names]
    return [m for m in mods if hasattr(m, 'run')]


def main():
    results = []
    with serve() as base, sync_playwright() as p:
        browser = p.chromium.launch()
        for mod in modules():
            page = open_app(browser, base)
            try:
                mod.run(page, base)
                results.append((mod.__name__, None))
            except Exception:
                results.append((mod.__name__, traceback.format_exc()))
            page.context.close()
        browser.close()
    for name, err in results:
        print(f'{"PASS" if err is None else "FAIL"} {name}')
        if err:
            print(err)
    failed = sum(1 for _, e in results if e)
    print(f'{len(results) - failed} passed, {failed} failed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
