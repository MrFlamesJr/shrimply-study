import { useId, type CSSProperties } from 'react'

// `title`: a tooltip, for an option whose label doesn't say enough on its own.
type Option<T> = { value: T; label: string; disabled?: boolean; hint?: string; title?: string }

/**
 * Pick exactly one: equal segments of radio buttons with an indicator that slides to the chosen one.
 * An option's `hint` shows under the bar while it is chosen (describe that value there).
 */
export function Segmented<T extends string | boolean>(props: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const name = useId()
  const index = Math.max(0, props.options.findIndex((o) => o.value === props.value))
  const hasHints = props.options.some((o) => o.hint)
  // --n and --i place the indicator (see .segmented::before).
  const place = { '--n': props.options.length, '--i': index } as CSSProperties
  return (
    // A div, not a fieldset, so a parent grid can line up the label, bar and hint (subgrid).
    <div
      role="radiogroup"
      className="segmented-field"
      aria-labelledby={`${name}-label`}
      aria-describedby={props.options[index]?.hint ? `${name}-hint-${index}` : undefined}
    >
      <span id={`${name}-label`} className="segmented-label">
        {props.label}
      </span>
      <div className="segmented" style={place}>
        {props.options.map((o) => (
          <label key={String(o.value)} title={o.title}>
            <input
              type="radio"
              name={name}
              checked={o.value === props.value}
              disabled={o.disabled}
              onChange={() => props.onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {/* All hints are rendered in one cell and only the chosen one is visible, so switching keeps the height. */}
      {hasHints && (
        <div className="segmented-hints">
          {props.options.map((o, i) => (
            <p key={String(o.value)} id={`${name}-hint-${i}`} className={i === index ? 'segmented-hint is-chosen' : 'segmented-hint'}>
              {o.hint}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
