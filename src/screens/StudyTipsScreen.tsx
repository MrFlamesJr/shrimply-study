import { PageHead } from '../components/Page'

// [name, what to know]
const TIPS: [string, string][] = [
  ['Fill in the blank', 'Each blank is asked on its own, with the rest of the sentence as your clue.'],
  ['True or false', 'In multiple choice and typing, you just pick True or False.'],
  ['Choice questions', 'Some ask for one answer, and any correct answer counts. Others say to select all that apply: tick every correct answer, then Check. Any you leave out show as Missed.'],
  ['Sequences', 'In multiple choice, drag the steps into order, then Check. Point at a step to see where it belongs. Typing asks for one step at a time.'],
  ['Wrong answers', "In multiple choice, the wrong options are answers from elsewhere in this quiz, unless a card has its own. Pick one and you'll see where it came from."],
  ['Groups', 'Put cards you tend to mix up in one group (New group, in Edit quiz). Multiple choice then offers them against each other, so you learn to tell them apart.'],
  ['Typing', "Capitals, accents, punctuation and extra spaces don't matter. Made a typo, or used other correct words? Select \"I was right\" to count it."],
  ['Explanations', 'Add one to a card in Edit quiz. It shows after you answer or flip that card.'],
  ['Images', 'Select an image to see it full screen. On a flashcard or an answer option, rest the pointer on it instead.'],
  ['Retry missed', 'At the end, see your score and every answer, then go over just the ones you missed, as often as you need.'],
  ['Fix as you go', 'Spot a mistake while studying? Select the pencil on the card to fix it right away.'],
]

/** How studying works: a few things worth knowing, for every kind of card, in a tab of its own (closed like any tab). */
export function StudyTipsScreen() {
  return (
    <main className="page">
      <PageHead title="How studying works" sub="A few things worth knowing before you start" />
      <dl className="tips-list">
        {TIPS.map(([name, text]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
