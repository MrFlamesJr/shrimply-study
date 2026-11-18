import { PageHead } from '../components/Page'

// [section, [name, what to know][]]
const TIPS: [string, [string, string][]][] = [
  [
    'Study modes',
    [
      ['Flashcards', "Flip a card with a click or Space, then say whether you knew it: 1 for Didn't know, 2 for Knew it."],
      [
        'Multiple choice',
        "Pick an option with a click or its number key. The wrong options are answers from other cards in this quiz, from the card's group first, unless a card brings its own. Pick a wrong one and you'll see which card it came from.",
      ],
      ['Typing', "Type the answer, then press Enter. Capitals, accents, punctuation and extra spaces don't matter. Made a typo, or used other correct words? Select \"I was right\" to count it."],
    ],
  ],
  [
    'Card kinds',
    [
      ['Front and back', 'A card is asked from its front. Set a card to Random in Edit quiz and it is asked from its front or its back at random.'],
      ['Fill in the blank', 'Each blank is asked on its own, with the rest of the sentence as your clue.'],
      ['True or false', 'In multiple choice and typing, you pick True or False. As a flashcard, it flips to the answer.'],
      ['Choice questions', 'Some ask for one answer, and any correct answer counts. Others say to select all that apply: tick every correct answer, then Check. Any you leave out show as Missed.'],
      ['Sequences', 'In multiple choice, drag the steps into order, then Check. Point at a step to see where it belongs. Typing asks for one step at a time.'],
    ],
  ],
  [
    'While you study',
    [
      ['Groups', 'Put cards you tend to mix up in one group (New group, in Edit quiz). Multiple choice then offers them against each other, so you learn to tell them apart.'],
      ['Explanations', 'A card can have an explanation, added in Edit quiz. It shows after you answer or flip that card.'],
      ['Images', 'Select an image to see it full screen. On a flashcard or an answer option, rest the pointer on it instead.'],
      ['Fix as you go', 'Spot a mistake while studying? Select the pencil on the card to fix it right away.'],
      ['Keys', 'Space flips a flashcard, the number keys pick an option, Enter checks and goes on, and Esc leaves the round.'],
    ],
  ],
  [
    'After a round',
    [
      ['Results', 'Your score and every answer, with filters for Missed, Correct and Marked (the ones you counted with "I was right").'],
      ['Retry missed', 'Go over just the ones you missed, as often as you need.'],
    ],
  ],
]

/** How studying works: what to know for every mode and kind of card, in sections, in a tab of its own (closed like any tab). */
export function StudyTipsScreen() {
  return (
    <main className="page">
      <PageHead title="How studying works" sub="What to know about each study mode and each kind of card" />
      {TIPS.map(([section, tips]) => (
        <section key={section} className="tips-section">
          <h2>{section}</h2>
          <dl className="tips-list">
            {tips.map(([name, text]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  )
}
