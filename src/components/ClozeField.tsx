import { useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { blankDepth, markBlank, readCloze, shiftBlanks, writeCloze, type Blank } from '../logic/cloze'
import { AutoText } from './AutoText'
import { blankColor, ClozeText } from './ClozeText'
import { IconButton } from './IconButton'
import { CrossIcon, PlusIcon } from './Icons'
import { ImageSlot } from './ImageSlot'
import { Shortcut } from './Shortcut'

type Props = Omit<ComponentProps<typeof AutoText>, 'value' | 'onChange' | 'onKeyDown'> & {
  statement: string
  explanation: (string | null)[]
  onChange: (statement: string, explanation: (string | null)[]) => void
  /** Shown right above the statement box (its label, or what is missing). */
  hint?: ReactNode
  /** The card's image, beside the statement box. */
  image: Omit<ComponentProps<typeof ImageSlot>, 'children'>
}

/** The fill-in-the-blank editor: the statement with colored underlines, a way to mark blanks, and an explanation per blank. */
export function ClozeField({ statement, explanation, onChange, hint, image, ...rest }: Props) {
  const { text, blanks } = readCloze(statement, explanation)
  const wrap = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [error, setError] = useState('')
  // The blank whose explanation was just opened with + Explanation, so its new field takes the focus.
  const [opened, setOpened] = useState<number | null>(null)
  const lanes = Math.max(0, ...blankDepth(blanks)) + 1

  const write = (nextText: string, nextBlanks: Blank[]) => {
    const written = writeCloze(nextText, nextBlanks)
    onChange(written.statement, written.explanation)
  }

  const mark = () => {
    const area = wrap.current?.querySelector('textarea')
    if (!area) return
    const result = markBlank(text, blanks, area.selectionStart, area.selectionEnd)
    if (typeof result === 'string') {
      setError(result)
      return
    }
    setError('')
    write(text, result)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault()
      mark()
    }
  }

  const setExplanation = (i: number, value: string | null) =>
    write(text, blanks.map((b, j) => (j === i ? { ...b, explanation: value } : b)))

  const remove = (i: number) => {
    setHovered(null)
    write(text, blanks.filter((_, j) => j !== i))
  }

  return (
    <div className="cloze-field">
      <div className="cloze-statement">
        {hint}
        <ImageSlot {...image}>
          <div ref={wrap} className="cloze-box" style={{ '--lanes': lanes } as React.CSSProperties}>
            <AutoText
              {...rest}
              value={text}
              onChange={(value) => {
                setError('')
                write(value, shiftBlanks(text, value, blanks))
              }}
              onKeyDown={onKeyDown}
            />
            <div className="cloze-overlay" aria-hidden="true">
              <ClozeText text={text} ranges={blanks} mode="marks" highlight={hovered} />
            </div>
          </div>
        </ImageSlot>
      </div>
      <div className="cloze-tools">
        <button type="button" title="Turn the selected text into a blank" onClick={mark}>
          Mark as blank <Shortcut keys="Ctrl+B" />
        </button>
        {error && (
          <span className="field-hint is-bad" role="status">
            {error}
          </span>
        )}
      </div>
      {blanks.length > 0 && (
        <ul className="cloze-blanks">
          {blanks.map((b, i) => (
            <li
              key={i}
              style={{ '--mark': blankColor(i) } as React.CSSProperties}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
            >
              <span className="cloze-swatch" aria-hidden="true" />
              <span className="cloze-blank-text">{text.slice(b.start, b.end)}</span>
              {b.explanation === null && (
                <button
                  type="button"
                  className="quiet small"
                  onClick={() => {
                    setOpened(i)
                    setExplanation(i, '')
                  }}
                >
                  <PlusIcon /> Explanation
                </button>
              )}
              <IconButton label={`Remove blank ${i + 1}`} title="Remove blank" onClick={() => remove(i)}>
                <CrossIcon />
              </IconButton>
              {b.explanation !== null && (
                <AutoText
                  aria-label={`Explanation for blank ${i + 1}`}
                  placeholder="Explanation"
                  autoFocus={opened === i}
                  value={b.explanation}
                  onChange={(value) => setExplanation(i, value)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
