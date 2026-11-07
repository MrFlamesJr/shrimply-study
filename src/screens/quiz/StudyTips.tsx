import { InfoBox } from '../../components/InfoBox'

type Kinds = { cloze: boolean; trueFalse: boolean; choice: boolean; sequence: boolean }

// [name, what to know, the card kind it is about: shown only when the quiz has that kind]
const TIPS: [string, string, (keyof Kinds)?][] = [
  ['Fill in the blank', 'Each blank is asked on its own, with the rest of the sentence as your clue.', 'cloze'],
  ['True or false', 'In multiple choice and typing, you just pick True or False.', 'trueFalse'],
  ['Choice questions', 'When more than one answer is correct, select all of them, then Check. Any you leave out show as Missed.', 'choice'],
  [
    'Sequences',
    'In multiple choice, drag the steps into order, then Check. Point at a step to see where it belongs. Typing asks for one step at a time.',
    'sequence',
  ],
  [
    'Wrong answers',
    "In multiple choice, the wrong options are answers from elsewhere in this quiz, unless a card has its own. Pick one and you'll see where it came from.",
  ],
  [
    'Groups',
    'Put cards you tend to mix up in one group (New group, in Edit quiz). Multiple choice then offers them against each other, so you learn to tell them apart.',
  ],
  ['Typing', "Capitals, accents, punctuation and extra spaces don't matter. Made a typo, or used other correct words? Select \"I was right\" to count it."],
  ['Explanations', 'Add one to a card in Edit quiz. It shows after you answer or flip that card.'],
  ['Images', 'Select an image to see it full screen. On a flashcard or an answer option, rest the pointer on it instead.'],
  ['Retry missed', 'At the end, see your score and every answer, then go over just the ones you missed, as often as you need.'],
  ['Fix as you go', 'Spot a mistake while studying? Select the pencil on the card to fix it right away.'],
]

type Props = {
  /** The kinds of card the quiz has, so it only explains those. */
  kinds: Kinds
  open: boolean
  onToggle: (open: boolean) => void
}

/** "How studying works": a few things worth knowing, under the study options. */
export function StudyTips({ kinds, open, onToggle }: Props) {
  return (
    <InfoBox title="How studying works" open={open} onToggle={onToggle}>
      <dl className="tips-list">
        {TIPS.filter(([, , kind]) => !kind || kinds[kind]).map(([name, text]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </InfoBox>
  )
}
