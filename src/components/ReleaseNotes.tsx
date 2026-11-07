/** A release's `date` (YYYY-MM-DD) in the browser's own words, "November 7, 2026". Read as UTC, so it is the
 * same day in every time zone. */
export const releaseDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' })

/** One release's notes (`RELEASES`) as a list of what's new, each name over its text. */
export function ReleaseNotes({ notes }: { notes: [string, string][] }) {
  return (
    <dl className="tips-list">
      {notes.map(([name, text]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  )
}
