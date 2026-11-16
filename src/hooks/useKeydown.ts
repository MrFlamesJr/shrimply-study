import { useEffect, useRef } from 'react'
import { appWindows, subscribeWindows } from '../kit/windows'

/** One keydown listener on every app window (popups come and go) for the component's lifetime, always calling the latest `handler`. */
export function useKeydown(handler: (e: KeyboardEvent) => void): void {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => latest.current(e)
    const attached = new Set<Window>()
    const sync = () => {
      const now = appWindows()
      for (const win of attached) {
        if (!now.includes(win)) {
          win.removeEventListener('keydown', onKey)
          attached.delete(win)
        }
      }
      for (const win of now) {
        if (!attached.has(win)) {
          win.addEventListener('keydown', onKey)
          attached.add(win)
        }
      }
    }
    sync()
    const stop = subscribeWindows(sync)
    return () => {
      stop()
      for (const win of attached) win.removeEventListener('keydown', onKey)
    }
  }, [])
}
