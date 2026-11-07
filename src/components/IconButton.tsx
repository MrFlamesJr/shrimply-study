import type { ComponentProps } from 'react'

// Its `ref` reaches the button too (a sequence step's drag grip needs it).
type Props = ComponentProps<'button'> & { label: string }

/** An icon-only button. `label` names it for screen readers and is its tooltip, unless `title` says more. */
export function IconButton({ label, title, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={className ? `icon-btn ${className}` : 'icon-btn'}
      aria-label={label}
      title={title ?? label}
      {...rest}
    />
  )
}
