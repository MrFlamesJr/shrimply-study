// What's new in each release, newest first, written for users (plain, short, sentence case, like all UI text).
// Only the few new things a student will use and care about (a new way to make or study cards), never polish,
// fixes or rewordings. A new entry at the top opens the Welcome tab once more; the newest entry's notes are
// on an empty group's page under "What's new [<name>]", and every entry is in the What's new tab (`#/_changelog`). `name`
// is the release's branch name exactly as written in Git, unique: App remembers the last one shown in this browser.
// `date` is the day it went out (merged into main), as YYYY-MM-DD; shown with the name wherever the notes are.
export const RELEASES: { name: string; date: string; notes: [string, string][] }[] = [
  {
    name: 'Release-RubberDuck',
    date: '2026-11-17',
    notes: [
      ['Saved to Google Drive as you work', 'Sign in with Google and your libraries save to your Drive by themselves a moment after each change. A .shrimp file opens as a copy in your browser, ready to upload.'],
      ['Share in one click', 'Press Share and Copy link: anyone with the link can view and study your library, and always sees your latest version. Stop sharing whenever you like.'],
      ['Shared libraries are view only', 'A library shared with you stays in sync by itself and can not be changed. Press Make a copy to get one of your own.'],
      ['How studying works is a tab', 'Open the tips for every card kind from the link under the study options, and keep them beside your quiz.'],
      ['Popped-out windows keep their address', 'Reload a window you moved out and it stays out. Paste its address into a new tab to open just that page.'],
      ['Several libraries at once', 'Open as many libraries as you like; each has its own row, status and Share.'],
      ['Tabs and split view', 'Open pages in tabs, put two side by side or one above the other, and move a pane into its own window.'],
      ['One tree of files', 'The sidebar shows every open file with its courses and quizzes. Fold what you are not using, and rest the pointer on a file to see what is in it.'],
      ['Explorer', 'Every open file as one tree. Copy, cut, paste or drag courses, quizzes and cards, also from one file to another.'],
      ['Undo', 'Press Ctrl+Z to take back your last change, in any file.'],
      ['One answer or all that apply', 'Choose for each choice question whether students pick one answer or select all that apply.'],
      ['Reorder cards', 'Drag a card by its grip to move it, and add new cards from the top of the list.'],
    ],
  },
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
