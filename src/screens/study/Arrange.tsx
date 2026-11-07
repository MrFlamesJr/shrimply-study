import { useLayoutEffect, useRef, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { Question } from '../../model'
import { useKeydown } from '../../hooks/useKeydown'
import { rightOrder, sameOrder } from '../../logic/grade'
import { Shortcut } from '../../components/Shortcut'
import { StepList, StepTile } from '../../components/StepList'
import { Mark } from './Answers'
import type { Result } from './Question'

type Props = {
  // A sequence asked as a whole: its shuffled steps are the `choices`, `answers` are the steps in order.
  question: Question
  result: Result | undefined
  paused: boolean
  onRecord: (result: Result) => void
}

/** Put in order: the shuffled steps are the editor's step tiles (StepList), dragged into order, then checked. */
export function Arrange({ question, result, paused, onRecord }: Props) {
  const choices = question.choices!
  const steps = question.answers!
  // The tiles' order, as places in the shuffled choices (a step's text may repeat). An edit of the card (its pencil)
  // that changes how many steps there are starts them over.
  const [moved, setOrder] = useState(() => choices.map((_, i) => i))
  const order = moved.length === choices.length ? moved : choices.map((_, i) => i)
  const placed = order.map((i) => choices[i])
  const checked = result !== undefined

  const check = () => {
    if (checked) return
    onRecord({ ok: sameOrder(placed, steps), given: placed.map((t, i) => `${i + 1}. ${t}`).join(' '), picked: placed })
  }

  // Enter checks, unless it picks up or drops a tile (StepList) or presses a button.
  useKeydown((e) => {
    const target = e.target as HTMLElement
    if (paused || checked || e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return
    if (target.closest('dialog, button, .step-list') || target instanceof HTMLTextAreaElement) return
    e.preventDefault()
    check()
  })

  if (checked) return <OrderCheck placed={placed} steps={steps} />
  return (
    <div className="pick-all">
      <StepList ids={order.map(String)} onMove={(from, to) => setOrder(arrayMove(order, from, to))}>
        {order.map((tile, i) => (
          <StepTile key={tile} id={String(tile)} number={i + 1} whole>
            <span className="step-text">{choices[tile]}</span>
          </StepTile>
        ))}
      </StepList>
      <div className="pick-actions">
        <button type="button" className="primary check-button" onClick={check}>
          Check <Shortcut keys="Enter" />
        </button>
      </div>
    </div>
  )
}

/**
 * A checked order: the order it was put in beside the correct one, and a line from a step to its correct place, level
 * and green when it was there, curving across in red when it was not (an SVG laid over the gap between them, drawn
 * from the tiles' places and drawn again when they change size). One line shows at a time: the one whose step or
 * correct place is pointed at (tapped on touch), or whose step has the focus.
 */
function OrderCheck({ placed, steps }: { placed: string[]; steps: string[] }) {
  // Which placed step comes at each correct place, and where each placed step goes.
  const comes = rightOrder(placed, steps)
  const goes: number[] = []
  comes.forEach((from, to) => (goes[from] = to))
  const key = goes.join()
  const boxRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<string[]>([])
  const [shown, setShown] = useState<number | null>(null)
  const hide = (line: number) => setShown((s) => (s === line ? null : s))
  // A touch leaves as it lifts, so a tapped step keeps its line until another one is tapped.
  const point = (line: number) => ({
    onPointerEnter: () => setShown(line),
    onPointerLeave: (e: { pointerType: string }) => {
      if (e.pointerType !== 'touch') hide(line)
    },
  })

  useLayoutEffect(() => {
    const box = boxRef.current!
    const draw = () => {
      const origin = box.getBoundingClientRect()
      const right = [...box.querySelectorAll('.order-right .entry')]
      // Each line leaves the right edge of a placed step and ends at the left edge of its correct place, a few px clear
      // of both, with an arrowhead.
      const yours = [...box.querySelectorAll('.order-yours .entry')]
      setLines(
        yours.map((el, i) => {
          const a = el.getBoundingClientRect()
          const b = right[Number(key.split(',')[i])].getBoundingClientRect()
          const x1 = a.right - origin.left + 4
          const y1 = a.top + a.height / 2 - origin.top
          const x2 = b.left - origin.left - 4
          const y2 = b.top + b.height / 2 - origin.top
          const mid = (x1 + x2) / 2
          // The arrowhead points the way the line arrives: from the point on the curve a head's length back to its
          // end. The curve's own last tangent is always level, which turns the head off a steep line, through its side.
          const at = (t: number) => {
            const s = 1 - t
            return [s ** 3 * x1 + 3 * s * t * mid + t ** 3 * x2, (s ** 3 + 3 * s * s * t) * y1 + (3 * s * t * t + t ** 3) * y2]
          }
          let [bx, by] = [x2, y2]
          for (let t = 1; t > 0 && Math.hypot(x2 - bx, y2 - by) < 8; t -= 0.01) [bx, by] = at(t)
          const len = Math.hypot(x2 - bx, y2 - by)
          const [ux, uy] = [(x2 - bx) / len, (y2 - by) / len]
          const arm = (side: number) => `${x2 - 6 * ux - side * uy} ${y2 - 6 * uy + side * ux}`
          // The line, then each side of the head out from its tip, in one stroke as a pen would draw them (it draws
          // in; a dash pattern starts over at each M, so a second stroke would show its head first).
          return `M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}L${arm(-5)}L${x2} ${y2}L${arm(5)}`
        }),
      )
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(box)
    return () => observer.disconnect()
  }, [key])

  return (
    <div className="order-check" ref={boxRef}>
      <div className="order-yours">
        <span className="order-head">Your order</span>
        <div className="order-list">
          {placed.map((text, i) => {
            const correct = goes[i] === i
            return (
              <div
                key={i}
                className={`entry is-step ${correct ? 'is-correct' : 'is-wrong'}`}
                tabIndex={0}
                onFocus={() => setShown(i)}
                onBlur={() => hide(i)}
                {...point(i)}
              >
                <span className="entry-number">{i + 1}.</span>
                <span className="step-text">{text}</span>
                <Mark ok={correct} label={correct ? 'Correct place' : `Goes at place ${goes[i] + 1}`} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="order-right">
        <span className="order-head">Correct order</span>
        <div className="order-list">
          {steps.map((text, i) => (
            <div key={i} className="entry is-step" {...point(comes[i])}>
              <span className="entry-number">{i + 1}.</span>
              <span className="step-text">{text}</span>
            </div>
          ))}
        </div>
      </div>
      <svg className="order-lines" aria-hidden="true">
        {lines.map((d, i) => (
          <path key={i} d={d} className={`${goes[i] === i ? 'is-ok' : 'is-bad'}${i === shown ? ' is-shown' : ''}`} />
        ))}
      </svg>
    </div>
  )
}
