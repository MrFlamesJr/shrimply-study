import { useEffect, useRef } from 'react'

/** One window keydown listener for the component's lifetime, always calling the latest `handler`. */
export function useKeydown(handler: (e: KeyboardEvent) => void): void {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => latest.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
