import type { Format, Side, StudyOptions } from '../../model'
import { Segmented } from '../../components/Segmented'

// [value, label, hint shown under the bar while it is chosen]
const MODES: [Format, string, string][] = [
  ['flashcards', 'Flashcards', 'Flip each card and rate yourself.'],
  ['choice', 'Multiple choice', 'Pick the right answer out of four.'],
  ['typing', 'Typing', 'Type the answer from memory.'],
]
const SIDES: [Side, string, string][] = [
  ['term', 'Term', 'You see the term and answer with the definition.'],
  ['definition', 'Definition', 'You see the definition and answer with the term.'],
  ['mixed', 'Mixed', 'Each card shows the term or the definition at random.'],
]
const ORDERS: [boolean, string, string][] = [
  [true, 'Shuffled', 'A new random order every round.'],
  [false, 'In order', 'The order the cards have in the quiz.'],
]

type Props = {
  prefs: StudyOptions
  setPrefs: (p: StudyOptions) => void
  /** The format in use: the chosen one, unless it can't be studied with this few cards. */
  format: Format
  /** How many cards can be studied. */
  usable: number
  hasGroups: boolean
}

export function StudyOptionsPanel({ prefs, setPrefs, format, usable, hasGroups }: Props) {
  return (
    <section className="study-options" aria-labelledby="options-title">
      <h2 id="options-title">Study options</h2>
      <div className="options">
        <Segmented
          label="Study mode"
          options={MODES.map(([value, label, hint]) => ({
            value,
            label,
            disabled: value === 'choice' && usable < 2,
            hint: `${hint}${value === 'choice' && hasGroups ? " Wrong answers come from the card's group first." : ''}${usable < 2 ? ' Multiple choice needs at least 2 cards.' : ''}`,
          }))}
          value={format}
          onChange={(format) => setPrefs({ ...prefs, format })}
        />
        <Segmented
          label="Question side"
          options={SIDES.map(([value, label, hint]) => ({ value, label, hint }))}
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
  )
}
