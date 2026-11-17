import { useRef, type ReactNode } from 'react'
import type { askConfirm } from '../components/ConfirmDialog'
import type { Notify } from '../components/Toasts'
import type { DocId, ItemRef } from '../logic/contentOps'
import { whereLine } from '../logic/whereLine'
import type { WorkspaceApi } from '../state/useWorkspace'
import { Explorer, type ExplorerDoc } from './Explorer'

const same = (a: ExplorerDoc, b: ExplorerDoc) =>
  a.id === b.id && a.name === b.name && a.dirty === b.dirty && a.where === b.where && a.library === b.library

/** The Explorer fed by the workspace: its open files, clipboard, undo and the tree's open and selected nodes. */
export function ExplorerPane(p: {
  ws: WorkspaceApi
  notify: Notify
  ask: typeof askConfirm
  openNode(node: ItemRef | { kind: 'doc'; doc: DocId }): void
  editNode(ref: ItemRef): void
  reveal: string | null
  onRevealed(): void
}): ReactNode {
  const { ws } = p
  const next = ws.docs.map((d): ExplorerDoc => {
    const api = ws.doc(d.id)
    const where = whereLine({ hasFile: api.file !== null, drive: api.drive.file, yours: api.drive.yours, signedIn: api.drive.signedIn() })
    return { id: d.id, name: d.name, dirty: d.dirty, where, library: api.library }
  })
  // The same array while nothing in it changed: the tree rebuilds when it is a new one.
  const docs = useRef<ExplorerDoc[]>([])
  if (docs.current.length !== next.length || next.some((d, i) => !same(d, docs.current[i]))) docs.current = next

  // Several calls in one event (open the parents, then select) must build on each other, so the latest is kept here
  // until the next render brings it back from the workspace.
  const latest = useRef(ws.explorer)
  latest.current = ws.explorer
  const expanded = useRef<{ list: string[]; set: Set<string> }>({ list: [], set: new Set() })
  if (expanded.current.list !== ws.explorer.expanded) expanded.current = { list: ws.explorer.expanded, set: new Set(ws.explorer.expanded) }
  const put = (change: Partial<typeof ws.explorer>) => {
    latest.current = { ...latest.current, ...change }
    ws.setExplorer(latest.current)
  }

  return (
    <Explorer
      docs={docs.current}
      expanded={expanded.current.set}
      onExpanded={(set) => put({ expanded: [...set] })}
      selection={ws.explorer.selection}
      onSelection={(selection) => put({ selection })}
      clipboard={ws.clipboard}
      apply={(label, update) => ws.apply(label, update)}
      undo={ws.undo}
      copy={ws.copy}
      cut={ws.cut}
      paste={ws.paste}
      notify={p.notify}
      ask={p.ask}
      open={p.openNode}
      edit={p.editNode}
      newDoc={() => void ws.newDoc()}
      openFile={() => void ws.openFile()}
      saveDoc={(id) => void ws.doc(id).save()}
      downloadDoc={(id) => void ws.doc(id).download()}
      closeDoc={(id) => void ws.closeDoc(id)}
      reveal={p.reveal}
      onRevealed={p.onRevealed}
    />
  )
}
