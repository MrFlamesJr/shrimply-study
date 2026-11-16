// Demo of Popout and windows: one panel with live state, moved into a popup window and back.
import { useEffect, useRef, useState } from 'react'
import { Popout } from '../Popout'
import { openPopup } from '../windows'

function Panel(p: { popped: boolean; count: number; setCount(n: number): void; text: string; setText(s: string): void; onDock(): void }) {
  const box = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [width, setWidth] = useState(0)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const el = box.current!
    const win = el.ownerDocument.defaultView!
    const observer = new win.ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width)))
    observer.observe(el)
    let id = win.requestAnimationFrame(function tick(t) {
      setFrame(Math.round(t / 100) % 20)
      id = win.requestAnimationFrame(tick)
    })
    return () => {
      observer.disconnect()
      win.cancelAnimationFrame(id)
    }
  }, [])

  return (
    <div ref={box} data-testid="panel">
      {p.popped && (
        <div>
          <strong>Popped out</strong> <button type="button" onClick={p.onDock}>Dock</button>
        </div>
      )}
      <button type="button" data-testid="count" onClick={() => p.setCount(p.count + 1)}>Count {p.count}</button>
      <input data-testid="text" value={p.text} onChange={(e) => p.setText(e.target.value)} aria-label="Shared text" />
      <p data-testid="echo">Text: {p.text}</p>
      <button type="button" onClick={() => dialog.current!.showModal()}>Show dialog</button>
      <dialog ref={dialog} data-testid="dialog">
        <p>A modal dialog</p>
        <button type="button" onClick={() => dialog.current!.close()}>Close</button>
      </dialog>
      <button type="button" popoverTarget="kit-demo-pop">Popover</button>
      <div id="kit-demo-pop" popover="auto" data-testid="pop">A popover</div>
      <p data-testid="width">Width {width}px</p>
      <p data-testid="frame" style={{ width: frame * 8 }}>Frame {frame}</p>
    </div>
  )
}

export function PopoutDemo() {
  const [win, setWin] = useState<Window | null>(null)
  const [count, setCount] = useState(0)
  const [text, setText] = useState('')
  const pop = () => {
    const w = openPopup('kit-demo', new URL('popout.html', document.baseURI).href, { width: 420, height: 520, left: 120, top: 120 })
    if (w) setWin(w)
  }
  const shared = { count, setCount, text, setText }
  return (
    <section>
      <h2>Popout</h2>
      {win ? (
        <>
          <p>The panel is in its own window.</p>
          <Popout win={win} title="Kit demo panel" onClosed={() => setWin(null)}>
            <Panel popped onDock={() => setWin(null)} {...shared} />
          </Popout>
        </>
      ) : (
        <>
          <button type="button" onClick={pop}>Pop out</button>
          <Panel popped={false} onDock={() => {}} {...shared} />
        </>
      )}
    </section>
  )
}
