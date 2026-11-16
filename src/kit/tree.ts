export type TreeSource = { roots: string[]; children(id: string): string[]; label(id: string): string }
export type Row = {
  id: string; depth: number; parent: string | null; expandable: boolean; expanded: boolean
  posInSet: number; setSize: number; match: [number, number] | null
}

/** Lower case without Latin accents, with where each folded character came from in the original. */
function fold(text: string): { text: string; from: number[] } {
  let out = ''
  const from: number[] = []
  for (let i = 0; i < text.length; i++) {
    const piece = text[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    out += piece
    for (let k = 0; k < piece.length; k++) from.push(i)
  }
  return { text: out, from }
}

const plain = (text: string) => fold(text).text

/** The tree as visible rows. A filter (ignoring case and accents) keeps matches and their ancestors, shown expanded. */
export function flatten(src: TreeSource, expanded: ReadonlySet<string>, filter?: string): Row[] {
  const needle = filter ? plain(filter) : ''
  const range = (id: string): [number, number] | null => {
    if (!needle) return null
    const label = src.label(id)
    const f = fold(label)
    const at = f.text.indexOf(needle)
    return at < 0 ? null : [f.from[at], f.from[at + needle.length - 1] + 1]
  }
  const seen = new Map<string, boolean>()
  const shown = (id: string): boolean => {
    let r = seen.get(id)
    if (r === undefined) (r = range(id) !== null || src.children(id).some(shown), seen.set(id, r))
    return r
  }
  const rows: Row[] = []
  const walk = (ids: string[], depth: number, parent: string | null) => {
    const set = needle ? ids.filter(shown) : ids
    set.forEach((id, i) => {
      const kids = needle ? src.children(id).filter(shown) : src.children(id)
      const open = kids.length > 0 && (needle ? true : expanded.has(id))
      rows.push({
        id, depth, parent, expandable: kids.length > 0, expanded: open,
        posInSet: i + 1, setSize: set.length, match: range(id),
      })
      if (open) walk(kids, depth + 1, id)
    })
  }
  walk(src.roots, 0, null)
  return rows
}

export type Nav = { focus?: string; expand?: string; collapse?: string; activate?: string }

/** What a key does in the tree (WAI-ARIA tree pattern); null for any other key. */
export function keyNav(rows: Row[], focus: string | null, key: string, pageSize = 10): Nav | null {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'ArrowRight', 'ArrowLeft', 'Enter']
  if (!keys.includes(key) || rows.length === 0) return null
  const at = rows.findIndex((r) => r.id === focus)
  const to = (i: number): Nav => ({ focus: rows[Math.min(Math.max(i, 0), rows.length - 1)].id })
  const row = rows[at]
  switch (key) {
    case 'ArrowDown': return to(at + 1)
    case 'ArrowUp': return to(at < 0 ? 0 : at - 1)
    case 'Home': return to(0)
    case 'End': return to(rows.length - 1)
    case 'PageDown': return to(at + pageSize)
    case 'PageUp': return to(at < 0 ? 0 : at - pageSize)
  }
  if (!row) return to(0)
  if (key === 'Enter') return { activate: row.id }
  if (key === 'ArrowRight') {
    if (!row.expandable) return {}
    return row.expanded ? { focus: rows[at + 1].id } : { expand: row.id }
  }
  if (row.expandable && row.expanded) return { collapse: row.id }
  return row.parent !== null ? { focus: row.parent } : {}
}

/** The ancestors of `id`, root first, not including it; null when it is not in the tree. */
export function pathTo(src: TreeSource, id: string): string[] | null {
  const find = (ids: string[], trail: string[]): string[] | null => {
    for (const x of ids) {
      if (x === id) return trail
      const found = find(src.children(x), [...trail, x])
      if (found) return found
    }
    return null
  }
  return find(src.roots, [])
}

/** The next row (after `from`, wrapping) whose label starts with the typed text, ignoring case and accents. */
export function typeahead(rows: Row[], from: string | null, text: string, label: (id: string) => string): string | null {
  const needle = plain(text)
  if (!needle || rows.length === 0) return null
  const at = rows.findIndex((r) => r.id === from)
  const start = at < 0 ? 0 : text.length === 1 ? at + 1 : at
  for (let k = 0; k < rows.length; k++) {
    const row = rows[(start + k) % rows.length]
    if (plain(label(row.id)).startsWith(needle)) return row.id
  }
  return null
}
