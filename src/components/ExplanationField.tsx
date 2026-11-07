import type { ComponentProps } from 'react'
import { AutoText } from './AutoText'

type Props = Omit<ComponentProps<typeof AutoText>, 'label' | 'erase'> & {
  /** Closes the field, text and all (an explanation is optional). */
  onRemove: () => void
  /** The eraser's name for screen readers ("Remove explanation 3"). */
  removeLabel: string
}

/**
 * An optional explanation: its box, labelled "Explanation", with an eraser inside it at its end that removes it,
 * shown while the field is pointed at or has focus (AutoText's `erase`). An eraser, like every field that can go
 * (answers, steps); a blank, not a field, goes with a ✕, and an image with a ✕ badge.
 */
export function ExplanationField({ onRemove, removeLabel, ...rest }: Props) {
  return (
    <div className="explanation-field">
      <AutoText label="Explanation" erase={{ label: removeLabel, title: 'Remove explanation', onErase: onRemove }} {...rest} />
    </div>
  )
}
