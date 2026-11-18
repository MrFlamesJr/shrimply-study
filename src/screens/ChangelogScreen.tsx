import { PageHead } from '../components/Page'
import { ReleaseNotes, releaseDate } from '../components/ReleaseNotes'
import { RELEASES } from '../releaseNotes'

/** What's new: every release's notes, the newest first, in a tab of its own (closed like any tab). */
export function ChangelogScreen() {
  return (
    <main className="page">
      <PageHead title="What's new" sub="Every release's notes, the newest first" />
      {RELEASES.map((release) => (
        <section key={release.name} className="tips-section">
          <div className="release-head">
            <h2>{release.name}</h2>
            <time className="muted" dateTime={release.date}>
              {releaseDate(release.date)}
            </time>
          </div>
          <ReleaseNotes notes={release.notes} />
        </section>
      ))}
    </main>
  )
}
