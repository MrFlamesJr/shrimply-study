import type { ReactNode } from 'react'

/**
 * A field with its name as a floating label: inside the empty box like a placeholder, then up above the box,
 * smaller, once it has focus or text, so the name never shows twice; a bracket then draws out of the name, round the
 * field's top left corner and down its side to halfway, ending in a dash (`.float-tail`; the top and side are this
 * label's own pseudo-elements, see base.css). `children` is the field (a textarea, or a box holding one). It is a <label>, so a
 * click on the name focuses the field and the name labels it.
 */
export function FloatField({ label, filled, children }: { label: ReactNode; filled: boolean; children: ReactNode }) {
  return (
    <label className={filled ? 'float-field is-filled' : 'float-field'}>
      {children}
      <span className="float-tail" aria-hidden="true" />
      <span className="float-label">
        <span className="float-text">{label}</span>
      </span>
    </label>
  )
}
