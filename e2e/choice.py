"""Choice questions: the mode bar in the editor, both modes studied (multiple choice and typing), mode in library.json."""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import load_test_library  # noqa: E402

EVEN = 'Which of these are even numbers?'
OCEAN = 'Which of these is the largest ocean?'
LABELS_JS = "els => els.map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim())"
CONTINUE = re.compile('^Continue')
CHECK = re.compile('^Check')


def need(cond, message):
    if not cond:
        raise AssertionError(message)


def quiz_link(page, base):
    """The Choice questions quiz's address, found by its name in the sidebar tree."""
    page.goto(base + '#/')
    link = page.locator('a[href^="#/"]', has_text='Choice questions').first
    link.wait_for(timeout=5000)
    href = link.get_attribute('href')
    need(len([p for p in href[2:].split('/') if p]) == 2, f'Choice questions link is not a quiz address: {href}')
    return href


def labels(page):
    return page.eval_on_selector_all('.session-stack .choice', LABELS_JS)


def study(page, base, quiz, fmt):
    """Start a round (in order, see run) in the given mode."""
    page.goto(base + quiz)
    page.goto(base + quiz + '/study/' + fmt)
    try:
        page.locator('.session-stack').wait_for(timeout=5000)
    except Exception:
        raise AssertionError(f'no study session at {page.url}: ' + page.locator('body').inner_text()[:300])


def go_to(page, target):
    """Answer questions until the one whose text has `target` is showing."""
    for _ in range(40):
        stack = page.locator('.session-stack')
        stack.wait_for()
        if target in stack.inner_text():
            return
        answer = page.locator('[aria-label="Your answer"]')
        if answer.count():
            answer.first.fill('zzz')
            page.keyboard.press('Enter')
        else:
            page.locator('.session-stack .choice').first.click()
            if page.locator('.pick-all').count():
                page.get_by_role('button', name=CHECK).click()
        page.get_by_role('button', name=CONTINUE).click()
        page.wait_for_timeout(450)
    raise AssertionError(f'never reached the question "{target}"')


def click_option(page, text):
    names = labels(page)
    need(text in names, f'option "{text}" not among {names}')
    page.locator('.session-stack .choice').nth(names.index(text)).click()


def result(page):
    page.locator('.sheet-result').wait_for()
    return page.locator('.sheet-result').inner_text().strip()


def editor_card(page, question):
    """The .choice-field whose question box holds `question`."""
    page.locator('.choice-field').first.wait_for(timeout=5000)
    values = page.eval_on_selector_all('.choice-field', "els => els.map(e => e.querySelector('textarea').value)")
    need(question in values, f'no choice card "{question}" in the editor, saw {values[:6]}')
    return page.locator('.choice-field').nth(values.index(question))


def checked_mode(field):
    return field.locator('input[type=radio]:checked').evaluate("e => e.closest('label').textContent.trim()")


def editor_checks(page, base, quiz):
    page.goto(base + quiz + '/edit')
    field = editor_card(page, EVEN)
    need(checked_mode(field) == 'One answer', f'"{EVEN}" should show One answer, got {checked_mode(field)}')
    need(field.get_by_text('Pick one. Any correct answer counts.').is_visible(), 'One answer hint not shown')
    field.get_by_text('All that apply', exact=True).click()
    need(checked_mode(field) == 'All that apply', 'switching to All that apply did not take')
    need(field.get_by_text('Pick every correct answer, then Check.').is_visible(), 'All that apply hint not shown')
    page.get_by_role('button', name='Done').click()
    page.wait_for_timeout(800)
    page.reload()
    page.goto(base + quiz + '/edit')
    field = editor_card(page, EVEN)
    need(checked_mode(field) == 'All that apply', 'the mode was not kept after Done and a reload')
    # A new Choice question starts as One answer with 1 correct and 2 wrong answer boxes.
    page.get_by_role('button', name=re.compile('Choice question')).first.click()
    page.wait_for_timeout(300)
    first = page.locator('.choice-field').first
    need(first.locator('textarea').first.input_value() == '', 'the new choice card should be first and empty')
    need(checked_mode(first) == 'One answer', f'a new choice card should start as One answer, got {checked_mode(first)}')
    lists = first.locator('.choice-list')
    counts = [lists.nth(i).locator('.entry').count() for i in range(2)]
    need(counts == [1, 2], f'a new choice card should have 1 correct and 2 wrong boxes, got {counts}')
    page.get_by_role('button', name='Done').click()
    page.wait_for_timeout(500)


def multiple_choice_checks(page, base, quiz):
    study(page, base, quiz, 'choice')
    go_to(page, EVEN)
    need('Select one answer' in page.locator('.session-stack').inner_text(), 'even numbers should say Select one answer')
    need(page.locator('.pick-all').count() == 0, 'a One answer question with two correct answers should not be pick-all')
    click_option(page, '4')
    need(result(page) == 'Correct!', 'picking one of two correct answers should be Correct!')
    marked = page.eval_on_selector_all('.session-stack .choice.is-correct', LABELS_JS)
    need(sorted(marked) == ['2', '4'], f'both correct options should be marked, got {marked}')
    ticks = page.locator('.session-stack .choice.is-correct [aria-label="Right answer"]').count()
    need(ticks == 2, f'both correct options need a check mark, got {ticks}')
    # All that apply with one correct answer: a wrong set, then the correct set.
    study(page, base, quiz, 'choice')
    go_to(page, OCEAN)
    need('Select all that apply' in page.locator('.session-stack').inner_text(), 'ocean should say Select all that apply')
    need(page.locator('.pick-all .choice-box').count() >= 2, 'ocean should show check boxes')
    click_option(page, 'Atlantic')
    page.get_by_role('button', name=CHECK).click()
    need(result(page) == 'Incorrect!', 'a wrong set should be Incorrect!')
    note = page.locator('.sheet-note').inner_text()
    need(re.search(r'1 wrong', note) and re.search(r'1 missed', note), f'note should count wrong and missed, got "{note}"')
    study(page, base, quiz, 'choice')
    go_to(page, OCEAN)
    click_option(page, 'Pacific')
    page.get_by_role('button', name=CHECK).click()
    need(result(page) == 'Correct!', 'the correct set should be Correct!')


def typing_checks(page, base, quiz):
    for answer in ('4', '2'):
        study(page, base, quiz, 'typing')
        go_to(page, EVEN)
        need('Type one correct answer' in page.locator('.session-stack').inner_text(),
             'even numbers should ask to type one correct answer')
        page.locator('[aria-label="Your answer"]').first.fill(answer)
        page.keyboard.press('Enter')
        need(result(page) == 'Correct!', f'typing "{answer}" should be Correct!')
    study(page, base, quiz, 'typing')
    go_to(page, OCEAN)
    need(page.locator('.pick-all').count() == 1, 'an All that apply question should be answered by selecting, also in typing mode')
    need(page.locator('[aria-label="Your answer"]').count() == 0, 'no typing box for an All that apply question')


def json_checks(page, base):
    page.goto(base + '#/_debug')
    page.get_by_role('button', name='Show current').click()
    data = json.loads(page.locator('textarea[aria-label="library.json"]').input_value())
    need(data.get('version') == 3, f'library.json version should be 3, got {data.get("version")}')
    cards = []
    for course in data['courses']:
        for quiz in course['quizzes']:
            cards += quiz['cards'] + [c for g in quiz.get('groups', []) for c in g['cards']]
    choices = [c for c in cards if c.get('type') == 'choice']
    need(choices, 'no choice cards in library.json')
    bad = [c['question'] for c in choices if c.get('mode') not in ('one', 'all')]
    need(not bad, f'choice cards without a mode: {bad[:3]}')
    modes = {c['question']: c['mode'] for c in choices}
    need(modes.get(EVEN) == 'all', f'the edited mode should be written: {modes.get(EVEN)}')
    need(modes.get(OCEAN) == 'all', f'the ocean question should be written as all: {modes.get(OCEAN)}')


def run(page, base):
    # Studied in the order of the cards, not shuffled. Set before the library loads: the options are read at start.
    page.evaluate("localStorage.setItem('shrimply-study-options', JSON.stringify({ format: 'choice', side: 'term', shuffle: false }))")
    page.reload()
    load_test_library(page, base)
    quiz = quiz_link(page, base)
    multiple_choice_checks(page, base, quiz)
    typing_checks(page, base, quiz)
    editor_checks(page, base, quiz)
    json_checks(page, base)
    if page.errors:
        raise AssertionError('errors: ' + '; '.join(page.errors))
