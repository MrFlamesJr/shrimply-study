export type Combo = string // "Mod+S", "Ctrl+Shift+E", "Alt+Shift+ArrowUp", "F2", "Delete"; Mod = Cmd on Mac, Ctrl elsewhere

/** The combo's modifiers (lower case) and its key. */
function parse(combo: Combo): { mods: string[]; key: string } {
  const parts = combo.split('+')
  const key = parts.pop() ?? ''
  return { mods: parts.map((p) => p.toLowerCase()), key }
}

/** Does the key event press this combo? Exact modifiers; letters ignore case. */
export function matches(e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean },
  combo: Combo, mac: boolean): boolean {
  const { mods, key } = parse(combo)
  const has = (m: string) => mods.includes(m)
  const name = (k: string) => (k === ' ' ? 'space' : k.toLowerCase())
  return e.ctrlKey === (has('ctrl') || (has('mod') && !mac)) &&
    e.metaKey === (has('meta') || (has('mod') && mac)) &&
    e.shiftKey === has('shift') && e.altKey === has('alt') && name(e.key) === name(key)
}

const NOT_TEXT = ['button', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'reset', 'submit']

/** Is the target a place to type (text-like input, textarea, select, contenteditable)? No instanceof: it may come from another window. */
export function isEditable(target: EventTarget | null): boolean {
  const t = target as { nodeType?: number; nodeName?: string; type?: string; isContentEditable?: boolean } | null
  if (!t || t.nodeType !== 1) return false
  if (t.isContentEditable) return true
  const name = t.nodeName?.toUpperCase()
  if (name === 'TEXTAREA' || name === 'SELECT') return true
  return name === 'INPUT' && !NOT_TEXT.includes((t.type ?? 'text').toLowerCase())
}

const MAC_SYMBOL: Record<string, string> = {
  mod: '⌘', meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
}

/** The combo as shown: "Ctrl+Shift+E", or "⌘⇧E" on a Mac. */
export function comboLabel(combo: Combo, mac: boolean): string {
  const { mods, key } = parse(combo)
  const k = key.length === 1 ? key.toUpperCase() : key
  if (mac) return [...mods.map((m) => MAC_SYMBOL[m]), MAC_SYMBOL[k] ?? k].join('')
  return [...mods.map((m) => (m === 'mod' ? 'Ctrl' : m[0].toUpperCase() + m.slice(1))), k].join('+')
}

/** Is this `navigator.platform` a Mac (or iOS)? */
export const isMac = (platform: string): boolean => /mac|iphone|ipad|ipod/i.test(platform)
