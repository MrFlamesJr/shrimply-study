import type { ReactNode } from 'react'
import { blankDepth, type Range } from '../logic/cloze'

type Props = {
  text: string
  /** Sorted outer before inner; they only nest, never cross. */
  ranges: Range[]
  /** marks: every blank underlined. gap: blank `index` is empty. reveal: only blank `index` is underlined. */
  mode: 'marks' | 'gap' | 'reveal'
  index?: number
  /** marks only: the blank to tint. */
  highlight?: number | null
}

/** Blank i's underline color, the same in the editor and while studying. */
export const blankColor = (i: number) => `var(--blank-${(i % 4) + 1})`

/** A statement with its blanks shown as stacked colored underlines, one empty gap, or one revealed answer. */
export function ClozeText({ text, ranges, mode, index, highlight }: Props) {
  const depth = blankDepth(ranges)

  // Renders text[from, to) with the ranges from `first` on that start inside it; returns where it stopped.
  const render = (from: number, to: number, first: number): { nodes: ReactNode[]; next: number } => {
    const nodes: ReactNode[] = []
    let pos = from
    let i = first
    while (i < ranges.length && ranges[i].start < to) {
      const r = ranges[i]
      if (r.start > pos) nodes.push(text.slice(pos, r.start))
      const inner = render(r.start, r.end, i + 1)
      const content = inner.nodes
      if (mode === 'marks') {
        nodes.push(
          <span
            key={i}
            className={highlight === i ? 'cloze-mark is-highlighted' : 'cloze-mark'}
            style={{ '--lane': depth[i], '--mark': blankColor(i) } as React.CSSProperties}
          >
            {content}
          </span>,
        )
      } else if (i !== index) {
        nodes.push(<span key={i}>{content}</span>)
      } else if (mode === 'gap') {
        nodes.push(<span key={i} className="cloze-gap" aria-label="blank" style={{ '--mark': blankColor(i) } as React.CSSProperties} />)
      } else {
        nodes.push(
          <mark key={i} className="cloze-reveal" style={{ '--mark': blankColor(i) } as React.CSSProperties}>
            {content}
          </mark>,
        )
      }
      pos = r.end
      i = inner.next
    }
    if (pos < to) nodes.push(text.slice(pos, to))
    return { nodes, next: i }
  }

  return <>{render(0, text.length, 0).nodes}</>
}
