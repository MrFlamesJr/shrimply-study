import { useEffect } from 'react'

/**
 * Spelling squiggles only in the field that has focus, for every text field in the app: the page turns
 * spellcheck off (fields inherit it), and the focused field turns it on until it loses focus. A field
 * that sets its own `spellCheck` (the debug page's JSON) keeps it.
 */
export function useSpellcheckOnFocus(): void {
  useEffect(() => {
    const root = document.documentElement
    root.spellcheck = false
    const field = (e: FocusEvent) => {
      const el = e.target
      return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el : null
    }
    const on = (e: FocusEvent) => {
      const el = field(e)
      if (el && !el.hasAttribute('spellcheck')) el.setAttribute('spellcheck', 'true')
    }
    const off = (e: FocusEvent) => {
      const el = field(e)
      if (el?.getAttribute('spellcheck') === 'true') el.removeAttribute('spellcheck')
    }
    document.addEventListener('focusin', on)
    document.addEventListener('focusout', off)
    return () => {
      document.removeEventListener('focusin', on)
      document.removeEventListener('focusout', off)
      root.removeAttribute('spellcheck')
    }
  }, [])
}
