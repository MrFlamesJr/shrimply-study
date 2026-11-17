import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { askConfirm } from '../components/ConfirmDialog'
import type { Notify } from '../components/Toasts'
import type { DocId, ItemRef } from '../logic/contentOps'
import { whereLine } from '../logic/whereLine'
import type { DriveFile, WorkspaceApi } from '../state/useWorkspace'
import type { Library } from '../model'
import { translateRef } from '../logic/explorerActions'
import { nodeOf, type Peek } from '../logic/explorerTree'
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
    if (signed && !driveApi.current.canListQuietly()) return
    void refreshed.current()
  }, [key])

  // A library opened from the list becomes an open file of the tree: opened, expanded and selected. Opened for an item
  // inside it (as a peek showed it), that item's page opens, and the item is the selected one.
  const opening = useRef<{ id: string; then?: ItemRef } | null>(null)
  useEffect(() => {
    const want = opening.current
    const doc = want ? docs.current.find((d) => d.driveId === want.id) : undefined
    if (!want || !doc) return
    opening.current = null
    const peeked = peeks[want.id]
    const item = want.then && typeof peeked === 'object' ? translateRef(peeked, doc.library, want.then, doc.id) : null
    const node = nodeOf(item ?? { kind: 'doc', doc: doc.id })
    const path = item ? [`d:${doc.id}`, ...(item.kind === 'course' ? [] : [`c:${doc.id}:${item.course}`]), ...(item.kind === 'card' ? [`q:${doc.id}:${item.course}:${item.quiz}`] : [])] : [`d:${doc.id}`]
    put({ expanded: [...new Set([...latest.current.expanded, ...path])], selection: { ids: [node], anchor: node, focus: node } })
    if (item) p.openNode(item)
  })

  // Libraries expanded in the tree while not open: read for a look, never opened.
  const [peeks, setPeeks] = useState<Record<string, Peek>>({})
  const reading = useRef(new Set<string>())
  const peek = (id: string) => {
    if (reading.current.has(id) || typeof peeks[id] === 'object') return
    reading.current.add(id)
    setPeeks((all) => ({ ...all, [id]: 'loading' }))
    const version = files?.find((f) => f.id === id)?.modified
    void driveApi.current.peek(id, version).then((library: Library | null) => {
      reading.current.delete(id)
      setPeeks((all) => ({ ...all, [id]: library ?? 'failed' }))
    })
  }
  // A library that changed in Drive is read again the next time it is expanded.
  const stamps = useRef(new Map<string, string>())
  useEffect(() => {
    const stale = (files ?? []).filter((f) => stamps.current.has(f.id) && stamps.current.get(f.id) !== f.modified).map((f) => f.id)
    for (const f of files ?? []) stamps.current.set(f.id, f.modified)
    if (stale.length) setPeeks((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !stale.includes(id))))
  }, [files])

  const drive: ExplorerDrive = {
    setUp,
    listing: useMemo(
      () => ({ signedIn: signed, loading, failed, files }),
      [signed, loading, failed, files],
    ),
    signIn: () => void driveApi.current.signIn().then((ok) => (ok ? refreshed.current() : undefined)),
    pick: () => void driveApi.current.pick().then(() => refreshed.current()),
    refresh: () => void refreshed.current(),
    peeks,
    peek,
    open: (id, then) => {
      opening.current = { id, then }
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
