import { go } from '../route'
import { PageHead } from '../components/Page'
import { ReleaseNotes, releaseDate } from '../components/ReleaseNotes'
import { RELEASES } from '../releaseNotes'

/** Every release's notes, newest first: a page of its own, full screen outside the app shell, with the way back. */
export function ChangelogScreen() {
  return (
    <main className="page changelog">
      <PageHead
        title="All releases"
        sub="What's new in each release, newest first"
        actions={
          <button type="button" className="primary" onClick={() => go({ name: 'home' })}>
            Back to the app
          </button>
        }
      />
      {RELEASES.map((release) => (
        <section key={release.name}>
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
