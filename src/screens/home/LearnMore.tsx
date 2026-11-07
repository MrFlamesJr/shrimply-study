import { Modal } from '../../components/Modal'

/** The welcome page's Learn more: what Google Drive adds to cards kept in this browser. */
export function LearnMore({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Save and share with Google Drive" narrow onClose={onClose}>
      <p className="muted">
        Your cards stay in this browser. Save them to your Google Drive to study on any device and share them with a
        link.
      </p>
      <dl className="tips-list">
        <div>
          <dt>Save to your Drive</dt>
          <dd>
            Select Google Drive at the top of the page and sign in with Google. Save to my Drive puts your library
            there, and from then on Save to Drive updates the same file.
          </dd>
        </div>
        <div>
          <dt>Study on any device</dt>
          <dd>On your other device, select Google Drive, sign in, and open the library under Open from Google Drive.</dd>
        </div>
        <div>
          <dt>Share a link</dt>
          <dd>
            Copy link gives you a link anyone can open, with no sign-in. When you save again, the people who
            opened it see Pull new changes in their sidebar, and get your new version when they select it.
          </dd>
        </div>
        <div>
          <dt>Your file stays yours</dt>
          <dd>
            People who open your link can change the cards, but only in their own browser. Your file only changes when
            you save. To keep their changes, they save a copy to their own Drive.
          </dd>
        </div>
        <div>
          <dt>Only its own files</dt>
          <dd>Shrimply Study can see only the files it saved to your Drive, nothing else in it.</dd>
        </div>
      </dl>
      <p className="small">
        <a href="privacy.html" target="_blank" rel="noreferrer">
          How Shrimply Study uses your Google Drive
        </a>
      </p>
    </Modal>
  )
}
