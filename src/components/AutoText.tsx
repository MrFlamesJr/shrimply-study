import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react'

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  /** Makes the field single-line: Enter calls this, and pasted line breaks become spaces. */
  onEnter?: () => void
  /** Focuses the box and selects all its text once, when it first appears. */
  selectOnMount?: boolean
  /** With `maxLength`: a live "12/50" counter right after the box, shown while it has focus. */
  counter?: boolean
  /** Says why the text can not be saved (a name that is taken), or undefined when it can. */
  check?: (value: string) => string | undefined
}

/**
 * A text box that starts one line high and grows to fit any amount of text. With `required`, empty or
 * spaces-only text stays in the box and is not passed on; leaving the box shows the saved value again.
 * So does text `check` objects to, with its message under the box.
 */
export function AutoText({ value, onChange, onEnter, selectOnMount, counter, check, onKeyDown, onBlur, className, ...rest }: Props) {
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
  return (
    <>
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
            onEnter()
          }
          onKeyDown?.(e)
        }}
        {...rest}
      />
      {counter && max !== undefined && (
        <span className={text.length >= max ? 'char-count is-full' : 'char-count'}>
          {text.length}/{max}
        </span>
      )}
      {problem && (
        <span className="auto-text-error" role="alert">
          {problem}
        </span>
      )}
    </>
  )
}
