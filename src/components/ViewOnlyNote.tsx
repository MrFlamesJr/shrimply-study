import type { LibraryApi } from '../state/useWorkspace'
import { CopyIcon, DriveIcon, SaveIcon } from './Icons'

/**
 * Under a page's title, one quiet line about where the library lives when that needs saying: in a file shared with you
 * to view, that it is view only, and Make a copy to edit your own; in a library kept only in this browser, that it can
 * be lost (asked for), with its ways off this browser: Upload to Google Drive, and Save to a file where the browser can
 * keep one (Chrome, Edge). Its buttons are secondary: the page's gold button stays its one action.
 */
export function ViewOnlyNote({ lib }: { lib: LibraryApi }) {
  if (lib.readOnly) {
    return (
      <div className="view-only">
        <p className="muted small">View only: shared with you, kept in sync with Google Drive</p>
        <button type="button" onClick={() => void lib.makeCopy()} title="Open your own copy of this file, which you can edit">
          <CopyIcon /> Make a copy
        </button>
      </div>
    )
  }
  if (lib.where !== 'browser') return null
  return (
    <div className="view-only is-browser">
      <p className="small">Only in this browser: clearing its data loses it, and your other devices can't see it</p>
      {lib.drive.setUp && (
        <button type="button" onClick={() => void lib.upload()} title="Save it to your Google Drive, where it saves by itself as you work">
          <DriveIcon /> Upload to Google Drive
        </button>
      )}
      {lib.canSaveToFile && (
        <button type="button" onClick={() => void lib.saveToFile()} title="Save it as a .shrimp file on this device, which Save then writes into">
          <SaveIcon /> Save to a file
        </button>
      )}
    </div>
  )
}
