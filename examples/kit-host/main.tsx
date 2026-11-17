// A notes workspace built only on the kit (../../src/kit): proof that the kit lifts out of Shrimply Study.
import { StrictMode, useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { Confetti } from '../../src/kit/Confetti'
import { openMenu } from '../../src/kit/ContextMenu'
import type { MenuItem } from '../../src/kit/ContextMenu'
import { emptyHistory, record, redo, redoLabel, undo, undoLabel } from '../../src/kit/history'
import type { History } from '../../src/kit/history'
import {
  MAIN, activate, activateGroup, allGroups, closeOthers, closeTabs, dock, emptyLayout, groupOf, moveTab, openTab, popOut, resize, split,
} from '../../src/kit/layout'
import type { Layout } from '../../src/kit/layout'
import { Popout } from '../../src/kit/Popout'
import { emptySelection, ordered, prune } from '../../src/kit/selection'
import type { Selection } from '../../src/kit/selection'
import { isMac, matches } from '../../src/kit/shortcuts'
import { DropZones, SplitView } from '../../src/kit/SplitView'
import { TabStrip } from '../../src/kit/TabStrip'
import { TreeView } from '../../src/kit/TreeView'
import { openPopup } from '../../src/kit/windows'
import './host.css'

type Item = { name: string; folder: boolean; kids: string[]; text: string }
type Model = Record<string, Item>

const KIND = 'note-tab'
const mac = isMac(navigator.platform)

const initial = (): Model => ({
  root: { name: '', folder: true, kids: ['inbox', 'projects', 'todo'], text: '' },
  inbox: { name: 'Inbox', folder: true, kids: ['ideas', 'reading'], text: '' },
  ideas: { name: 'Ideas', folder: false, kids: [], text: 'A list of things to try this week.' },
  reading: { name: 'Reading list', folder: false, kids: [], text: 'Books and articles to get to.' },
  projects: { name: 'Projects', folder: true, kids: ['garden', 'trip'], text: '' },
  garden: { name: 'Garden', folder: false, kids: [], text: 'Plant the beans after the last frost.' },
  trip: { name: 'Trip plan', folder: false, kids: [], text: 'Book the train. Pack light.' },
  todo: { name: 'Todo', folder: false, kids: [], text: '- call the dentist\n- water the plants' },
})

const parentOf = (m: Model, id: string) => Object.keys(m).find((k) => m[k].kids.includes(id)) ?? 'root'
const inside = (m: Model, id: string, ancestor: string): boolean => id === ancestor || m[ancestor].kids.some((k) => inside(m, id, k))
const subtree = (m: Model, id: string): string[] => [id, ...m[id].kids.flatMap((k) => subtree(m, k))]
const without = (m: Model, ids: string[]): Model => {
  const gone = new Set(ids.flatMap((id) => subtree(m, id)))
  const next: Model = {}
  for (const [k, v] of Object.entries(m)) if (!gone.has(k)) next[k] = { ...v, kids: v.kids.filter((c) => !gone.has(c)) }
  return next
}

let counter = 0
let windowCount = 0

function App() {
  const [model, setModel] = useState(initial)
  const [history, setHistory] = useState<History<Model>>(emptyHistory)
  const [layout, setLayout] = useState<Layout<null>>(() => {
    const l = emptyLayout<null>('g1')
    return openTab(l, { id: 'ideas', data: null })
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['inbox']))
  const [selection, setSelection] = useState<Selection>(emptySelection)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [popups, setPopups] = useState<Record<string, Window>>({})
  const [status, setStatus] = useState('Ready')
  const [party, setParty] = useState(0)

  const source = useMemo(
    () => ({ roots: model.root.kids, children: (id: string) => model[id]?.kids ?? [], label: (id: string) => model[id].name }),
    [model],
  )

  // Every change to the notes goes through here, so undo sees it.
  const commit = (label: string, next: Model, key?: string) => {
    setHistory(record(history, { label, before: model, after: next, key, at: Date.now() }))
    setModel(next)
    setLayout((l) => closeTabs(l, Object.keys(l.tabs).filter((t) => !next[t] || next[t].folder)))
    setSelection((s) => prune(s, (id) => id in next))
  }
  const travel = (step: typeof undo) => {
    const r = step(history)
    if (!r) return
    const next = step === undo ? r.entry.before : r.entry.after
    setHistory(r.history)
    setModel(next)
    setLayout((l) => closeTabs(l, Object.keys(l.tabs).filter((t) => !next[t])))
    setSelection((s) => prune(s, (id) => id in next))
    setStatus(`${step === undo ? 'Undid' : 'Redid'} ${r.entry.label}`)
  }

  const create = (folder: boolean, near: string | null) => {
    const parent = near === null ? 'root' : model[near].folder ? near : parentOf(model, near)
    const id = `n${++counter}`
    const next: Model = { ...model, [id]: { name: folder ? 'New folder' : 'Untitled', folder, kids: [], text: '' } }
    next[parent] = { ...next[parent], kids: [...next[parent].kids, id] }
    commit(folder ? 'New folder' : 'New note', next)
    setExpanded(new Set([...expanded, parent]))
    setSelection({ ids: [id], anchor: id, focus: id })
    setRenaming(id)
  }
  const open = (id: string) => {
    if (!model[id].folder) setLayout((l) => openTab(l, { id, data: null }, { group: l.activeGroup }))
  }
  const remove = (ids: string[]) => {
    if (ids.length === 0) return
    commit(ids.length === 1 ? `Delete ${model[ids[0]].name}` : `Delete ${ids.length} items`, without(model, ids))
  }
  const move = (ids: string[], target: string | null, pos: 'before' | 'inside' | 'after') => {
    const parent = target === null ? 'root' : pos === 'inside' ? target : parentOf(model, target)
    const next: Model = {}
    for (const [k, v] of Object.entries(model)) next[k] = { ...v, kids: v.kids.filter((c) => !ids.includes(c)) }
    const kids = [...next[parent].kids]
    let at = kids.length
    if (target !== null && pos !== 'inside') at = kids.indexOf(target) + (pos === 'after' ? 1 : 0)
    kids.splice(at, 0, ...ids)
    next[parent] = { ...next[parent], kids }
    commit(ids.length === 1 ? `Move ${model[ids[0]].name}` : `Move ${ids.length} items`, next)
    if (parent !== 'root') setExpanded(new Set([...expanded, parent]))
  }

  const treeMenu = (target: string | null, at: { x: number; y: number }) => {
    const ids = target === null ? [] : ordered(selection.ids.includes(target) ? selection : { ids: [target], anchor: target, focus: target }, Object.keys(model))
    const one = ids.length === 1 ? ids[0] : null
    openMenu([
      { label: 'New note', onSelect: () => create(false, one) },
      { label: 'New folder', onSelect: () => create(true, one) },
      'separator',
      { label: 'Open', shortcut: 'Enter', disabled: one === null || model[one].folder, reason: 'Select one note', onSelect: () => one && open(one) },
      { label: 'Rename', shortcut: 'F2', disabled: one === null, reason: 'Select one item to rename it', onSelect: () => setRenaming(one) },
      'separator',
      { label: 'Delete', shortcut: 'Delete', danger: true, disabled: ids.length === 0, onSelect: () => remove(ids) },
    ], at)
  }

  const splitGroup = (id: string, dir: 'row' | 'column') =>
    setLayout((l) => {
      const g = l.groups[id]
      const tab = g.active ? l.tabs[g.active] : undefined
      return split(l, id, dir, 'after', `g${++counter}`, tab && g.tabs.length > 1 ? tab : undefined)
    })

  const popGroup = () => {
    const mainGroups = allGroups({ ...layout, windows: { [MAIN]: layout.windows[MAIN] } })
    if (mainGroups.length < 2) {
      setStatus('Split first: a window needs a group of its own')
      return
    }
    const id = `w${++windowCount}`
    const win = openPopup(id, new URL('popout.html', document.baseURI).href, { width: 560, height: 420, left: 140, top: 140 })
    if (!win) {
      setStatus('The browser blocked the window')
      return
    }
    setPopups((p) => ({ ...p, [id]: win }))
    setLayout((l) => popOut(l, l.activeGroup, id))
  }
  const closedWindow = (id: string) => {
    setPopups((p) => {
      const { [id]: _gone, ...rest } = p
      return rest
    })
    setLayout((l) => dock(l, id))
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (matches(e, 'Mod+Z', mac)) travel(undo)
    else if (matches(e, 'Mod+Shift+Z', mac) || matches(e, 'Mod+Y', mac)) travel(redo)
    else if (matches(e, 'Alt+N', mac)) create(false, selection.focus)
    else if (matches(e, 'Alt+\\', mac)) splitGroup(layout.activeGroup, 'row')
    else return
    e.preventDefault()
  }

  const renderGroup = (id: string) => {
    const g = layout.groups[id]
    const canDrop = (p: { kind: string }) => p.kind === KIND
    const tabs = g.tabs.filter((t) => model[t]).map((t) => ({ id: t, title: model[t].name }))
    const active = g.active && model[g.active] ? g.active : null
    return (
      <div className="host-group" onPointerDown={() => setLayout((l) => activateGroup(l, id))}>
        <TabStrip
          group={`Group ${id}`}
          tabs={tabs}
          active={active}
          focused={layout.activeGroup === id}
          dragKind={KIND}
          onActivate={(t) => setLayout((l) => activate(l, t))}
          onClose={(t) => setLayout((l) => closeTabs(l, [t]))}
          onMove={(t, i) => setLayout((l) => moveTab(l, t, id, i))}
          onDrop={(p, i) => setLayout((l) => p.ids.reduce((acc, t) => (acc.tabs[t] ? moveTab(acc, t, id, i) : acc), l))}
          canDrop={canDrop}
          onContextMenu={(t, at) =>
            openMenu([
              { label: 'Close', onSelect: () => setLayout((l) => closeTabs(l, [t])) },
              { label: 'Close others', disabled: g.tabs.length < 2, onSelect: () => setLayout((l) => closeOthers(l, t)) },
              'separator',
              { label: 'Split right', onSelect: () => { setLayout((l) => activate(l, t)); splitGroup(id, 'row') } },
            ] satisfies MenuItem[], at)
          }
        />
        {active ? (
          <textarea
            className="host-note"
            aria-label={`Text of ${model[active].name}`}
            value={model[active].text}
            onChange={(e) => commit(`Edit ${model[active].name}`, { ...model, [active]: { ...model[active], text: e.target.value } }, `text:${active}`)}
          />
        ) : (
          <div className="host-empty">No note open</div>
        )}
        <DropZones
          accept={canDrop}
          onDrop={(p, zone) =>
            setLayout((l) => {
              const t = p.ids[0]
              if (!l.tabs[t]) return l
              if (zone === 'center') return moveTab(l, t, id, l.groups[id].tabs.length)
              if (groupOf(l, t) === id && l.groups[id].tabs.length === 1) return l
              return split(l, id, zone === 'left' || zone === 'right' ? 'row' : 'column', zone === 'left' || zone === 'top' ? 'before' : 'after', `g${++counter}`, l.tabs[t])
            })
          }
        />
      </div>
    )
  }

  const view = (win: string) => (
    <SplitView
      root={layout.windows[win].root}
      renderGroup={renderGroup}
      onResize={(path, sizes) => setLayout((l) => resize(l, win, path, sizes))}
      minSize={{ width: 160, height: 120 }}
    />
  )

  return (
    <div className="host" onKeyDown={onKeyDown}>
      <div className="host-bar">
        <h1>Notes</h1>
        <button onClick={() => travel(undo)} disabled={!undoLabel(history)} title={undoLabel(history) ?? 'Nothing to undo'}>Undo</button>
        <button onClick={() => travel(redo)} disabled={!redoLabel(history)} title={redoLabel(history) ?? 'Nothing to redo'}>Redo</button>
        <button onClick={() => splitGroup(layout.activeGroup, 'row')}>Split right</button>
        <button onClick={() => splitGroup(layout.activeGroup, 'column')}>Split down</button>
        <button onClick={popGroup}>Pop out group</button>
        <span className="grow" />
        <span className="host-status" aria-live="polite">{status}</span>
        <button className="primary" onClick={() => setParty(party + 1)}>Celebrate</button>
      </div>
      <div className="host-main">
        <aside className="host-side">
          <h2>Notes</h2>
          <div className="host-tree">
            <TreeView
              label="Notes"
              source={source}
              rowHeight={28}
              expanded={expanded}
              onExpanded={setExpanded}
              selection={selection}
              onSelection={setSelection}
              icon={(id) => <span aria-hidden="true">{model[id].folder ? '▣' : '·'}</span>}
              onActivate={open}
              onContextMenu={treeMenu}
              onKeyDown={(e, focus) => {
                if (e.key === 'F2' && focus !== null) {
                  setRenaming(focus)
                } else if (e.key === 'Delete' && selection.ids.length > 0) {
                  remove(selection.ids)
                } else return false
                e.preventDefault()
                return true
              }}
              drag={{
                kind: () => 'note',
                allowInside: (id) => model[id].folder,
                rule: (payload, target, pos) => {
                  const parent = target === null ? 'root' : pos === 'inside' ? target : parentOf(model, target)
                  return payload.ids.some((id) => inside(model, parent, id)) ? { ok: false, reason: "A folder can't go inside itself" } : { ok: true }
                },
                onDrop: (payload, target, pos) => move(payload.ids, target, pos),
                label: (payload) => (payload.ids.length === 1 ? `Move ${model[payload.ids[0]].name}` : `Move ${payload.ids.length} items`),
              }}
              rename={{
                id: renaming,
                commit: (id, name) => {
                  commit(`Rename ${model[id].name}`, { ...model, [id]: { ...model[id], name: name.trim() } })
                  setRenaming(null)
                },
                cancel: () => setRenaming(null),
                check: (_id, name) => (name.trim() === '' ? "A name can't be empty" : null),
              }}
              empty="No notes"
            />
          </div>
        </aside>
        <main className="host-work">{view(MAIN)}</main>
      </div>
      {Object.entries(popups).map(([id, win]) => (
        <Popout key={id} win={win} title="Notes" onClosed={() => closedWindow(id)}>
          <div className="host-popup" onKeyDown={onKeyDown}>
            <div className="host-popup-bar">
              <strong>Popped out</strong>
              <button onClick={() => closedWindow(id)}>Dock</button>
            </div>
            <div className="host-popup-body">{layout.windows[id] ? view(id) : null}</div>
          </div>
        </Popout>
      ))}
      {party > 0 && <Confetti key={party} level="done" colors={['#1f5fbf', '#e0a100', '#2f9e6d', '#c2410c', '#7c3aed']} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
