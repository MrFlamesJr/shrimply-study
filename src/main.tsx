import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme/tokens.css'
import './theme/theme-calm.css'
import './theme/theme-arcade.css'
import './theme/theme-underwater.css'
import './theme/theme-forest.css'
import './theme/theme-unicorn.css'
import './theme/theme-quizlet.css'
import './theme/theme-kahoot.css'
import './theme/base.css'
import './theme/shell.css'
import './theme/files.css'
import './theme/workbench.css'
import './theme/pages.css'
import './theme/dialogs.css'
import './theme/editor.css'
import './theme/study.css'
import './theme/sheet.css'
import './theme/results.css'
import './theme/explorer.css'
import './theme/motion.css'
import './theme/toasts.css'
import './theme/cloze.css'
import './theme/debug.css'
import { App } from './App'
import { loadTheme } from './storage/themePref'
import { POPUP_PREFIX } from './kit/windows'

// A window the app opened as a popup (its opener alive, its name made for one) renders nothing here: it goes to the
// blank popup page, where the opener takes it over. A pasted address (no opener, no such name) boots normally.
const controlled = !!window.opener && !window.opener.closed && window.name.startsWith(POPUP_PREFIX)

if (controlled) {
  window.location.replace(new URL(`popout.html${window.location.hash}`, window.location.href))
} else {
  // Before the first render, so the page never paints in the wrong theme.
  document.documentElement.dataset.theme = loadTheme()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
