"""Results confetti: a canvas for a few seconds (longer when every card was known), none under reduced motion."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import load_test_library, open_app  # noqa: E402


def first_quiz(page, base):
    """First course > quiz link in the loaded library."""
    page.goto(base + '#/')
    page.locator('h1:visible').first.wait_for()
    course = next(h for h in page.eval_on_selector_all('a[href^="#/"]', 'els => els.map(e => e.getAttribute("href"))')
                  if len([p for p in h[2:].split('/') if p]) == 1 and not h[2:].startswith('_'))
    page.goto(base + course)
    page.locator('h1:visible').first.wait_for()
    return next(h for h in page.eval_on_selector_all('a[href^="#/"]', 'els => els.map(e => e.getAttribute("href"))')
                if len([p for p in h[2:].split('/') if p]) == 2 and not h[2:].startswith('_'))


def play(page, base, quiz, known):
    """A flashcards round: `known` is a list of True (Knew it) / False (Didn't know) per card, repeated as needed."""
    page.goto(base + quiz + '/study/flashcards')
    page.locator('.session-stack').first.wait_for()
    for i in range(400):
        if page.locator('.results-summary').count():
            return
        # Space flips the card, then 2 is "Knew it" and 1 is "Didn't know".
        page.keyboard.press('Space')
        page.wait_for_timeout(80)
        page.keyboard.press('2' if known(i) else '1')
        page.wait_for_timeout(450)
    raise AssertionError('the flashcards round never reached its results')


def run(page, base):
    load_test_library(page, base)
    quiz = first_quiz(page, base)

    # Every card known: a canvas and "All N correct" on the results.
    play(page, base, quiz, lambda i: True)
    text = page.locator('.results-summary .muted').first.inner_text()
    if 'All' not in text or 'correct' not in text:
        raise AssertionError(f'perfect round: expected "All N correct", got {text!r}')
    if page.locator('canvas').count() != 1:
        raise AssertionError('perfect round: no confetti canvas on the results')
    page.wait_for_timeout(400)
    if page.locator('canvas').count() != 1:
        raise AssertionError('perfect round: the confetti was gone within 1 s of the results (about 2.5 s expected)')
    # The buttons can be clicked while it plays: Study again starts a new round.
    page.get_by_role('button', name='Study again').click()
    page.locator('.session-stack').first.wait_for()
    if page.locator('.results-summary').count():
        raise AssertionError('Study again did not leave the results')
    if page.locator('canvas').count():
        raise AssertionError('a confetti canvas is still there after leaving the results')

    # A round with a miss: a canvas, gone after 2 s.
    play(page, base, quiz, lambda i: i != 0)
    if page.locator('canvas').count() != 1:
        raise AssertionError('round with a miss: no confetti canvas on the results')
    page.wait_for_timeout(2500)
    if page.locator('canvas').count():
        raise AssertionError('round with a miss: the confetti was still there after 2.5 s')

    # Reduced motion: no canvas at all.
    quiet = open_app(page.context.browser, base, reduced_motion=True)
    try:
        load_test_library(quiet, base)
        play(quiet, base, quiz, lambda i: True)
        quiet.wait_for_timeout(300)
        if quiet.locator('canvas').count():
            raise AssertionError('reduced motion: a confetti canvas appeared')
        if quiet.errors:
            raise AssertionError('errors under reduced motion: ' + '; '.join(quiet.errors))
    finally:
        quiet.context.close()

    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
