// What's new in each release, newest first, written for users (plain, short, sentence case, like all UI text).
// Only the few new things a student will use and care about (a new way to make or study cards), never polish,
// fixes or rewordings. A new entry at the top shows the welcome page once more; the newest entry's notes are
// always on home under "What's new [<name>]", and every entry is on the changelog page (`#/_changelog`). `name`
// is the release's branch name exactly as written in Git, unique: App remembers the last one shown in this browser.
// `date` is the day it went out (merged into main), as YYYY-MM-DD; shown with the name wherever the notes are.
export const RELEASES: { name: string; date: string; notes: [string, string][] }[] = [
  {
    name: 'Release-CrispyBacon',
    date: '2026-11-07',
    notes: [
      ['True or false cards', 'A statement you mark true or false. Quick to write, quick to answer.'],
      [
        'Choice questions',
        'Your own multiple choice: a question with the wrong answers you choose. When several answers are correct, you pick all of them.',
      ],
      ['Sequences', 'Steps in order, like a process or a timeline. You study them by dragging the steps into place.'],
      ['Name the sides', 'Cards are Front and Back by default. Switch them to Term and Definition, Word and Translation, or names of your own.'],
      ['Quizlet and Kahoot themes', 'Study in the colors of Quizlet or Kahoot. Pick a theme at the bottom of the sidebar.'],
      [
        'Google Drive',
        'Select Google Drive at the top of the page to save your library to your Drive and share it with a link. People who open the link can pull your changes each time you save.',
      ],
    ],
  },
  // The first release brought the whole app, so its notes are its main features, not what changed.
  {
    name: 'Release-Kermit',
    date: '2026-11-05',
    notes: [
      ['The first release', 'Where Shrimply Study began, so it brought the whole app. These are the main things to know.'],
      [
        'Courses and quizzes',
        'Make a course for each class and a quiz for each chapter. Type your cards, or import them from Quizlet or a spreadsheet.',
      ],
      [
        'Three ways to study',
        'Flashcards, multiple choice or typing, with the term or the definition first, in order or shuffled. At the end, retry just the ones you missed.',
      ],
      ['Fill in the blank', 'Mark words in a sentence as blanks, then answer one blank at a time.'],
      ['Images and explanations', 'Add a picture to a card, and an explanation that shows after you answer.'],
      [
        'Groups',
        'Put cards that are easy to mix up in a group. Multiple choice takes its wrong answers from the same group first, so you learn to tell them apart.',
      ],
      [
        'Your cards, your file',
        'Your cards stay in this browser. Download them as a .shrimp file to keep a copy or study on another device, and open it again any time.',
      ],
      ['Themes', 'Calm, Neon arcade, Underwater, Enchanted forest and Sassy unicorn. Pick one at the bottom of the sidebar.'],
    ],
  },
]
