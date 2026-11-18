import { href, type Nav } from '../route'
import type { DriveApi, LibraryApi } from '../state/useWorkspace'
import { QuizTiles } from '../components/QuizTiles'
import { PageHead } from '../components/Page'
import { ViewOnlyNote } from '../components/ViewOnlyNote'
import { CloudIcon, CourseIcon, FolderIcon, PlusIcon, ShrimpIcon } from '../components/Icons'
import { OpenLink } from '../components/OpenLink'
import { plural } from '../logic/plural'

type Props = {
  /** The file (a file's home), or the active file (the Welcome tab); null when none is open. */
  lib: LibraryApi | null
  /** The tab's navigation (its quiz tiles open a new quiz in it); null with no file open. */
  nav: Nav | null
  /** Google Drive: whether it is set up and the signed-in state decide which button leads. */
  drive: DriveApi
  /** The .shrimp copy from this device: its button's words (the storage adapter's). */
  openLabel: string
  openHint: string
  /** The file picker, each file opening beside the others; resolves true when one opened. */
  openFile: () => Promise<boolean>
  /** Opens the bundled guide as a file of its own; resolves true when it opened. */
  openGuide: () => Promise<boolean>
  /** "New course": in the active file, or in a new one when none is open. */
  newCourse: () => void
  /** The welcome page (the Welcome tab, or the page cell with no file open), else the file's course list: an empty
   *  file's home is its course list with nothing in it, never the welcome page (asked for). */
  welcome: boolean
  /** The welcome page's Go to my courses (with courses): the active file's home. */
  toCourses?: () => void
  /** Opens the Open dialog, where the user's Drive libraries are listed to open. */
  openDrive: () => void
  /** The welcome page's Learn links, each a tab of its own (`background`: Ctrl or the middle button, keeping this page
   *  in front): How studying works, Saving and sharing, What's new. */
  onStudyTips: (background: boolean) => void
  onLearnMore: (background: boolean) => void
  onWhatsNew: (background: boolean) => void
}

export function HomeScreen({ lib, nav, drive, openLabel, openHint, openFile, openGuide, newCourse, welcome, toCourses, openDrive, onStudyTips, onLearnMore, onWhatsNew }: Props) {
  const driveSetUp = drive.setUp
  const signedIn = driveSetUp && drive.signedIn()
  // Beside the device copy: the other place a library can come from. Signed in, it replaces the device copy.
  const fromDrive = (className?: string) =>
    signedIn && (
      <button type="button" className={className} title="Open a library saved in your Google Drive" onClick={openDrive}>
        Open from Google Drive
      </button>
    )
  const courses = lib?.library.courses ?? []
  // What opens shows in a tab of its own, on its home.
  const open = (from: () => Promise<boolean>) => void from()
  // With courses, the welcome page's main button leads back to them.
  const returning = courses.length > 0
  if (welcome) {
    // One gold button: what a visitor does first. With courses already, going back to them; signed out with Google
    // Drive, signing in (libraries then save to their Drive as they work); else making the first course.
    const lead = returning ? 'courses' : !signedIn && driveSetUp ? 'signIn' : 'create'
    const signIn = (className?: string) => (
      <button type="button" className={className} title="Your libraries then save to your Google Drive as you work" onClick={() => void drive.signIn()}>
        <CloudIcon /> Sign in with Google
      </button>
    )
    const create = (className?: string) => (
      <button type="button" className={className} title={signedIn ? 'Makes it in your Google Drive' : undefined} onClick={() => newCourse()}>
        <PlusIcon /> Create your first course
      </button>
    )
    return (
      <section className="welcome">
        <header className="welcome-head">
          <ShrimpIcon />
          <div>
            <h1>Shrimply Study</h1>
            <p className="muted">Turn your notes into cards, then study them as flashcards, multiple choice or typing.</p>
          </div>
        </header>
        <div className="actions">
          {lead === 'courses' ? (
            <button type="button" className="primary" onClick={toCourses}>
              Go to my courses
            </button>
          ) : lead === 'signIn' ? (
            signIn('primary')
          ) : (
            create('primary')
          )}
        </div>
        {/* Everything else, as quiet links in two short lists: what to do, and what to read (each a tab of its own). */}
        <div className="welcome-lists">
          <section aria-labelledby="welcome-start">
            <h2 id="welcome-start" className="link-list-label">
              Start
            </h2>
            <ul className="link-list">
              {!returning && lead !== 'create' && <li>{create('link')}</li>}
              <li>
                <button
                  type="button"
                  className="link"
                  title={driveSetUp ? 'From your Google Drive, a shared link or this device' : openHint}
                  onClick={driveSetUp ? openDrive : () => open(openFile)}
                >
                  <FolderIcon /> Open a library
                </button>
              </li>
              <li>
                <button type="button" className="link" title="A short course about this app, opened beside your files" onClick={() => open(openGuide)}>
                  <CourseIcon /> Try the guide
                </button>
              </li>
              {lead !== 'signIn' && driveSetUp && !signedIn && <li>{signIn('link')}</li>}
            </ul>
          </section>
          <section aria-labelledby="welcome-learn">
            <h2 id="welcome-learn" className="link-list-label">
              Learn
            </h2>
            <ul className="link-list">
              <li>
                <OpenLink href={href({ name: 'studyTips' })} title="What to know about each study mode and kind of card" onOpen={onStudyTips}>
                  How studying works
                </OpenLink>
              </li>
              {driveSetUp && (
                <li>
                  <OpenLink href={href({ name: 'learnMore' })} title="Where your libraries are kept, and how to share them" onOpen={onLearnMore}>
                    Saving and sharing
                  </OpenLink>
                </li>
              )}
              <li>
                <OpenLink href={href({ name: 'changelog' })} title="Every release's notes" onOpen={onWhatsNew}>
                  What's new
                </OpenLink>
              </li>
            </ul>
          </section>
        </div>
        <p className="muted small">
          {signedIn
            ? 'New libraries save to your Google Drive as you work.'
            : driveSetUp
              ? 'Not signed in, so new libraries stay in this browser until you sign in.'
              : 'Your libraries stay in this browser. Download a copy to keep a .shrimp file.'}
        </p>
      </section>
    )
  }
  const quizCount = courses.reduce((n, c) => n + c.quizzes.length, 0)
  return (
    <>
      <PageHead
        // The file's name after it, in the plain body font and muted, so it reads as which file (asked for).
        title={<>Your courses{lib && <> <span className="title-file">{lib.name}</span></>}</>}
        sub={`${plural(courses.length, 'course')} · ${plural(quizCount, 'quiz', 'quizzes')}`}
        actions={
          <>
            <button type="button" className="mobile-only" title={openHint} onClick={() => open(openFile)}>
              {openLabel}
            </button>
            {fromDrive('mobile-only')}
            {!lib?.readOnly && (
              <button type="button" className="add" onClick={() => newCourse()}>
                <PlusIcon /> New course
              </button>
            )}
          </>
        }
      />
      {lib && <ViewOnlyNote lib={lib} />}
      {courses.map((course) => (
        <section key={course.id} className="course-block">
          <div className="course-row">
            <h2>
              <a href={href({ name: 'course', course: course.name })}>{course.name}</a>
            </h2>
            <span className="muted">{plural(course.quizzes.length, 'quiz', 'quizzes')}</span>
          </div>
          {lib && nav && <QuizTiles lib={lib} course={course} nav={nav} canAdd={!lib.readOnly} />}
        </section>
      ))}
    </>
  )
}
