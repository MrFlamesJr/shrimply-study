import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { go, href } from '../route'
import { fileNameProblem } from '../logic/names'
import type { DriveFile, LibraryApi } from '../state/useLibrary'
import { AutoText } from './AutoText'
import { IconButton } from './IconButton'
import { CheckIcon, InfoIcon, PullIcon, ShrimpIcon, TrashIcon, UploadIcon } from './Icons'
import { Modal } from './Modal'

const shareUrl = (id: string) => `${location.origin}${location.pathname}${href({ name: 'drive', id })}`
// Search ignores case and accents.
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
// How long "Copied" shows on the copy button.
const COPIED_MS = 2500

/** A panel's title row: its icon, its title, and the (i) that opens the long explanation in a popover (asked for). */
function PanelHead({ icon, title, about, children }: { icon: ReactNode; title: string; about: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="drive-panel-head">
      {icon}
      <h3>{title}</h3>
      <IconButton className="drive-info-btn" label={about} popoverTarget={id}>
        <InfoIcon />
      </IconButton>
      <div id={id} popover="auto" className="drive-info">
        {children}
      </div>
    </div>
  )
}

/**
 * Google Drive, in two panels kept apart (asked for): saving this library (its name and where it lives, the name a new
 * file gets, Save, and its share link) and opening one of yours (search, the list, open, move to the bin); then a
 * footer for the Google account. The long explanations wait behind each panel's (i). Who can save to a file is
 * Google's answer, asked after signing in, never a guess. File names show exactly as they are in Drive.
 * `onOpened`: a library was opened from the list (App then leaves the welcome page for the course list).
 */
/** `onPick`: Google's file picker, for files the app can't see yet (App closes this dialog while it shows). */
export function DriveDialog({
  lib,
  onClose,
  onOpened,
  onPick,
}: {
  lib: LibraryApi
  onClose: () => void
  onOpened: () => void
  onPick: () => void
}) {
  const missingId = useId()
  const { drive } = lib
  const file = drive.file
  const [signed, setSigned] = useState(drive.signedIn)
  // Whether the signed-in user can save to `file`, their Drive libraries and their account: undefined while Google
  // is asked, null when that failed (the error is a toast).
  const [mine, setMine] = useState<boolean | null>()
  const [files, setFiles] = useState<DriveFile[] | null>()
  const [account, setAccount] = useState<string | null>()
  // Something is running: a click meanwhile is ignored. Nothing greys out for it, so no other button flashes while a
  // quick action (Copy link) runs (asked for).
  const busy = useRef(false)
  // The new file's name without its ending (.shrimp is fixed, inside the field). No name is suggested.
  const [name, setName] = useState('')
  // Trimmed, as saving trims it: a space typed between two words is never a problem.
  const nameProblem = fileNameProblem(name.trim())
  const [search, setSearch] = useState('')
  // The last copy of the share link, for its file: copied, or (the browser refused) selected to copy by hand.
  const [copied, setCopied] = useState<{ id: string; ok: boolean }>()
  const shareRef = useRef<HTMLDivElement>(null)

  // The sign-in script loads now, so the sign-in button opens Google's popup at once.
  useEffect(() => {
    drive.prepare()
  }, [])

  // Asking again keeps what is shown until the answers come, so nothing jumps; signing out forgets it all, so another
  // account never sees the last one's.
  const load = async () => {
    // The account first: once the sign-in's hour is up, it renews it (one popup) for the other two. Asked all at once,
    // each would open a popup of its own, and a click lets only the first one open.
    const email = await drive.account()
    const [canSave, list] = email === null ? [null, null] : await Promise.all([file ? drive.canSave() : false, drive.list()])
    setMine(canSave)
    setFiles(list)
    setAccount(email)
  }
  // Again once the library is another file (saved as a new one, or opened from the list).
  useEffect(() => {
    if (signed) void load()
    else {
      setMine(undefined)
      setFiles(undefined)
      setAccount(undefined)
    }
  }, [signed, file?.id])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(undefined), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    try {
      await action()
    } finally {
      busy.current = false
    }
  }

  // Shares the file first when it isn't yet. The link is always on show, so copying it moves nothing.
  const copyLink = () =>
    run(async () => {
      if (!file || (!file.shared && !(await drive.share()))) return
      const ok = await navigator.clipboard.writeText(shareUrl(file.id)).then(
        () => true,
        () => false,
      )
      // The browser refused: the link is selected, to copy by hand.
      if (!ok) shareRef.current?.querySelector('textarea')?.select()
      setCopied({ id: file.id, ok })
    })

  if (!drive.setUp) {
    return (
      <Modal title="Google Drive" narrow onClose={onClose}>
        <p className="muted">Google Drive isn't set up on this site yet.</p>
      </Modal>
    )
  }

  const checked = signed && mine !== undefined && files !== undefined
  const failed = signed && (mine === null || files === null)

  // Where this library lives, in a few words (the long version is behind the (i)).
  let where: string
  if (!file) where = 'Only in this browser'
  else if (!checked || failed) where = file.shared ? 'Shared on Google Drive' : 'On Google Drive'
  else if (mine) where = 'In your Google Drive'
  else where = 'Shared with you by someone else'
  const trashedNote = file?.trashed && (drive.yours ? 'In the bin in your Drive: restore it there to keep it' : "In its owner's bin: it may be deleted within 30 days")

  // No link to hand out for a file in the bin: it stops working once the bin deletes it.
  const canCopy = !!file && !file.trashed && (file.shared || !!mine)
  const copyState = copied && copied.id === file?.id ? (copied.ok ? 'done' : 'select') : 'idle'

  let action: ReactNode = <p className="muted">{signed ? 'Checking your Drive…' : 'Sign in below to save.'}</p>
  if (failed) {
    action = (
      <div className="actions">
        <button type="button" className="primary" onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  } else if (checked && file && mine) {
    action = (
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!lib.hasChanges}
          title={lib.hasChanges ? undefined : 'No changes to save'}
          onClick={() => void run(() => drive.save())}
        >
          Save to Drive
        </button>
      </div>
    )
  } else if (checked) {
    // Saved as a new file, it is the user's own: shown at once, not after asking Google again.
    const saveNamed = () => {
      if (name.trim() && !nameProblem) void run(async () => (await drive.saveNew(name.trim())) && setMine(true))
    }
    action = (
      <>
        {/* Naming is the next step here, so the field takes the focus as it appears. */}
        <AutoText
          label="File name"
          suffix=".shrimp"
          maxLength={100}
          value={name}
          onChange={setName}
          // Its own panel's button: the next box in the dialog (the list's search) is another panel's.
          onEnter={saveNamed}
          selectOnMount
          aria-invalid={nameProblem ? true : undefined}
        />
        {nameProblem && (
          <span className="auto-text-error" role="alert">
            {nameProblem}
          </span>
        )}
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={!name.trim() || !!nameProblem}
            onClick={saveNamed}
          >
            {file ? 'Save a copy to my Drive' : 'Save to my Drive'}
          </button>
        </div>
      </>
    )
  }

  const shown = (files ?? []).filter((f) => fold(f.name).includes(fold(search.trim())))
  // The dialog is found before acting: the button that asked may be gone by then (the row turns "Current").
  const open = (f: DriveFile, from: HTMLElement) => {
    const dialog = from.closest('dialog')
    return run(async () => {
      if (!(await drive.open(f.id, true))) return
      onOpened()
      dialog?.close()
      go({ name: 'home' })
    })
  }
  const remove = (f: DriveFile) =>
    run(async () => {
      if (await drive.remove(f)) setFiles((list) => list?.filter((x) => x.id !== f.id))
    })

  let library: ReactNode
  if (!signed) library = <p className="muted">Sign in below to see the libraries you saved.</p>
  else if (files === undefined) library = <p className="muted">Loading…</p>
  else if (files === null) library = null
  else if (files.length === 0) library = <p className="muted">Nothing saved yet. Libraries you save appear here.</p>
  else {
    library = (
      <>
        <AutoText label="Search" value={search} onChange={setSearch} onEnter={() => undefined} />
        {shown.length === 0 ? (
          <p className="muted">No library matches "{search.trim()}".</p>
        ) : (
          <ul className="drive-files">
            {shown.map((f) => (
              <li key={f.id}>
                <span className="drive-file-icon">
                  <ShrimpIcon />
                </span>
                <span className="drive-file-text">
                  {/* The one open here: a small badge by its name, apart from the Open buttons (asked for). */}
                  {/* One line each, cut short with its full name on hover, so every row is the same height. */}
                  <span className="drive-file-name">
                    <span title={f.name}>{f.name}</span>
                    {f.id === file?.id && <span className="drive-badge">Current</span>}
                  </span>
                  <span className="muted drive-file-date">{when(f.modified)}</span>
                </span>
                {f.id === file?.id ? (
                  <span />
                ) : (
                  <button type="button" onClick={(e) => void open(f, e.currentTarget)}>
                    Open
                  </button>
                )}
                <IconButton label={`Delete ${f.name}`} title="Move to the bin in your Google Drive" onClick={() => void remove(f)}>
                  <TrashIcon />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  // The footer bar: the Google account, held at the dialog's bottom edge while the panels scroll.
  const footer = (
    <>
      {signed ? (
        <>
          <p className="drive-account">
            <span className="muted">Signed in as</span> {account || 'your Google account'}
          </p>
          <button
            type="button"
            title="Sign out in this tab. Other tabs keep their own sign-in."
            onClick={() => {
              drive.signOut()
              setSigned(false)
            }}
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <p className="drive-account muted">Sign in to save to your own Drive. Opening a shared link needs no sign-in.</p>
          <button type="button" className="primary" onClick={() => void run(async () => setSigned(await drive.signIn()))}>
            Sign in with Google
          </button>
        </>
      )}
      {/* Always the privacy link: nothing takes its place (asked for). What is running shows as greyed-out buttons,
          and Copy link says Copied in the button itself. */}
      <p className="drive-privacy">
        <a href="privacy.html" target="_blank" rel="noreferrer">
          How Shrimply Study uses your Google Drive
        </a>
      </p>
    </>
  )

  return (
    <Modal title="Google Drive" narrow footer={footer} onClose={onClose}>
      <section className="drive-panel" aria-label="Save to Google Drive">
        <PanelHead icon={<UploadIcon />} title="Save to Google Drive" about="About saving">
          <p>Save to my Drive puts this library in a Shrimply Study folder in your Google Drive. From then on, Save to Drive (or Ctrl+S) saves your changes into that same file.</p>
          <p>If someone shared this library with you, the file stays theirs. Your changes stay in this browser until you save your own copy, and their file never changes.</p>
          <p>Copy link lets anyone with the link open the library, without signing in. When you save again, they can pull your changes from their sidebar.</p>
          <p>A file in the bin still opens by its link until Google deletes it for good, after 30 days.</p>
        </PanelHead>
        {/* This library: the shrimp marks a library file, then its exact name and where it lives. */}
        <div className="drive-current">
          <span className="drive-file-icon">
            <ShrimpIcon />
          </span>
          <span className="drive-current-text">
            {file ? <span className="drive-current-name">{file.name}</span> : <span className="drive-current-name is-none">Not on Google Drive yet</span>}
            <span className="muted">{where}</span>
            {trashedNote && <span className="drive-warning">{trashedNote}</span>}
          </span>
        </div>
        {action}
        {/* The link is always on show, in a row of its own, so copying it never moves anything (asked for). */}
        {canCopy && file && (
          <div className="drive-share" ref={shareRef}>
            {/* A field that can't be edited (asked for): select it, or move along it to its end; cut off at the edge,
                no ellipsis, no scrollbar. */}
            <AutoText
              className="drive-link"
              label="Share link"
              readOnly
              wrap="off"
              value={shareUrl(file.id)}
              onChange={() => undefined}
              onEnter={() => undefined}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className={`drive-copy is-${copyState}`}
              // Its label is the feedback, so a screen reader hears "Copied" too.
              aria-live="polite"
              title="Anyone with the link can open this library"
              onClick={() => void copyLink()}
            >
              {/* All three labels share one cell, so the button keeps its width whichever shows. */}
              <span aria-hidden={copyState !== 'idle'}>Copy link</span>
              <span className="drive-copy-done" aria-hidden={copyState !== 'done'}>
                <CheckIcon /> Copied
              </span>
              <span aria-hidden={copyState !== 'select'}>Press Ctrl+C</span>
            </button>
          </div>
        )}
      </section>

      <section className="drive-panel" aria-label="Open from Google Drive">
        <PanelHead icon={<PullIcon />} title="Open from Google Drive" about="About opening">
          <p>Here are the libraries you saved from Shrimply Study, wherever they are in your Drive. Opening one replaces the courses in this browser. If you have courses, it asks first.</p>
          <p>Shrimply Study can only see the files it saved itself, and the ones you choose under Don't see your file?: Google keeps the rest of your Drive private from it.</p>
          <p>Libraries other people share don't appear here. To open one, open the share link they send you, with no sign-in. When they save again, select Pull changes in the sidebar to get their changes.</p>
        </PanelHead>
        {library}
        {/* For a file the app can't see (uploaded, copied in Drive, sent by someone): a short why, then Google's
            picker, where it is chosen once and from then on appears here (asked for). */}
        <button type="button" className="link drive-missing-btn" popoverTarget={missingId}>
          Don't see your file?
        </button>
        <div id={missingId} popover="auto" className="drive-info drive-missing">
          <p>Shrimply Study only sees the files it saved itself. Google keeps the rest of your Drive private from it.</p>
          <p>A .shrimp file you uploaded, copied in Google Drive or got from someone: choose it once in Google Drive, and it appears here from then on.</p>
          <div className="actions">
            <button type="button" onClick={onPick}>
              Choose files in Google Drive
            </button>
          </div>
        </div>
      </section>
    </Modal>
  )
}
