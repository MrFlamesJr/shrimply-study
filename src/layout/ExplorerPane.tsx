import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { askConfirm } from '../components/ConfirmDialog'
import type { Notify } from '../components/Toasts'
import type { DocId, ItemRef } from '../logic/contentOps'
import { whereLine } from '../logic/whereLine'
import type { WorkspaceApi } from '../state/useWorkspace'
import { hasFreshToken, type DriveFile } from '../storage/googleDrive'
import { Explorer, type ExplorerDoc, type ExplorerDrive } from './Explorer'

const same = (a: ExplorerDoc, b: ExplorerDoc) =>
  a.id === b.id && a.name === b.name && a.dirty === b.dirty && a.where === b.where && a.library === b.library && a.driveId === b.driveId

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
    return { id: d.id, name: d.name, dirty: d.dirty, where, library: api.library, driveId: api.drive.file?.id ?? null }
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

  // ---- Google Drive: the libraries it can see, listed on mount, on a sign-in change and after open, save, pick or remove
  const driveApi = useRef(ws.drive)
  driveApi.current = ws.drive
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = useRef(0)
  const setUp = ws.drive.setUp
  const signed = setUp && ws.drive.signedIn()
  // Listing asks Google for a token when the hour is up (a popup), which only a click may do: until then, signed out.
  const shownSigned = signed && (hasFreshToken() || files !== null)

  const refresh = async (): Promise<void> => {
    const api = driveApi.current
    if (!api.setUp || !api.signedIn()) {
      run.current++
      setFiles(null)
      setLoading(false)
      return
    }
    const mine = ++run.current
    setLoading(true)
    const list = await api.list()
    if (mine !== run.current) return
    setLoading(false)
    setFailed(list === null)
    if (list !== null) setFiles(list)
  }
  const refreshed = useRef(refresh)
  refreshed.current = refresh
  // Opening, closing, saving (unsaved to saved) or saving under a new file all change this key.
  const key = `${signed}|${docs.current.map((d) => `${d.id}:${d.driveId}:${d.name}:${d.dirty}`).join(',')}`
  useEffect(() => {
    if (signed && !hasFreshToken()) return
    void refreshed.current()
  }, [key])

  // A library opened from the list becomes an open file of the tree: opened, expanded and selected.
  const opening = useRef<string | null>(null)
  useEffect(() => {
    const id = opening.current
    const doc = id === null ? undefined : docs.current.find((d) => d.driveId === id)
    if (!doc) return
    opening.current = null
    const node = `d:${doc.id}`
    put({ expanded: [...new Set([...latest.current.expanded, node])], selection: { ids: [node], anchor: node, focus: node } })
  })

  const drive: ExplorerDrive = {
    setUp,
    listing: useMemo(
      () => ({ signedIn: shownSigned, loading, failed, files }),
      [shownSigned, loading, failed, files],
    ),
    signIn: () => void driveApi.current.signIn().then((ok) => (ok ? refreshed.current() : undefined)),
    pick: () => void driveApi.current.pick().then(() => refreshed.current()),
    refresh: () => void refreshed.current(),
    open: (id) => {
      opening.current = id
      void ws.openDrive(id, true).then((ok) => {
        if (!ok) opening.current = null
      })
    },
    remove: (file) => void driveApi.current.remove(file).then((ok) => (ok ? refreshed.current() : undefined)),
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
      undoLater={ws.undoLater}
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
      drive={drive}
    />
  )
}
