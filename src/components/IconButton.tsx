import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { label: string }

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
