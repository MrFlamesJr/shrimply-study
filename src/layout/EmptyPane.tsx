import { useState, type MouseEvent } from 'react'
import { comboLabel, isMac } from '../kit/shortcuts'
import { href } from '../route'
import { BrowserIcon, CloudIcon, FolderIcon, OpenIcon, PlusIcon, ShrimpIcon } from '../components/Icons'
import { InfoBox } from '../components/InfoBox'
import { ReleaseNotes, releaseDate } from '../components/ReleaseNotes'
import { RELEASES } from '../releaseNotes'
import { Shortcut } from '../components/Shortcut'
import type { DocMeta } from '../state/useWorkspace'
import { elsewhereText } from '../logic/workbenchActions'

type Props = {
  /** The open files: each one's home can open here. */
  docs: DocMeta[]
  onExplorer(): void
  onNewFile(): void
  /** Opens the Open dialog. */
  onOpen(): void
  /** Opens a file's home in this group. */
  onOpenDoc(id: string): void
  /** How many tabs are in popped-out windows: Show them brings the newest window to the front; Dock all. */
  elsewhere: number
  onShowElsewhere(): void
  onDockAll(): void
  /** Opens the What's new tab (`background`: a Ctrl or middle click, without showing it). */
  onWhatsNew(background: boolean): void
}

const WHERE_ICON = { drive: CloudIcon, browser: BrowserIcon }

/**
 * A group with no tab: a calm page in the style of the empty sidebar, a large faded shrimp (a watermark, not text to
 * read), "No tab open" as a quiet title, then what can go here: the Explorer, a new or opened file, and each open
 * file's home; how many tabs are in popped-out windows, with ways to them; then What's new (asked for: here, no
 * longer on home), the newest release's notes in a box that minimizes to its title, with the way to its tab.
 */
export function EmptyPane({ docs, onExplorer, onNewFile, onOpen, onOpenDoc, elsewhere, onShowElsewhere, onDockAll, onWhatsNew }: Props) {
  const mac = isMac(navigator.platform)
  const [notesOpen, setNotesOpen] = useState(true)
  const openNews = (e: MouseEvent, background: boolean) => {
    if (e.shiftKey || e.altKey) return
    e.preventDefault()
    onWhatsNew(background)
  }
  return (
    <div className="wb-empty">
      <div className="wb-empty-mark">
        <ShrimpIcon />
      </div>
      <h2 className="wb-empty-title">No tab open</h2>
      <ul className="wb-empty-actions">
        <li>
          <button type="button" className="link" onClick={onExplorer}>
            <FolderIcon /> <span className="link-text">Show the Explorer</span> <Shortcut keys={comboLabel('Mod+Shift+E', mac)} />
          </button>
        </li>
        <li>
          <button type="button" className="link" onClick={onNewFile}>
            <PlusIcon /> New file
          </button>
        </li>
        <li>
          <button type="button" className="link" onClick={onOpen}>
            <FolderIcon /> Open
          </button>
        </li>
      </ul>
      {elsewhere > 0 && (
        <p className="wb-empty-elsewhere">
          {elsewhereText(elsewhere, true)}
          <button type="button" className="link" onClick={onShowElsewhere}>
            {elsewhere === 1 ? 'Show it' : 'Show them'}
          </button>
          <button type="button" className="link" onClick={onDockAll}>
            Dock all
          </button>
        </p>
      )}
      {docs.length > 0 && (
        <section className="wb-empty-files" aria-label="Open files">
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
        </section>
      )}
      <InfoBox title="What's new" note={`[${RELEASES[0].name}] · ${releaseDate(RELEASES[0].date)}`} open={notesOpen} onToggle={setNotesOpen}>
        <ReleaseNotes notes={RELEASES[0].notes} />
        <p className="all-changes">
          <a
            className="open-link"
            href={href({ name: 'changelog' })}
            title="Every release's notes, in a tab of their own"
            onClick={(e) => openNews(e, e.ctrlKey || e.metaKey)}
            onAuxClick={(e) => e.button === 1 && openNews(e, true)}
          >
            Open What's new <OpenIcon />
          </a>
        </p>
      </InfoBox>
    </div>
  )
}
