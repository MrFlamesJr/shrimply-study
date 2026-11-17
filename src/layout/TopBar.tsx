import { href, type Route } from '../route'
import type { Course, Quiz } from '../model'
import type { LibraryApi } from '../state/useWorkspace'

type Crumb = { label: string; to?: Route }

function crumbsFor(page: Route['name'], course?: Course, quiz?: Quiz): Crumb[] {
  if (page === 'debug') return [{ label: 'Debug' }]
  if (!course) return []
  if (page === 'course') return [{ label: course.name }]
  if (!quiz) return []
  const up: Crumb = { label: course.name, to: { name: 'course', course: course.name } }
  return page === 'quiz'
    ? [up, { label: quiz.name }]
    : [up, { label: quiz.name, to: { name: 'quiz', course: course.name, quiz: quiz.name } }, { label: 'Edit' }]
}

// `lib`: the active file, which Download and Save to Drive act on (null when none is open: then only Open file and
// Google Drive show). `openFile`: the file picker, each file opening beside the others.
type Props = {
  lib: LibraryApi | null
  openFile: () => void
  loadLabel: string
  loadHint: string
  page: Route['name']
  course?: Course
  quiz?: Quiz
  onDrive: () => void
}

export function TopBar({ lib, openFile, loadLabel, loadHint, page: name, course, quiz, onDrive }: Props) {
  // Home leads the trail: the brand link is hidden while the sidebar is closed.
  const page = crumbsFor(name, course, quiz)
  const crumbs: Crumb[] = page.length > 0 ? [{ label: 'Home', to: { name: 'home' } }, ...page] : []
  const parent = crumbs[crumbs.length - 2]
  const driveFile = lib?.drive.file
  return (
    <header className="topbar">
      {parent?.to && (
        <>
          <ol className="crumbs">
            {crumbs.map((c, i) => (
              <li key={i}>{c.to && i < crumbs.length - 1 ? <a href={href(c.to)}>{c.label}</a> : c.label}</li>
            ))}
          </ol>
          <a className="parent" href={href(parent.to)}>
            ‹ {parent.label}
          </a>
        </>
      )}
      <div className="topbar-actions">
        {/* First in the right-aligned row, so it showing up (or its label changing) moves nothing else. Into the file
            only when signed in and Google said it is the user's own (greyed out with nothing to save); otherwise a
            copy, signed out too, as nobody can tell then (asked for). */}
        {lib &&
          driveFile &&
          (lib.drive.savesInto ? (
            <button
              type="button"
              className="drive-save link"
              disabled={!lib.hasChanges}
              title={lib.hasChanges ? `Save your changes into ${driveFile.name} on Google Drive (Ctrl+S)` : 'No changes to save'}
              onClick={() => void lib.drive.save()}
            >
              Save to Drive
            </button>
          ) : (
            <button
              type="button"
              className="drive-save link"
              title={`Save this library to your own Google Drive, as a copy of ${driveFile.name} (Ctrl+S)`}
              onClick={() => void lib.drive.saveCopy()}
            >
              Save a copy to Drive
            </button>
          ))}
        <button type="button" className="load link" title={loadHint} onClick={openFile}>
          {loadLabel}
        </button>
        {lib && (
          <button type="button" className="link" title={lib.saveHint} onClick={() => void lib.download()}>
            {lib.saveLabel}
          </button>
        )}
        <button type="button" className="link" title="Save to your Google Drive, share a link, or open your Drive libraries" onClick={onDrive}>
          Google Drive
        </button>
      </div>
    </header>
  )
}
