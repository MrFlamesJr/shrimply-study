import type { ReactNode } from 'react'
import { TrashIcon } from './Icons'

/** A page's title row: the title with a muted line under it, and the page's actions on the right. */
export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}

/** The bottom of a page: a "Danger zone" with what `label` deletes (`detail`) and its button, which asks `question` first. */
export function DangerZone({ label, detail, question, onDelete }: { label: string; detail: string; question: string; onDelete: () => void }) {
  return (
    <div className="page-foot">
      <section className="danger-zone">
        <h2>Danger zone</h2>
        <div className="danger-row">
          <p className="muted">{detail}</p>
          <button type="button" className="danger" onClick={() => confirm(question) && onDelete()}>
            <TrashIcon /> {label}
          </button>
        </div>
      </section>
    </div>
  )
}
