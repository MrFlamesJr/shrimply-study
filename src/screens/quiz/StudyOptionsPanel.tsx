import type { Format, Side, StudyOptions } from '../../model'
import { Segmented } from '../../components/Segmented'
import { StudyTips } from './StudyTips'

// [value, label, hint shown under the bar while it is chosen]
const MODES: [Format, string, string][] = [
  ['flashcards', 'Flashcards', 'Flip each card and rate yourself.'],
  ['choice', 'Multiple choice', 'Select the correct answer from four options.'],
  ['typing', 'Typing', 'Type the answer from memory.'],
]
const SIDES: [Side, string, string][] = [
  ['term', 'Front', 'You see the front and answer with the back.'],
  ['definition', 'Back', 'You see the back and answer with the front.'],
  ['mixed', 'Mixed', 'Each card shows its front or its back at random.'],
]
const ORDERS: [boolean, string, string][] = [
  [true, 'Shuffled', 'A new random order every round.'],
  [false, 'In order', 'The order the cards have in the quiz.'],
]

// A hint and the notes that apply, as one text.
const hint = (...parts: (string | false)[]) => parts.filter(Boolean).join(' ')

type Props = {
  prefs: StudyOptions
  setPrefs: (p: StudyOptions) => void
  /** The format in use: the chosen one, unless it can't be studied with this few cards. */
  format: Format
  /** Whether the cards can be asked as multiple choice (see `canChoose`). */
  choosable: boolean
  hasGroups: boolean
  /** The kinds of card there are to study, so a hint can say which ones an option does nothing for. */
  kinds: { term: boolean; cloze: boolean; trueFalse: boolean; choice: boolean; sequence: boolean }
  /** The "How studying works" box is whole, not minimized (remembered in this browser). */
  tipsOpen: boolean
  setTipsOpen: (open: boolean) => void
}

export function StudyOptionsPanel({ prefs, setPrefs, format, choosable, hasGroups, kinds, tipsOpen, setTipsOpen }: Props) {
  // Fill-in-the-blank, true or false, choice and sequence cards have no sides: they always show their statement, question or title.
  const noSides = [kinds.cloze && 'fill-in-the-blank', kinds.trueFalse && 'true or false', kinds.choice && 'choice question', kinds.sequence && 'sequence']
    .filter(Boolean)
    .join(' and ')
  const sideNote =
    noSides !== '' &&
    (kinds.term
      ? `${noSides[0].toUpperCase()}${noSides.slice(1)} cards ignore this: they always show their own text.`
      : `This quiz has only ${noSides} cards, so this changes nothing.`)

  // The tips box is the page's next block, not part of the options section, so it gets the page's gap on both sides.
  return (
    <>
      <section className="study-options" aria-labelledby="options-title">
        <h2 id="options-title">Study options</h2>
        <div className="options">
          <Segmented
            label="Study mode"
            options={MODES.map(([value, label, text]) => ({
              value,
              label,
              disabled: value === 'choice' && !choosable,
              hint: hint(
                text,
                value === 'choice' && hasGroups && "Wrong answers come from the card's group first.",
                value === 'choice' && kinds.trueFalse && 'True or false cards offer only True and False.',
                value === 'typing' && kinds.trueFalse && 'True or false cards are answered with two buttons.',
                value === 'choice' && kinds.sequence && 'Sequences are answered by arranging their steps.',
                value === 'typing' && kinds.choice && 'Choice questions with several correct answers are answered by selecting them.',
                value === 'typing' && kinds.sequence && 'Sequences are asked one step at a time.',
                !choosable && 'Multiple choice needs at least 2 cards.',
              ),
            }))}
            value={format}
            onChange={(format) => setPrefs({ ...prefs, format })}
          />
          <Segmented
            label="Question side"
            options={SIDES.map(([value, label, text]) => ({ value, label, hint: hint(text, sideNote) }))}
            value={prefs.side}
            onChange={(side) => setPrefs({ ...prefs, side })}
          />
          <Segmented
            label="Card order"
            options={ORDERS.map(([value, label, hint]) => ({ value, label, hint }))}
            value={prefs.shuffle}
            onChange={(shuffle) => setPrefs({ ...prefs, shuffle })}
          />
        </div>
      </section>
      <StudyTips kinds={kinds} open={tipsOpen} onToggle={setTipsOpen} />
    </>
  )
}
