import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { askConfirm } from '../components/ConfirmDialog'
import type { Notify } from '../components/Toasts'
import type { DocId, ItemRef } from '../logic/contentOps'
import { whereLine, whereWithStatus } from '../logic/whereLine'
import type { WorkspaceApi } from '../state/useWorkspace'
import type { DriveFiles } from '../state/useDriveFiles'
import type { Library } from '../model'
import { translateRef } from '../logic/explorerActions'
import { closedEntries, nodeOf, type Peek } from '../logic/explorerTree'
import { Explorer, type ExplorerDoc, type ExplorerDrive } from './Explorer'

const same = (a: ExplorerDoc, b: ExplorerDoc) =>
  a.id === b.id && a.name === b.name && a.dirty === b.dirty && a.where === b.where && a.line === b.line && a.place === b.place && a.readOnly === b.readOnly && a.library === b.library && a.driveId === b.driveId

/** The Explorer fed by the workspace: its open files, clipboard, undo and the tree's open and selected nodes. */
export function ExplorerPane(p: {
  ws: WorkspaceApi
  notify: Notify
  ask: typeof askConfirm
  openNode(node: ItemRef | { kind: 'doc'; doc: DocId }): void
  openNodeNew(node: ItemRef | { kind: 'doc'; doc: DocId }): void
  editNode(ref: ItemRef): void
  reveal: string | null
  onRevealed(): void
  /** The right-click tip: shown until the user has right-clicked once (remembered by the host). */
  tipSeen?: boolean
  onTipSeen?(): void
  /** Upload to Google Drive for a browser library (App opens the dialog). */
  upload(doc: DocId): void
  /** Share for a library (App opens the dialog). */
  share(doc: DocId): void
  /** Downloads a library that is not open as a .shrimp file (App's file storage). */
  downloadLibrary(library: Library, name: string): Promise<void>
  /** Google Drive's libraries, listed once by App. */
  driveFiles: DriveFiles
}): ReactNode {
  const { ws } = p
  const next = ws.docs.map((d): ExplorerDoc => {
    const api = ws.doc(d.id)
    const where = whereLine({ drive: api.drive.file, yours: api.drive.yours, signedIn: api.drive.signedIn(), file: api.fileName })
    return { id: d.id, name: d.name, dirty: d.dirty, where, line: whereWithStatus(where, api.status, d.where), place: d.where, readOnly: d.readOnly, library: api.library, driveId: api.drive.file?.id ?? null }
  })
  // The same array while nothing in it changed: the tree rebuilds when it is a new one.
  const docs = useRef<ExplorerDoc[]>([])
  if (docs.current.length !== next.length || next.some((d, i) => !same(d, docs.current[i]))) docs.current = next

  // Several calls in one event (open the parents, then select) must build on each other, so the latest is kept here
  // until the next render brings it back from the workspace.
  // The Explorer's own state (open nodes, selection): the only place it is read or written, so it can come from elsewhere.
  const state = ws.explorer
  const setState = ws.setExplorer
  const latest = useRef(state)
  latest.current = state
  const expanded = useRef<{ list: string[]; set: Set<string> }>({ list: [], set: new Set() })
  if (expanded.current.list !== state.expanded) expanded.current = { list: state.expanded, set: new Set(state.expanded) }
  const put = (change: Partial<typeof state>) => {
    latest.current = { ...latest.current, ...change }
    setState(latest.current)
  }

  // ---- Closed libraries: a browser library, or a Drive file opened from a link, stay in the tree after closing
  const closed = useMemo(() => closedEntries(ws.closed), [ws.closed])
  const closedNow = useRef(closed)
  closedNow.current = closed

  // ---- Google Drive: the libraries it can see, listed by App (`useDriveFiles`), once for the whole app
  const driveApi = useRef(ws.drive)
  driveApi.current = ws.drive
  const { files, loading, failed, refresh } = p.driveFiles
  const refreshed = useRef(refresh)
  refreshed.current = refresh
  const setUp = ws.drive.setUp
  const signed = setUp && ws.drive.signedIn()
  // This tab lists them again when it opens, as the list itself only does on a change.
  useEffect(() => {
    if (signed && !driveApi.current.canListQuietly()) return
    void refreshed.current()
  }, [])

  // A library opened from the list becomes an open file of the tree: opened, expanded and selected. Opened for an item
  // inside it (as a peek showed it), that item's page opens, and the item is the selected one.
  // `doc`: the workspace's id of a browser library, which has no Drive file.
  const opening = useRef<{ id: string; doc?: string; then?: ItemRef } | null>(null)
  useEffect(() => {
    const want = opening.current
    const doc = want ? docs.current.find((d) => (want.doc ? d.id === want.doc : d.driveId === want.id)) : undefined
    if (!want || !doc) return
    opening.current = null
    const peeked = peeks[want.id]
    const item = want.then && typeof peeked === 'object' ? translateRef(peeked, doc.library, want.then, doc.id) : null
    const node = nodeOf(item ?? { kind: 'doc', doc: doc.id })
    const path = item ? [`d:${doc.id}`, ...(item.kind === 'course' ? [] : [`c:${doc.id}:${item.course}`]), ...(item.kind === 'card' ? [`q:${doc.id}:${item.course}:${item.quiz}`] : [])] : [`d:${doc.id}`]
    put({ expanded: [...new Set([...latest.current.expanded, ...path])], selection: { ids: [node], anchor: node, focus: node } })
    if (item) p.openNode(item)
  })

  // Libraries expanded in the tree while not open: read for a look, never opened. A browser library is read from its
  // record, a Drive file from Drive.
  const [peeks, setPeeks] = useState<Record<string, Peek>>({})
  const reading = useRef(new Set<string>())
  const peek = (id: string) => {
    if (reading.current.has(id) || typeof peeks[id] === 'object') return
    reading.current.add(id)
    setPeeks((all) => ({ ...all, [id]: 'loading' }))
    const entry = closedNow.current.find((c) => c.id === id)
    const version = files?.find((f) => f.id === id)?.modified
    const read = entry?.kind === 'browser' ? ws.readClosed(entry.closedId) : driveApi.current.peek(id, version)
    void read.then((library: Library | null) => {
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

  // A library read to download it (not shown): the one in the tree if it was already looked at.
  const download = async (id: string) => {
    const entry = closedNow.current.find((c) => c.id === id)
    const name = entry?.name ?? files?.find((f) => f.id === id)?.name
    const peeked = peeks[id]
    const library =
      typeof peeked === 'object' ? peeked : entry?.kind === 'browser' ? await ws.readClosed(entry.closedId) : await driveApi.current.peek(id, files?.find((f) => f.id === id)?.modified)
    if (!library || !name) return p.notify('error', "Couldn't read that library.")
    await p.downloadLibrary(library, name)
  }

  const drive: ExplorerDrive = {
    setUp,
    listing: useMemo(
      () => ({ signedIn: signed, loading, failed, files }),
      [signed, loading, failed, files],
    ),
    closed,
    forget: (closedId) => ws.forgetClosed(closedId),
    download: (id) => void download(id),
    signIn: () => void driveApi.current.signIn().then((ok) => (ok ? refreshed.current() : undefined)),
    pick: () => void driveApi.current.pick().then(() => refreshed.current()),
    refresh: () => void refreshed.current(),
    peeks,
    peek,
    open: (id, then) => {
      // A closed library reopens as it was; one of the user's Drive libraries not closed before opens from Drive.
      const entry = closedNow.current.find((c) => c.id === id)
      if (entry) {
        opening.current = { id, doc: entry.kind === 'browser' ? entry.closedId : undefined, then }
        void ws.reopenClosed(entry.closedId)
        return
      }
      opening.current = { id, then }
      void driveApi.current.open(id).then((ok) => {
        if (!ok) opening.current = null
      })
    },
    remove: (file) =>
      void driveApi.current.remove(file).then((ok) => {
        if (!ok) return
        // In the bin it is gone from here too, not left as a closed entry.
        for (const c of ws.closed) if (c.drive?.id === file.id) ws.forgetClosed(c.id)
        refreshed.current()
      }),
  }

  return (
    <Explorer
      docs={docs.current}
      expanded={expanded.current.set}
      onExpanded={(set) => put({ expanded: [...set] })}
      selection={state.selection}
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
      openNew={p.openNodeNew}
      edit={p.editNode}
      libOf={(id) => ws.doc(id)}
      newDoc={() => ws.newDoc()}
      renameDoc={(id, name) => void ws.renameDoc(id, name)}
      openFile={() => void ws.openFile()}
      uploadDoc={p.upload}
      shareDoc={p.share}
      makeCopyDoc={(id) => void ws.doc(id).makeCopy()}
      downloadDoc={(id) => void ws.doc(id).download()}
      closeDoc={(id) => void ws.closeDoc(id)}
      reveal={p.reveal}
      onRevealed={p.onRevealed}
      drive={drive}
      tipSeen={p.tipSeen}
      filter={state.search ?? ''}
      onFilter={(search) => put({ search })}
      scroll={state.scroll}
      onScroll={(scroll) => put({ scroll })}
      onTipSeen={p.onTipSeen}
    />
  )
}
