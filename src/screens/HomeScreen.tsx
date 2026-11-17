import { useState } from 'react'
import { href, type Nav } from '../route'
import type { DriveApi, LibraryApi } from '../state/useWorkspace'
import { QuizTiles } from '../components/QuizTiles'
import { PageHead } from '../components/Page'
import { ViewOnlyNote } from '../components/ViewOnlyNote'
import { CloudIcon, PlusIcon, ShrimpIcon } from '../components/Icons'
import { plural } from '../logic/plural'
import { LearnMore } from './home/LearnMore'

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
  /** The welcome page even with courses (the Welcome tab); a file's home shows it only while it has none. */
  welcome: boolean
  /** The welcome page's Go to my courses (with courses): the active file's home. */
  toCourses?: () => void
  /** Opens the Open dialog, where the user's Drive libraries are listed to open. */
  openDrive: () => void
}

export function HomeScreen({ lib, nav, drive, openLabel, openHint, openFile, openGuide, newCourse, welcome, toCourses, openDrive }: Props) {
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
  const [learnMore, setLearnMore] = useState(false)
  // What opens shows in a tab of its own, on its home.
  const open = (from: () => Promise<boolean>) => void from()
  // With courses, the welcome page's main button leads back to them.
  const returning = courses.length > 0
  if (welcome || (!returning && !lib?.readOnly)) {
    return (
      <section className="empty welcome">
        <ShrimpIcon />
        <h1>Start studying in three steps</h1>
        <p className="welcome-lead muted">Turn your notes into cards and quiz yourself until they stick.</p>
        <ol className="steps">
          <li>
            <strong>Make a course</strong>
            <span className="muted">One per class, like Biology. On its page, select New quiz for each chapter.</span>
          </li>
          <li>
            <strong>Add cards</strong>
            <span className="muted">
              Front and back, fill in the blank, true or false, multiple choice or sequences. Or Import them from
              Quizlet or a spreadsheet.
            </span>
          </li>
          <li>
            <strong>Study</strong>
            <span className="muted">
              Pick flashcards, multiple choice or typing, then Start. At the end, retry just the ones you missed.
            </span>
          </li>
        </ol>
        {driveSetUp && (
          <button
            type="button"
            className="link"
            onClick={() => setLearnMore(true)}
          >
            Learn more
          </button>
        )}
        <div className="actions">
          {/* One gold button: what a visitor does first. Signed out with Google Drive, that is signing in (the cards then
              save to their Drive as they work); with courses already, going to them. */}
          {returning && (
            <button type="button" className="primary" onClick={toCourses}>
              Go to my courses
            </button>
          )}
          {!signedIn && driveSetUp && (
            <button
              type="button"
              className={returning ? undefined : 'primary'}
              title="Your libraries then save to your Google Drive as you work"
              onClick={() => void drive.signIn()}
            >
              <CloudIcon /> Sign in with Google
            </button>
          )}
          {!returning && (
            <button
              type="button"
              className={signedIn || !driveSetUp ? 'primary' : undefined}
              title={signedIn ? 'Makes it in your Google Drive' : undefined}
              onClick={() => newCourse()}
            >
              Create your first course
            </button>
          )}
          {fromDrive()}
          <button
            type="button"
            title="Opens a short course about this app beside your files, to try it out"
            onClick={() => open(openGuide)}
          >
            Try the guide
          </button>
          {!signedIn && (
            <button type="button" title={openHint} onClick={() => open(openFile)}>
              {openLabel}
            </button>
          )}
        </div>
        <p className="muted small">
          {signedIn
            ? 'Your libraries save to your Google Drive as you work. Share one with a link, or download a copy as a .shrimp file.'
            : driveSetUp
              ? 'Your libraries stay only in this browser until you sign in. Signed in, they save to your Google Drive as you work and you can share them with a link.'
              : 'Your cards stay in this browser. Download them as a .shrimp file to keep a copy or study on another device.'}
        </p>
        {/* Inside the section, as the page centers it only while it is its only child. */}
        {learnMore && <LearnMore onClose={() => setLearnMore(false)} />}
      </section>
    )
  }
  const quizCount = courses.reduce((n, c) => n + c.quizzes.length, 0)
  return (
    <>
      <PageHead
        title="Your courses"
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
