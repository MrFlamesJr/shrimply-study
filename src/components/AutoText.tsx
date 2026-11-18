import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { FloatField } from './FloatField'
import { IconButton } from './IconButton'
import { ownWindow } from './ownWindow'
import { EraserIcon } from './Icons'
import { useFloatBelow } from '../kit/float'

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
  (e.target as Element).nodeName === 'TEXTAREA' &&
  (e.target as Element).classList.contains('auto-text')

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
  /**
   * Shows `check`'s reason in a small popup under the box, in the top layer, instead of a line under it: for a box in
   * a narrow scrolling column (a library's name in the sidebar), which would cut a line off at its edge.
   */
  popError?: boolean
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

const FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

const waiting = new Map<Window, Set<HTMLTextAreaElement>>()
/** Fits a box to its text in its window's next frame, together with every other box waiting in that frame. */
function queueFit(el: HTMLTextAreaElement) {
  const view = ownWindow(el)
  let boxes = waiting.get(view)
  if (!boxes) {
    boxes = new Set()
    waiting.set(view, boxes)
    const batch = boxes
    view.requestAnimationFrame(() => {
      waiting.delete(view)
      const live = [...batch].filter((box) => box.isConnected)
      for (const box of live) box.style.height = 'auto'
      const heights = live.map((box) => box.scrollHeight + box.offsetHeight - box.clientHeight)
      live.forEach((box, i) => (box.style.height = `${heights[i]}px`))
    })
  }
  boxes.add(el)
}

/**
 * A text box that starts one line high and grows to fit any amount of text. With `required`, empty or
 * spaces-only text stays in the box and is not passed on; leaving the box shows the saved value again.
 * So does text `check` objects to, with its message under the box.
 */
export function AutoText({ value, onChange, onEnter, selectOnMount, counter, suffix, check, popError, label, erase, onKeyDown, onBlur, className, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const errorRef = useRef<HTMLSpanElement>(null)
  // Text that is not passed on (blank or checked out), shown until it is fixed or the box is left.
  const [held, setHeld] = useState<string | null>(null)
  const text = held ?? value
  const problem = held === null ? undefined : check?.(held)
  useFloatBelow(errorRef, ref, !!(popError && problem))
  const fit = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }

  // Where the browser can size a box to its text (CSS `field-sizing`), CSS does it. Elsewhere a box fits itself on
  // an edit at once, but when it appears or its width changes it joins the frame's batch (one write pass, one read
  // pass, one write pass), so a page of hundreds of boxes never lays out once per box.
  const mounted = useRef(false)
  useLayoutEffect(() => {
    if (FIELD_SIZING) return
    if (mounted.current) fit()
    else if (ref.current) {
      mounted.current = true
      queueFit(ref.current)
    }
  }, [text])

  useEffect(() => {
    if (!selectOnMount) return
    ref.current?.focus()
    ref.current?.select()
  }, [])

  // A width change (window resize, sidebar toggle) rewraps the text. Refit on the next frame,
  // because resizing inside the observer callback would trigger it again in the same frame.
  useEffect(() => {
    const el = ref.current
    if (!el || FIELD_SIZING) return
    const view = ownWindow(el)
    let width = el.clientWidth
    const observer = new view.ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      queueFit(el)
    })
    observer.observe(el)
    return () => observer.disconnect()
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
      {problem &&
        (popError ? (
          <span ref={errorRef} popover="manual" className="auto-text-error is-popped" role="alert">
            {problem}
          </span>
        ) : (
          <span className="auto-text-error" role="alert">
            {problem}
          </span>
        ))}
    </>
  )
}
