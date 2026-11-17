import type { LibraryApi } from '../state/useWorkspace'
import { CopyIcon } from './Icons'

/** Under a page's title in a file shared with you to view: that it is view only, and Make a copy to edit your own. */
export function ViewOnlyNote({ lib }: { lib: LibraryApi }) {
  if (!lib.readOnly) return null
  return (
    <div className="view-only">
      <p className="muted small">View only: shared with you, kept in sync with Google Drive</p>
      <button type="button" onClick={() => void lib.makeCopy()} title="Open your own copy of this file, which you can edit">
        <CopyIcon /> Make a copy
      </button>
    </div>
  )
}
