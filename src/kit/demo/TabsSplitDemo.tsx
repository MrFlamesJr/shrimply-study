// Demo of TabStrip, SplitView and DropZones: a made-up editor with tabs in groups, using only the kit.
import { useState } from 'react'
import { TabStrip } from '../TabStrip'
import { DropZones, SplitView } from '../SplitView'
import {
  MAIN, activate, activateGroup, allGroups, closeTabs, emptyLayout, groupOf, join, moveTab, openTab, resize, split,
  type Layout,
} from '../layout'

type Data = { title: string; dirty?: boolean }
const KIND = 'demo-tab'

function start(): Layout<Data> {
  let l = emptyLayout<Data>('g1')
  l = openTab(l, { id: 'alpha', data: { title: 'Alpha' } })
  l = openTab(l, { id: 'beta', data: { title: 'Beta', dirty: true } })
  l = openTab(l, { id: 'gamma', data: { title: 'Gamma' } })
  l = split(l, 'g1', 'row', 'after', 'g2', { id: 'delta', data: { title: 'Delta' } })
  l = openTab(l, { id: 'epsilon', data: { title: 'Epsilon', dirty: true } }, { group: 'g2' })
  l = split(l, 'g2', 'column', 'after', 'g3', { id: 'zeta', data: { title: 'Zeta' } })
  return activate(l, 'alpha')
}

const button = { font: 'inherit', color: 'var(--kit-text)', background: 'var(--kit-surface-2)', border: 'var(--kit-line) solid var(--kit-border)', borderRadius: 'var(--kit-radius)', padding: '2px var(--kit-space-2)', cursor: 'pointer' }

export function TabsSplitDemo() {
  const [layout, setLayout] = useState(start)
  const [counter, setCounter] = useState(1)
  const set = (fn: (l: Layout<Data>) => Layout<Data>) => setLayout(fn)

  const splitActive = (dir: 'row' | 'column') => {
    const n = counter
    setCounter(n + 1)
    set((l) => {
      const g = l.groups[l.activeGroup]
      const tab = g.active ? l.tabs[g.active] : undefined
      return split(l, l.activeGroup, dir, 'after', `n${n}`, tab && g.tabs.length > 1 ? tab : { id: `new${n}`, data: { title: `New ${n}` } })
    })
  }
  const joinNext = () =>
    set((l) => {
      const ids = allGroups(l)
      const i = ids.indexOf(l.activeGroup)
      return ids.length > 1 ? join(l, l.activeGroup, ids[(i + 1) % ids.length]) : l
    })

  const renderGroup = (id: string) => {
    const g = layout.groups[id]
    const canDrop = (p: { kind: string }) => p.kind === KIND
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onPointerDown={() => set((l) => activateGroup(l, id))}>
        <TabStrip
          group={`Group ${id}`}
          tabs={g.tabs.map((t) => ({ id: t, title: layout.tabs[t].data.title, dirty: layout.tabs[t].data.dirty, tooltip: `${layout.tabs[t].data.title} (${t})`, description: t === 'gamma' ? 'a long description' : undefined }))}
          active={g.active}
          focused={layout.activeGroup === id}
          dragKind={KIND}
          onActivate={(t) => set((l) => activate(l, t))}
          onClose={(t) => set((l) => closeTabs(l, [t]))}
          onMove={(t, i) => set((l) => moveTab(l, t, id, i))}
          onDrop={(p, i) => set((l) => p.ids.reduce((acc, t) => (acc.tabs[t] ? moveTab(acc, t, id, i) : acc), l))}
          canDrop={canDrop}
          onContextMenu={(t, at) => console.log('context menu', t, at)}
        />
        <div style={{ flex: 1, minHeight: 0, background: 'var(--kit-surface)', padding: 'var(--kit-space-3)', color: 'var(--kit-text)', overflow: 'auto' }}>
          {g.active ? `Content of ${layout.tabs[g.active].data.title}` : 'No tab open'}
        </div>
        <DropZones
          accept={canDrop}
          onDrop={(p, zone) =>
            set((l) => {
              const t = p.ids[0]
              if (!l.tabs[t]) return l
              if (zone === 'center') return moveTab(l, t, id, l.groups[id].tabs.length)
              if (groupOf(l, t) === id && l.groups[id].tabs.length === 1) return l
              const n = `d${t}-${zone}`
              return split(l, id, zone === 'left' || zone === 'right' ? 'row' : 'column', zone === 'left' || zone === 'top' ? 'before' : 'after', n, l.tabs[t])
            })
          }
        />
      </div>
    )
  }

  return (
    <section style={{ margin: 'var(--kit-space-4) 0' }}>
      <h2>Tabs and splits</h2>
      <div style={{ display: 'flex', gap: 'var(--kit-space-2)', marginBottom: 'var(--kit-space-2)' }}>
        <button style={button} onClick={() => splitActive('row')}>Split right</button>
        <button style={button} onClick={() => splitActive('column')}>Split down</button>
        <button style={button} onClick={joinNext}>Join with next</button>
      </div>
      <div style={{ height: 460, display: 'flex', background: 'var(--kit-ground)' }}>
        <SplitView
          root={layout.windows[MAIN].root}
          renderGroup={renderGroup}
          onResize={(path, sizes) => set((l) => resize(l, MAIN, path, sizes))}
          minSize={{ width: 160, height: 120 }}
        />
      </div>
    </section>
  )
}
