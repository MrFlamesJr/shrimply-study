import { THEMES, type ThemeId } from '../model'

type Props = { theme: ThemeId; setTheme: (theme: ThemeId) => void; title?: string }

/** The theme dropdown: the sidebar's, under "+ New course" (labelled), and the debug bar's (a `title` instead). */
export function ThemeSelect({ theme, setTheme, title }: Props) {
  return (
    <select aria-label="Theme" title={title} value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
