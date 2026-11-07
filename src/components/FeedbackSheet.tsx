import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  // Right or wrong: the top bar's color and the word Correct or Incorrect. Neutral (flashcards) asks "Did you know it?".
  tone: 'ok' | 'bad' | 'neutral'
  // A line under a wrong answer's word: which other card, blank or step it belongs to, for a pick-all question how
  // many picks were wrong, missed and right, or for a sequence put in order how many steps were out of place and in it.
  note?: ReactNode
  explanation?: string
  actions: ReactNode
  // Going to the next question: it slides out, then calls onLeft once.
  leaving: boolean
  onLeft: () => void
}

// The question's content, which makes room for the panel on wide screens.
const stackOf = (sheet: HTMLElement | null) => sheet?.parentElement?.querySelector<HTMLElement>('.session-stack')

/**
 * The feedback after each answer, in `.session-main`: Correct or Incorrect under a bar of that color, a `note` under a
 * wrong one (where it belongs, or what was wrong, missed and right) and the card's explanation (when it has one), then
 * the actions. It never repeats the answer, which the question already marks. Below 1000px it is a sheet at the bottom
 * (the question column ends above it); wider, a panel from the right (asked for), and once it is in (`is-docked`) the
 * question column makes room beside it (study.css), gliding there from where it was by transform. It moves only by
 * transform, sliding in and out again before the next question. The explanation scrolls on its own and the actions
 * never scroll.
 */
export function FeedbackSheet({ tone, note, explanation, actions, leaving, onLeft }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const left = useRef(false)
  const from = useRef(0)
  const [docked, setDocked] = useState(false)

  // First laid out as the column was (not docked), measured, then docked: the column takes its new place at once and
  // glides to it from the old one. Both before the first paint, so nothing jumps. Below 1000px nothing moves sideways.
  useLayoutEffect(() => {
    from.current = stackOf(sheetRef.current)?.getBoundingClientRect().left ?? 0
    setDocked(true)
  }, [])
  useLayoutEffect(() => {
    const stack = stackOf(sheetRef.current)
    if (!docked || !stack || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const dx = from.current - stack.getBoundingClientRect().left
    if (!dx) return
    const tokens = getComputedStyle(document.documentElement)
    // The build may write the token in seconds (".22s") or ms.
    const token = tokens.getPropertyValue('--dur-slide').trim()
    const duration = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000)
    stack.animate({ transform: [`translateX(${dx}px)`, 'none'] }, { duration, easing: tokens.getPropertyValue('--ease').trim() })
  }, [docked])

  // Slid out (the sheet's own transition, or the slide-in ending after Continue), the next question comes, once.
  const settle = (e: { target: EventTarget; currentTarget: EventTarget }) => {
    if (e.target !== e.currentTarget || !leaving || left.current) return
    left.current = true
    onLeft()
  }

  return (
    <div
      ref={sheetRef}
      className={`sheet is-${tone}${docked ? ' is-docked' : ''}${leaving ? ' is-leaving' : ''}`}
      // Sliding out, its buttons can't be pressed again.
      inert={leaving}
      aria-live="polite"
      onAnimationEnd={settle}
      onTransitionEnd={settle}
    >
      <div className="sheet-head">
        <strong className="sheet-result">{tone === 'ok' ? 'Correct!' : tone === 'bad' ? 'Incorrect!' : 'Did you know it?'}</strong>
        {note && <p className="sheet-note">{note}</p>}
      </div>
      {explanation && (
        <section className="sheet-explain" aria-label="Explanation">
          <h3>Explanation</h3>
          <p className="sheet-text">{explanation}</p>
        </section>
      )}
      <div className="sheet-actions">{actions}</div>
    </div>
  )
}
