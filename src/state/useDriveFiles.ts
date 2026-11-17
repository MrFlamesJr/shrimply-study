import { useEffect, useRef, useState } from 'react'
import type { DriveFile, WorkspaceApi } from './useWorkspace'

export type DriveFiles = {
  /** The libraries Google Drive lists for this tab's account; null until listed, or when signed out. */
  files: DriveFile[] | null
  loading: boolean
  failed: boolean
  refresh(): Promise<void>
}

/**
 * Google Drive: the libraries it can see, listed on mount, on a sign-in change and after open, save, pick or remove.
 * One list for the whole app (the sidebar counts it, every Explorer tab shows it).
 */
export function useDriveFiles(ws: WorkspaceApi): DriveFiles {
  const driveApi = useRef(ws.drive)
  driveApi.current = ws.drive
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = useRef(0)
  const signed = ws.drive.setUp && ws.drive.signedIn()

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
  const key = `${signed}|${ws.docs.map((d) => `${d.id}:${ws.doc(d.id).drive.file?.id ?? null}:${d.name}:${d.dirty}`).join(',')}`
  useEffect(() => {
    if (signed && !driveApi.current.canListQuietly()) return
    void refreshed.current()
  }, [key])

  // The same function every render, so it can be held in effects and handlers.
  const stable = useRef((): Promise<void> => refreshed.current())
  return { files, loading, failed, refresh: stable.current }
}
