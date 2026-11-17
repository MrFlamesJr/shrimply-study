import { useEffect, useRef, useState } from 'react'
import { href } from '../route'
import { fileNameProblem } from '../logic/names'
import type { LibraryApi } from '../state/useWorkspace'
import { AutoText } from './AutoText'
import { askChoice, askConfirm } from './ConfirmDialog'
import { CheckIcon } from './Icons'
import { Modal, closeModal } from './Modal'

const shareUrl = (id: string) => `${location.origin}${location.pathname}${href({ name: 'drive', id })}`
// How long "Copied" shows on the copy button.
const COPIED_MS = 2500
const ENDING = /\.shrimp$/i

/**
 * Share and Upload to Google Drive, one small dialog whose one primary button does the whole job in one click:
 * - your own Drive file: Copy link turns link sharing on and copies the link at once; once shared, the link, Copy link
 *   and a quiet Stop sharing;
 * - a browser library (or signed out): its name and Upload (`mode` 'upload'), or Upload and copy link (`mode` 'share'),
 *   which signs in on the way and asks Replace it / Keep both when your Drive has a library of that name;
 * - someone else's (view only): the link and Copy link, nothing to stop.
 * `lib` is the library's current API: the host passes `ws.doc(id)` on every render, so the dialog follows the library
 * becoming a Drive file. Upload closes the dialog once done.
 */
/**
 * `onRename`: the name typed for a library kept in this browser (the dialog closed without uploading: Keep in this
 * browser, the ✕, Esc or a click outside) renames it all the same (asked for).
 */
export function ShareDialog({ lib, mode, onClose, onRename }: { lib: LibraryApi; mode: 'share' | 'upload'; onClose: () => void; onRename: (name: string) => void }) {
  const drive = lib.drive
  const file = drive.file
  // Something is running: a click meanwhile is ignored, and nothing greys out for it (so no button flashes).
  const busy = useRef(false)
  const shareRef = useRef<HTMLDivElement>(null)
  // The name a new file gets, without its ending (.shrimp is fixed inside the field).
  const [name, setName] = useState(() => lib.name.replace(ENDING, ''))
  const nameProblem = fileNameProblem(name.trim())
  // The last copy of the link: copied, or (the browser refused) selected to copy by hand.
  const [copied, setCopied] = useState<{ id: string; ok: boolean }>()
  // An upload to share is done: the link is copied as soon as the library is its Drive file.
  const [wantLink, setWantLink] = useState(false)

  useEffect(() => {
    drive.prepare()
  }, [])
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

  const copy = async (id: string) => {
    const ok = await navigator.clipboard.writeText(shareUrl(id)).then(
      () => true,
      () => false,
    )
    // The browser refused: the link is selected, to copy by hand.
    if (!ok) shareRef.current?.querySelector('textarea')?.select()
    setCopied({ id, ok })
  }
  // Turns link sharing on first when it isn't on. The link shows once it is, so copying it moves nothing.
  const copyLink = () =>
    run(async () => {
      if (!file || (!file.shared && !(await drive.share()))) return
      await copy(file.id)
    })
  useEffect(() => {
    if (wantLink && file && !lib.readOnly) {
      setWantLink(false)
      void copyLink()
    }
  }, [wantLink, file?.id])

  const upload = (from: HTMLElement) => {
    const dialog = from.closest('dialog')
    return run(async () => {
      const text = name.trim()
      if (!text || nameProblem) return
      if (!drive.signedIn() && !(await drive.signIn())) return
      const taken = await drive.list()
      if (taken === null) return
      const same = taken.find((f) => f.name === `${text}.shrimp`)
      let ok: boolean
      if (same) {
        const choice = await askChoice(
          `Your Google Drive already has a library named "${same.name}".`,
          [
            { label: 'Replace it', value: 'replace' as const, danger: true },
            { label: 'Keep both', value: 'both' as const, primary: true },
          ],
          { title: 'That name is taken' },
        )
        if (choice === null) return
        ok = choice === 'replace' ? await drive.saveOver(same) : await drive.saveNew(text)
      } else {
        ok = await drive.saveNew(text)
      }
      if (!ok) return
      if (mode === 'upload') dialog?.close()
      else setWantLink(true)
    })
  }

  // Closed without uploading: a library still only in this browser takes the name typed for it.
  const close = () => {
    const text = name.trim()
    if (!lib.drive.file && text && !nameProblem && text !== lib.name.replace(ENDING, '')) onRename(text)
    onClose()
  }

  const stopSharing = () =>
    run(async () => {
      if (!(await askConfirm('People with the link will no longer be able to open it.', 'Stop sharing', { title: 'Stop sharing?', danger: true }))) return
      await drive.unshare()
    })

  const title = mode === 'upload' ? 'Upload to Google Drive' : `Share "${lib.name}"`
  if (!drive.setUp) {
    return (
      <Modal title={title} narrow onClose={onClose}>
        <p className="muted">Google Drive isn't set up on this site yet.</p>
      </Modal>
    )
  }

  const copyState = copied && copied.id === file?.id ? (copied.ok ? 'done' : 'select') : 'idle'
  const linkRow = file && (
    <div className="drive-share" ref={shareRef}>
      {/* A field that can't be edited: select it, or move along it to its end; cut off at the edge, no ellipsis, no
          scrollbar. */}
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
        className={`drive-copy primary is-${copyState}`}
        // Its label is the feedback, so a screen reader hears "Copied" too.
        aria-live="polite"
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
  )

  let body
  if (file && lib.readOnly) {
    body = (
      <>
        <p className="muted">Shared with you. Anyone with this link can view it.</p>
        {linkRow}
      </>
    )
  } else if (file && file.trashed) {
    body = <p className="drive-warning">It's in the bin in your Google Drive. Restore it there to share it.</p>
  } else if (file && file.shared) {
    body = (
      <>
        <p className="muted">Anyone with the link can view and study it. They can't change it, and they always see your latest version.</p>
        {linkRow}
        <button type="button" className="link drive-stop" onClick={() => void stopSharing()}>
          Stop sharing
        </button>
      </>
    )
  } else if (file) {
    body = (
      <>
        <p className="muted">Anyone with the link can view and study it. They can't change it, and they always see your latest version.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => void copyLink()}>
            Copy link
          </button>
        </div>
      </>
    )
  } else {
    // Naming is the next step here, so the field takes the focus as it appears.
    const go = (el: HTMLElement) => void upload(el)
    body = (
      <>
        <p className="muted">
          {mode === 'upload'
            ? 'It then saves there as you work, and you can open it on any device.'
            : 'To share it, upload it to your Google Drive.'}
        </p>
        <AutoText
          label="File name"
          suffix=".shrimp"
          maxLength={100}
          value={name}
          onChange={setName}
          onEnter={(box) => go(box)}
          selectOnMount
          aria-invalid={nameProblem ? true : undefined}
        />
        {nameProblem && (
          <span className="auto-text-error" role="alert">
            {nameProblem}
          </span>
        )}
        <div className="actions">
          {mode === 'upload' && (
            <button type="button" title="Don't upload: keep it only in this browser, under this name" onClick={(e) => closeModal(e.currentTarget)}>
              Keep in this browser
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={!name.trim() || !!nameProblem}
            onClick={(e) => go(e.currentTarget)}
          >
            {mode === 'upload' ? 'Upload' : 'Upload and copy link'}
          </button>
        </div>
      </>
    )
  }

  return (
    <Modal title={title} narrow onClose={close}>
      <div className="share-body">{body}</div>
    </Modal>
  )
}
