import { comboLabel, isMac } from '../kit/shortcuts'
import { BrowserIcon, CloudIcon, FileIcon, FolderIcon, PlusIcon, ShrimpIcon } from '../components/Icons'
import { Shortcut } from '../components/Shortcut'
import type { DocMeta } from '../state/useWorkspace'

type Props = {
  /** The open files: each one's home can open here. */
  docs: DocMeta[]
  onExplorer(): void
  onNewFile(): void
  onOpenFile(): void
  /** Opens a file's home in this group. */
  onOpenDoc(id: string): void
}

const WHERE_ICON = { drive: CloudIcon, device: FileIcon, browser: BrowserIcon }

/**
 * A group with no tab: a calm page in the style of the empty sidebar, a large faded shrimp (a watermark, not text to
 * read), "No tab open" as a quiet title, then what can go here: the Explorer, a new or opened file, and each open
 * file's home.
 */
export function EmptyPane({ docs, onExplorer, onNewFile, onOpenFile, onOpenDoc }: Props) {
  const mac = isMac(navigator.platform)
  return (
    <div className="wb-empty">
      <div className="wb-empty-mark">
        <ShrimpIcon />
      </div>
      <h2 className="wb-empty-title">No tab open</h2>
      <ul className="wb-empty-actions">
        <li>
          <button type="button" className="link" onClick={onExplorer}>
            <FolderIcon /> Show the Explorer <Shortcut keys={comboLabel('Mod+Shift+E', mac)} />
          </button>
        </li>
        <li>
          <button type="button" className="link" onClick={onNewFile}>
            <PlusIcon /> New file
          </button>
        </li>
        <li>
          <button type="button" className="link" onClick={onOpenFile}>
            <FileIcon /> Open file
          </button>
        </li>
      </ul>
      {docs.length > 0 && (
        <>
          <p className="wb-empty-label">Open files</p>
          <ul className="wb-empty-actions">
            {docs.map((d) => {
              const Icon = WHERE_ICON[d.where]
              return (
                <li key={d.id}>
                  <button type="button" className="link" title={`Show ${d.name} here`} onClick={() => onOpenDoc(d.id)}>
                    <Icon /> <span className="wb-empty-name">{d.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
