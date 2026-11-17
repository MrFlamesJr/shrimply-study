import { Modal } from '../../components/Modal'

/** The welcome page's Learn more: what Google Drive adds to cards kept in this browser (autosave, links, view only). */
export function LearnMore({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Save and share with Google Drive" narrow onClose={onClose}>
      <p className="muted">
        Until you sign in, your cards stay in this browser. Signed in with Google, they save to your Google Drive as you
        work.
      </p>
      <dl className="tips-list">
        <div>
          <dt>Saved as you work</dt>
          <dd>
            Sign in with Google and new libraries are made in your Drive. Each change saves by itself a moment later, so
            there is nothing to remember. A library kept only in this browser has Upload to Google Drive on its row.
          </dd>
        </div>
        <div>
          <dt>Study on any device</dt>
          <dd>On your other device, sign in, then select Open under Files and choose the library under Your Google Drive libraries.</dd>
        </div>
        <div>
          <dt>Share a link</dt>
          <dd>
            Share on a library's row gives you a link anyone can open, with no sign-in. They can view and study it but
            not change it, and they always see your latest version. Stop sharing turns the link off.
          </dd>
        </div>
        <div>
          <dt>A library shared with you</dt>
          <dd>You can view and study it, and it stays in sync with the original. To change it, select Make a copy: the copy is yours, in your Drive.</dd>
        </div>
        <div>
          <dt>Signing out</dt>
          <dd>
            Sign out closes your Google Drive libraries in this browser and forgets your account. Libraries kept only in
            this browser stay.
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
