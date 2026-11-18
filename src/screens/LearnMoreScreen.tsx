import type { ReactNode } from 'react'
import { PageHead } from '../components/Page'
import { BrowserIcon, CloudIcon, FileIcon } from '../components/Icons'

// [section, [name, what to know][]]: a name may lead with the sidebar's where-icon for that place.
const NOTES: [string, [ReactNode, string][]][] = [
  [
    'Where a library lives',
    [
      [
        <>
          <CloudIcon /> Your Google Drive
        </>,
        'Signed in with Google, new libraries are made in your Drive and save by themselves a moment after each change. Ctrl+S saves at once. On another device, sign in, then Open.',
      ],
      [
        <>
          <FileIcon /> On this device
        </>,
        'In Chrome and Edge, a .shrimp file you open from this computer stays tied to that file. Your changes wait until you save: Save on its row, or Ctrl+S, writes them into the file, and closing it with unsaved changes asks first. Other browsers open a copy that stays in this browser.',
      ],
      [
        <>
          <BrowserIcon /> Only in this browser
        </>,
        "Signed out, a new library stays in this browser, which keeps it between visits, but clearing the browser's data loses it. Upload to Google Drive on its row keeps it in your Drive. Download a copy saves it as a .shrimp file at any time.",
      ],
    ],
  ],
  [
    'Sharing',
    [
      [
        'Share a link',
        'Share on a library\'s row, then Copy link: anyone with the link can open it, with no sign-in. They can view and study it but not change it, and they always see your latest version. Stop sharing turns the link off.',
      ],
      ['Shared with you', 'A library shared with you is view only and stays in sync with the original by itself. To change it, select Make a copy: the copy is yours, in your Drive.'],
    ],
  ],
  [
    'Your account',
    [
      [
        'One per tab',
        'Sign in with Google is at the top of the sidebar. Signed in, your email, Switch account and Sign out are at its bottom. Each changes only this tab, and a new tab starts with the account you chose last.',
      ],
      ['Signing out', 'Closes your own Google Drive libraries in this tab. Libraries kept in this browser and files on this device stay open.'],
    ],
  ],
  ['Privacy', [['Only its own files', 'Shrimply Study sees only the files it saved to your Drive, or that you chose for it, and nothing else in it.']]],
]

/** Saving and sharing, from the welcome page's Learn list: where libraries are kept and how to share them, in a tab of its own. */
export function LearnMoreScreen({ drive }: { drive: { setUp: boolean } }) {
  if (!drive.setUp) return null
  return (
    <main className="page">
      <PageHead title="Saving and sharing" sub="Where your libraries are kept, and how to share them" />
      {NOTES.map(([section, notes]) => (
        <section key={section} className="tips-section">
          <h2>{section}</h2>
          <dl className="tips-list">
            {notes.map(([name, text]) => (
              <div key={text}>
                <dt>{name}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="small">
        <a href="privacy.html" target="_blank" rel="noreferrer">
          How Shrimply Study uses your Google Drive
        </a>
      </p>
    </main>
  )
}
