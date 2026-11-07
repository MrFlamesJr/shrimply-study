import type { ButtonHTMLAttributes } from 'react'
import { PlusIcon } from '../../components/Icons'

/** The editor's add button: a small pill with a plus before what it adds (each card kind in AddRow, New group). */
export function AddPill({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="add-pill" {...props}>
      <PlusIcon /> {children}
    </button>
  )
}
