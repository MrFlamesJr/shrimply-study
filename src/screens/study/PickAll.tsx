import { useState } from 'react'
import type { Question } from '../../model'
import { useKeydown } from '../../hooks/useKeydown'
import { samePicks } from '../../logic/grade'
import { Shortcut } from '../../components/Shortcut'
import { Mark } from './Answers'
import type { Result } from './Question'

type Props = {
  // A question with several right `answers` among its `choices`.
  question: Question
  result: Result | undefined
  paused: boolean
  onRecord: (result: Result) => void
}

/** Pick all that are right: toggle options (click or keys 1 to 9), then Check. Right only for exactly the right set. */
export function PickAll({ question, result, paused, onRecord }: Props) {
  const choices = question.choices!
  const right = question.answers!
  const [picks, setPicks] = useState<number[]>([])
  const checked = result !== undefined

  const toggle = (i: number) => {
    if (checked) return
    setPicks((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))
  }

  const check = () => {
    if (checked || picks.length === 0) return
    const given = picks.map((i) => choices[i])
    onRecord({ ok: samePicks(given, right), given: given.join(', '), picked: given })
  }

  useKeydown((e) => {
    const target = e.target as HTMLElement
    if (paused || checked || target.closest('dialog') || e.ctrlKey || e.metaKey || e.altKey) return
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
    if (e.key === 'Enter') {
      // On an option, Enter checks instead of toggling it again. On any other button (Check, the pencil, an image)
      // the click does it.
      if (target.closest('button:not(.choice)')) return
      e.preventDefault()
      check()
    } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= choices.length) {
      toggle(Number(e.key) - 1)
    }
  })

  return (
    <div className="pick-all">
      <div className="choices">
        {choices.map((choice, i) => {
          const picked = picks.includes(i)
          const isRight = right.includes(choice)
          const state = !checked
            ? picked
              ? 'is-picked'
              : ''
            : picked
              ? isRight
                ? 'is-correct'
                : 'is-wrong'
              : isRight
                ? 'is-missed'
                : 'is-dim'
          // The mark and its word carry the meaning, the colors only agree.
          const mark = checked && (picked ? isRight ? 'Picked, right' : 'Picked, wrong' : isRight ? 'Missed' : undefined)
          return (
            <button
              key={i}
              type="button"
              className={`choice ${state}`}
              aria-pressed={picked}
              disabled={checked}
              onClick={() => toggle(i)}
            >
              <span className="choice-key">{i + 1}</span>
              {choice}
              {mark === 'Missed' ? (
                <span className="choice-mark" role="img" aria-label={mark} title={mark}>
                  Missed
                </span>
              ) : (
                mark && <Mark ok={isRight} label={mark} />
              )}
            </button>
          )
        })}
      </div>
      <div className={checked ? 'pick-actions is-done' : 'pick-actions'}>
        <button type="button" className="primary check-button" disabled={checked || picks.length === 0} onClick={check}>
          Check <Shortcut keys="Enter" />
        </button>
      </div>
    </div>
  )
}
