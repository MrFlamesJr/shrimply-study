import { useMemo, useState } from 'react'
import { openMenu } from '../ContextMenu'
import { emptySelection, ordered } from '../selection'
import type { Selection } from '../selection'
import { TreeView } from '../TreeView'

// A made-up tree: fruits and vegetables, and a folder of 3000 items to show virtualization.
type Node = { name: string; folder: boolean; kids: string[] }
type Model = Record<string, Node>

const BULK = 3000
const initial = (): Model => {
  const m: Model = {
    root: { name: '', folder: true, kids: ['fruits', 'vegetables', 'bulk'] },
    fruits: { name: 'Fruits', folder: true, kids: ['apple', 'banana', 'cherry', 'citrus'] },
    citrus: { name: 'Citrus', folder: true, kids: ['lemon', 'orange'] },
    vegetables: { name: 'Vegetables', folder: true, kids: ['carrot', 'leek', 'potato'] },
    bulk: { name: 'Bulk (3000 items)', folder: true, kids: [] },
  }
  for (const [id, name] of Object.entries({
    apple: 'Apple', banana: 'Banana', cherry: 'Cherry', lemon: 'Lemon', orange: 'Orange',
    carrot: 'Carrot', leek: 'Leek', potato: 'Potato',
  })) m[id] = { name, folder: false, kids: [] }
  for (let i = 0; i < BULK; i++) {
    m[`n${i}`] = { name: `Item ${i + 1}`, folder: false, kids: [] }
    m.bulk.kids.push(`n${i}`)
  }
  return m
}

const parentOf = (m: Model, id: string) => Object.keys(m).find((k) => m[k].kids.includes(id)) ?? 'root'
const inside = (m: Model, id: string, ancestor: string): boolean =>
  id === ancestor || m[ancestor].kids.some((k) => inside(m, id, k))

let copies = 0

export function MenuTreeDemo() {
  const [model, setModel] = useState(initial)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['fruits']))
  const [selection, setSelection] = useState<Selection>(emptySelection)
  const [filter, setFilter] = useState('')
  const [cut, setCut] = useState<string[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const [sorted, setSorted] = useState(false)

  const source = useMemo(() => ({
    roots: model.root.kids,
    children: (id: string) => model[id]?.kids ?? [],
    label: (id: string) => model[id].name,
  }), [model])

  const move = (ids: string[], target: string | null, pos: 'before' | 'inside' | 'after', copy: boolean) => {
    const next: Model = { ...model }
    const parent = target === null ? 'root' : pos === 'inside' ? target : parentOf(model, target)
    const moved = copy ? ids.map((id) => {
      const id2 = `copy${++copies}`
      next[id2] = { ...model[id], name: `${model[id].name} copy`, kids: [] }
      return id2
    }) : ids
    if (!copy) {
      for (const id of ids) {
        const from = parentOf(next, id)
        next[from] = { ...next[from], kids: next[from].kids.filter((k) => k !== id) }
      }
    }
    const kids = [...next[parent].kids]
    let at = kids.length
    if (target !== null && pos !== 'inside') at = kids.indexOf(target) + (pos === 'after' ? 1 : 0)
    kids.splice(at, 0, ...moved)
    next[parent] = { ...next[parent], kids }
    setModel(next)
    if (parent !== 'root') setExpanded(new Set([...expanded, parent]))
    setLog(`${copy ? 'Copied' : 'Moved'} ${ids.length} into ${parent === 'root' ? 'the top' : model[parent].name}`)
  }

  const remove = (ids: string[]) => {
    const next: Model = { ...model }
    for (const id of ids) {
      const from = parentOf(next, id)
      next[from] = { ...next[from], kids: next[from].kids.filter((k) => k !== id) }
    }
    setModel(next)
    setSelection(emptySelection)
  }

  const menu = (target: string | null, at: { x: number; y: number }) => {
    const ids = target === null ? [] : ordered(selection.ids.includes(target) ? selection : { ids: [target], anchor: target, focus: target }, ['root', ...Object.keys(model)])
    const one = ids.length === 1 ? ids[0] : null
    const folder = one !== null && model[one].folder
    openMenu([
      { label: 'Open', shortcut: 'Enter', onSelect: () => setLog(`Opened ${one ? model[one].name : ids.length + ' items'}`), disabled: ids.length === 0 },
      { label: 'Rename', shortcut: 'F2', disabled: one === null, reason: 'Select one item to rename it', onSelect: () => setRenaming(one) },
      'separator',
      { label: 'Cut', shortcut: 'Ctrl+X', disabled: ids.length === 0, onSelect: () => setCut(ids) },
      { label: 'Paste into folder', disabled: !folder || cut.length === 0, reason: folder ? 'Nothing was cut' : 'Select one folder to paste into',
        onSelect: () => { move(cut, one, 'inside', false); setCut([]) } },
      {
        label: 'New',
        submenu: [
          { label: 'Fruit', onSelect: () => setLog('New fruit') },
          { label: 'Vegetable', onSelect: () => setLog('New vegetable') },
          { label: 'More', submenu: [{ label: 'Nut' }, { label: 'Herb' }] },
        ],
      },
      { label: 'Keep sorted', checked: sorted, onSelect: () => setSorted(!sorted) },
      'separator',
      { label: 'Delete', danger: true, shortcut: 'Delete', disabled: ids.length === 0, onSelect: () => remove(ids) },
    ], at)
  }

  return (
    <section className="kit-demo" aria-label="Menu and tree demo">
      <h2>ContextMenu and TreeView</h2>
      <input
        aria-label="Filter"
        placeholder="Filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div style={{ height: 360, width: 380, marginTop: 8 }}>
        <TreeView
          label="Foods"
          source={source}
          rowHeight={28}
          expanded={expanded}
          onExpanded={setExpanded}
          selection={selection}
          onSelection={setSelection}
          filter={filter}
          description={(id) => (model[id].folder ? `${model[id].kids.length}` : null)}
          dimmed={(id) => cut.includes(id)}
          icon={(id) => <span aria-hidden="true">{model[id].folder ? '▣' : '·'}</span>}
          onActivate={(id) => setLog(`Activated ${model[id].name}`)}
          onContextMenu={menu}
          onKeyDown={(e, focus) => {
            if (e.key === 'F2' && focus !== null) {
              e.preventDefault()
              setRenaming(focus)
              return true
            }
            return false
          }}
          drag={{
            kind: () => 'food',
            allowInside: (id) => model[id].folder,
            rule: (payload, target, pos, effect) => {
              const parent = target === null ? 'root' : pos === 'inside' ? target : parentOf(model, target)
              if (payload.ids.some((id) => inside(model, parent, id))) return { ok: false, reason: "A folder can't go inside itself" }
              if (effect === 'copy' && payload.ids.some((id) => model[id].folder)) return { ok: false, reason: 'Folders can only be moved' }
              return { ok: true }
            },
            onDrop: (payload, target, pos, effect) => move(payload.ids, target, pos, effect === 'copy'),
            label: (payload, effect) => `${effect === 'copy' ? 'Copy' : 'Move'} ${payload.ids.length === 1 ? model[payload.ids[0]].name : payload.ids.length + ' items'}`,
          }}
          rename={{
            id: renaming,
            commit: (id, name) => { setModel({ ...model, [id]: { ...model[id], name: name.trim() } }); setRenaming(null) },
            cancel: () => setRenaming(null),
            check: (_id, name) => (name.trim() === '' ? "A name can't be empty" : null),
          }}
          empty="Nothing matches"
        />
      </div>
      <p aria-live="polite">{log}</p>
    </section>
  )
}
