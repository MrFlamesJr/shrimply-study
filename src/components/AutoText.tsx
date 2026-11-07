import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { FloatField } from './FloatField'
import { IconButton } from './IconButton'
import { EraserIcon } from './Icons'

/**
 * Enter is the same in every text box: it goes on to the next box, and Shift+Enter starts a new line.
 * The boxes of one card (in the editor) or one dialog are a group, and the group moves the focus:
 * its onKeyDown checks `goesOn` and focuses `nextBox`, or from the last box does the group's next step
 * (the next card, the dialog's main button). A one-line box (`onEnter`) handles Enter itself.
 */
export const goesOn = (e: KeyboardEvent<HTMLElement>) =>
  e.key === 'Enter' &&
  !e.shiftKey &&
  !e.nativeEvent.isComposing &&
  // A box that already used the key: a one-line box, an answer list adding an answer.
  !e.defaultPrevented &&
  e.target instanceof HTMLTextAreaElement &&
  e.target.classList.contains('auto-text')

/** The text box after `from` in `group` (a card, a dialog), or undefined from the last one. */
export const nextBox = (from: EventTarget, group: Element) => {
  const boxes = [...group.querySelectorAll<HTMLTextAreaElement>('textarea.auto-text:enabled')]
  const at = boxes.indexOf(from as HTMLTextAreaElement)
  return at === -1 ? undefined : boxes[at + 1]
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  /** Makes the field one line (a name, a typed answer): Enter and Shift+Enter call this, and pasted line breaks become spaces. */
  onEnter?: (box: HTMLTextAreaElement) => void
  /** Focuses the box and selects all its text once, when it first appears. */
  selectOnMount?: boolean
  /** With `maxLength`: a live "12/50" counter inside the box at its end, shown while it has focus (its room is always kept). */
  counter?: boolean
  /** A fixed ending inside the box at its end, never part of the text (a file name's ".shrimp"); its room always kept. */
  suffix?: string
  /** Says why the text can not be saved (a name that is taken), or undefined when it can. */
  check?: (value: string) => string | undefined
  /** The field's name as a floating label (FloatField): in the empty box, above it once it has focus or text. Use it instead of a placeholder. */
  label?: ReactNode
  /**
   * A field that can go (an explanation, an answer, a step): an eraser inside the box at its end that removes it,
   * shown while this box is pointed at or has focus (its room is always kept). `label` names it for screen readers.
   * `off` while it can not go for now (a sequence's last two steps, a choice question's last right or wrong answer):
   * no eraser, its room still kept.
   */
  erase?: { label: string; title?: string; onErase: () => void; off?: boolean }
}

/**
 * A text box that starts one line high and grows to fit any amount of text. With `required`, empty or
 * spaces-only text stays in the box and is not passed on; leaving the box shows the saved value again.
 * So does text `check` objects to, with its message under the box.
 */
export function AutoText({ value, onChange, onEnter, selectOnMount, counter, suffix, check, label, erase, onKeyDown, onBlur, className, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Text that is not passed on (blank or checked out), shown until it is fixed or the box is left.
  const [held, setHeld] = useState<string | null>(null)
  const text = held ?? value
  const problem = held === null ? undefined : check?.(held)
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }

  useLayoutEffect(fit, [text])

  useEffect(() => {
    if (!selectOnMount) return
    ref.current?.focus()
    ref.current?.select()
  }, [])

  // A width change (window resize, sidebar toggle) rewraps the text. Refit on the next frame,
  // because resizing inside the observer callback would trigger it again in the same frame.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let width = el.clientWidth
    let frame = 0
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  const max = rest.maxLength
  const count = counter && max !== undefined && (
    <span className={text.length >= max ? 'char-count is-full' : 'char-count'}>
      {text.length}/{max}
    </span>
  )
  const field = (
    <textarea
      ref={ref}
      rows={1}
      className={className ? `auto-text ${className}` : 'auto-text'}
      value={text}
      onChange={(e) => {
        const next = onEnter ? e.target.value.replace(/\s*\n\s*/g, ' ') : e.target.value
        if ((rest.required && !next.trim()) || check?.(next)) return setHeld(next)
        setHeld(null)
        onChange(next)
      }}
      onBlur={(e) => {
        setHeld(null)
        onBlur?.(e)
      }}
      aria-invalid={problem ? true : undefined}
      onKeyDown={(e) => {
        if (onEnter && e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onEnter(e.currentTarget)
        }
        onKeyDown?.(e)
      }}
      {...rest}
    />
  )
  const box = suffix ? (
    // The ending's room is its own length, so a longer one never covers the text.
    <span className="auto-text-wrap has-suffix" style={{ '--suffix-ch': suffix.length } as CSSProperties}>
      {field}
      <span className="auto-text-suffix">{suffix}</span>
    </span>
  ) : count ? (
    <span className="auto-text-wrap">
      {field}
      {count}
    </span>
  ) : (
    field
  )
  const named =
    label === undefined ? (
      box
    ) : (
      <FloatField label={label} filled={text !== ''}>
        {box}
      </FloatField>
    )
  return (
    <>
      {erase ? (
        // The eraser is laid over the box but kept out of the <label>, which may hold no other control.
        <span className="auto-text-erasable">
          {named}
          {!erase.off && (
            <IconButton className="auto-text-erase" label={erase.label} title={erase.title} onClick={erase.onErase}>
              <EraserIcon />
            </IconButton>
          )}
        </span>
      ) : (
        named
      )}
      {problem && (
        <span className="auto-text-error" role="alert">
          {problem}
        </span>
      )}
    </>
  )
}
