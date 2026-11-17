// The top row beside the corner: what belongs to no one file (each file's own actions are on its row in the
// sidebar, and each pane heads its page with its own breadcrumbs). Open file and Google Drive are also beside Files
// in the sidebar; here they stay reachable while it is closed.
type Props = {
  openFile: () => void
  loadLabel: string
  loadHint: string
  onDrive: () => void
}

export function TopBar({ openFile, loadLabel, loadHint, onDrive }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-actions">
        <button type="button" className="load link" title={loadHint} onClick={openFile}>
          {loadLabel}
        </button>
        <button type="button" className="link" title="Save to your Google Drive, share a link, or open your Drive libraries" onClick={onDrive}>
          Google Drive
        </button>
      </div>
    </header>
  )
}
