import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { driveIdFromLink } from '../logic/routes'
import type { DriveFile, WorkspaceApi } from '../state/useWorkspace'
import { AutoText } from './AutoText'
import { IconButton } from './IconButton'
import { CloudIcon, FileIcon, FolderIcon, LinkIcon, OpenIcon, ShrimpIcon, TrashIcon } from './Icons'
import { Modal } from './Modal'
import { Segmented } from './Segmented'

// Search ignores case and accents.
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Open: a pick-one bar over one panel at a time, each a single job. Google Drive (your libraries: search, Open, move to
 * the bin; signed out, the way to sign in), Shared link (the app's share link or a Google Drive file address, which
 * needs no sign-in) and This device (a .shrimp file, or a copy of it). It starts on Google Drive when signed in, else on This device.
 * The panels share one cell of a fixed height, so the dialog never moves between tabs, and only the libraries scroll.
 * The account lives in the sidebar's account box, never here. Anything opened closes the dialog and shows in a tab of
 * its own. `onPick`: Google's file picker, for files the app can't see yet (the host closes this dialog while it
 * shows, then opens it again with the picked files in the list).
 */
export function OpenDialog({ ws, onClose, onPick }: { ws: WorkspaceApi; onClose: () => void; onPick: () => void }) {
  const drive = ws.drive
  const missingId = useId()
  const [signed, setSigned] = useState(drive.signedIn())
  const [tab, setTab] = useState<'drive' | 'link' | 'device'>(drive.setUp && drive.signedIn() ? 'drive' : 'device')
  // The signed-in user's libraries: undefined while they load, null when that failed (the error is a toast).
  const [files, setFiles] = useState<DriveFile[] | null>()
  // The "Shrimply Study" folder in Google Drive, once there is one (opened in a browser tab of its own).
  const [folder, setFolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [link, setLink] = useState('')
  const [linkProblem, setLinkProblem] = useState(false)
  // Something is running: a click meanwhile is ignored. Nothing greys out for it, so no other button flashes.
  const busy = useRef(false)

  // The sign-in script loads now, so a sign-in button opens Google's popup at once.
  useEffect(() => {
    if (drive.setUp) drive.prepare()
  }, [])
  // The folder's link after the list, once that renewed the sign-in if it had to: never a second sign-in at once.
  const load = async () => {
    const list = await drive.list()
    setFiles(list)
    setFolder(list && drive.canListQuietly() ? await drive.folderLink() : null)
  }
  useEffect(() => {
    if (signed) void load()
    else {
      setFiles(undefined)
      setFolder(null)
    }
  }, [signed])

  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return
    busy.current = true
    try {
      await action()
    } finally {
      busy.current = false
    }
  }
  // The dialog is found before acting: the button that asked may be gone by then.
  const opened = (from: HTMLElement, action: () => Promise<boolean>) => {
    const dialog = from.closest('dialog')
    return run(async () => {
      if (await action()) dialog?.close()
    })
  }

  const openLink = (from: HTMLElement) => {
    const id = driveIdFromLink(link)
    if (!id) return setLinkProblem(true)
    return opened(from, () => drive.open(id))
  }

  const shown = (files ?? []).filter((f) => fold(f.name).includes(fold(search.trim())))
  let library: ReactNode
  if (!signed) {
    library = (
      <>
        <p className="muted">Sign in with Google to see your libraries.</p>
        <div className="actions">
          <button type="button" onClick={() => void run(async () => setSigned(await drive.signIn()))}>
            <CloudIcon /> Sign in with Google
          </button>
        </div>
      </>
    )
  } else if (files === undefined) library = <p className="muted">Loading…</p>
  else if (files === null) {
    library = (
      <div className="actions">
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  } else if (files.length === 0) library = <p className="muted">No libraries in your Google Drive yet. New ones you make or upload show here.</p>
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
                  {/* One line each, cut short with its full name on hover, so every row is the same height. */}
                  <span className="drive-file-name">
                    <span title={f.name}>{f.name}</span>
                  </span>
                  <span className="muted drive-file-date">{when(f.modified)}</span>
                </span>
                <button type="button" onClick={(e) => void opened(e.currentTarget, () => drive.open(f.id, true))}>
                  Open
                </button>
                <IconButton
                  label={`Delete ${f.name}`}
                  title="Move to the bin in your Google Drive"
                  onClick={() => void run(async () => (await drive.remove(f)) && setFiles((list) => list?.filter((x) => x.id !== f.id)))}
                >
                  <TrashIcon />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </>
    )
  }

  const panel = (id: typeof tab, children: ReactNode) => (
    <section className={tab === id ? 'open-panel is-chosen' : 'open-panel'} aria-label={id} inert={tab !== id}>
      {children}
    </section>
  )

  return (
    <Modal title="Open a library" narrow onClose={onClose}>
      {drive.setUp && (
        <div className="open-tabs">
          <Segmented
            label="Open from"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'drive', label: 'Google Drive', icon: <CloudIcon /> },
              { value: 'link', label: 'Shared link', icon: <LinkIcon /> },
              { value: 'device', label: 'This device', icon: <FileIcon /> },
            ]}
          />
        </div>
      )}
      <div className="open-panels">
        {drive.setUp &&
          panel(
            'drive',
            <>
              {library}
              <div className="open-panel-foot">
                {signed && folder && (
                  <a className="open-link" href={folder} target="_blank" rel="noreferrer" title="Your Shrimply Study folder in Google Drive">
                    Your Shrimply Study folder
                    <OpenIcon />
                  </a>
                )}
                {signed && (
                  <>
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
                  </>
                )}
                <a href="privacy.html" target="_blank" rel="noreferrer">
                  How Shrimply Study uses your Google Drive
                </a>
              </div>
            </>,
          )}
        {drive.setUp &&
          panel(
            'link',
            <>
              <p className="muted">Paste a link someone shared with you. It opens view only; Make a copy to change it.</p>
              <div className="open-link-row">
                <AutoText
                  label="Link"
                  value={link}
                  onChange={(text) => {
                    setLink(text)
                    setLinkProblem(false)
                  }}
                  onEnter={(box) => void openLink(box)}
                  aria-invalid={linkProblem ? true : undefined}
                />
                <button type="button" className="primary" disabled={!link.trim()} onClick={(e) => void openLink(e.currentTarget)}>
                  Open
                </button>
              </div>
              {linkProblem && (
                <span className="auto-text-error" role="alert">
                  That isn't a Shrimply Study or Google Drive link.
                </span>
              )}
            </>,
          )}
        {panel(
          'device',
          <>
            <p className="muted">
              {ws.savesInPlace
                ? 'Open a .shrimp file from this computer. It stays tied to that file: Save on its row (or Ctrl+S) writes your changes into it.'
                : 'Open a .shrimp file from this computer. This browser opens a copy, kept in this browser; upload it to Google Drive to keep it there.'}
            </p>
            <div className="actions">
              <button type="button" title={ws.openHint} onClick={(e) => void opened(e.currentTarget, async () => !!(await ws.openFile()))}>
                <FolderIcon /> Choose a file
              </button>
            </div>
          </>,
        )}
      </div>
    </Modal>
  )
}
