import { useId } from 'react'
import { GROUP_COLORS, type GroupColor } from '../model'
import { CheckIcon } from './Icons'

const nameOf = (c: GroupColor) => c[0].toUpperCase() + c.slice(1)

/**
 * A group's color dot. Clicking it pops out the palette to its left (below when there is no room).
 * Arrow keys try colors live; a click or Enter picks and closes, Esc or a click outside closes.
 */
export function ColorPicker({ value, onChange }: { value: GroupColor; onChange: (color: GroupColor) => void }) {
  const id = useId()
  const close = () => document.getElementById(id)?.hidePopover()
  return (
    <>
      <button
        type="button"
        className="color-dot"
        popoverTarget={id}
        aria-label={`Group color: ${nameOf(value)}`}
        title="Change the group color"
      />
      <div
        id={id}
        popover="auto"
        role="radiogroup"
        aria-label="Group color"
        className="palette"
        onToggle={(e) => {
          if (e.newState === 'open') e.currentTarget.querySelector<HTMLInputElement>('input:checked')?.focus()
        }}
      >
        {GROUP_COLORS.map((c) => (
          <label key={c} data-color={c} title={nameOf(c)}>
            <input
              type="radio"
              name={id}
              aria-label={nameOf(c)}
              checked={c === value}
              onChange={() => onChange(c)}
              // detail is 0 when an arrow key checks the radio, so only a real click closes.
              onClick={(e) => e.detail > 0 && close()}
              onKeyDown={(e) => e.key === 'Enter' && close()}
            />
            {c === value && <CheckIcon />}
          </label>
        ))}
      </div>
    </>
  )
}
