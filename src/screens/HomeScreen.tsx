import { useState } from 'react'
import { go, goToNew, href } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { QuizTiles } from '../components/QuizTiles'
import { PageHead } from '../components/Page'
import { InfoBox } from '../components/InfoBox'
import { ReleaseNotes, releaseDate } from '../components/ReleaseNotes'
import { PlusIcon, ShrimpIcon } from '../components/Icons'
import { plural } from '../logic/plural'
import { RELEASES } from '../releaseNotes'
import { LearnMore } from './home/LearnMore'
import type { Library } from '../model'

type Props = {
  lib: LibraryApi
  /** Loads the bundled guide, offered on the welcome page. */
  guide: () => Promise<Library>
  /** Home is the welcome page even with courses: a first visit, or once after a release (App decides). */
  welcome: boolean
  /** Back to the course list: the welcome page's main button, or after it opened a library. */
  endWelcome: () => void
  /** Opens the Google Drive dialog, where the user's Drive libraries are listed to open. */
  openDrive: () => void
}

export function HomeScreen({ lib, guide, welcome, endWelcome, openDrive }: Props) {
  // Beside every Open file: the other place a library can come from.
  const fromDrive = (className?: string) =>
    lib.drive.setUp && (
      <button type="button" className={className} title="Open a library saved in your Google Drive" onClick={openDrive}>
        Open from Google Drive
      </button>
    )
  const { courses } = lib.library
  const [notesOpen, setNotesOpen] = useState(true)
  const [learnMore, setLearnMore] = useState(false)
  const open = async (from?: () => Promise<Library>) => {
    if (!(await lib.open(from))) return
    endWelcome()
    go({ name: 'home' })
  }
  const newCourse = () => {
    const course = lib.addCourse()
    goToNew(course.id, { name: 'course', course: course.name })
  }
  // What's new is always on home, on the welcome page and the course list alike (asked for).
  const whatsNew = (
    <InfoBox
      title="What's new"
      note={`[${RELEASES[0].name}] · ${releaseDate(RELEASES[0].date)}`}
      open={notesOpen}
      onToggle={setNotesOpen}
    >
      <ReleaseNotes notes={RELEASES[0].notes} />
      <p className="all-changes">
        <a href={href({ name: 'changelog' })}>See all releases</a>
      </p>
    </InfoBox>
  )
  // With courses, the welcome page's main button leads back to them.
  const returning = courses.length > 0
  if (welcome || !returning) {
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
        {lib.drive.setUp && (
          <button
            type="button"
            className="link"
            onClick={() => setLearnMore(true)}
          >
            Learn more
          </button>
        )}
        <div className="actions">
          {returning ? (
            <button type="button" className="primary" onClick={endWelcome}>
              Go to my courses
            </button>
          ) : (
            <button type="button" className="primary" onClick={newCourse}>
              Create your first course
            </button>
          )}
          <button
            type="button"
            title={
              returning
                ? 'Replaces your cards with a short course about this app'
                : 'Opens a short course about this app, to try it out'
            }
            onClick={() => void open(guide)}
          >
            Try the guide
          </button>
          <button type="button" title={lib.loadHint} onClick={() => void open()}>
            {lib.loadLabel}
          </button>
          {fromDrive()}
        </div>
        <p className="muted small">
          {lib.drive.setUp
            ? 'Your cards stay in this browser. Save them to Google Drive or download them as a .shrimp file to keep a copy, study on another device or share them.'
            : 'Your cards stay in this browser. Download them as a .shrimp file to keep a copy or study on another device.'}
        </p>
        {/* Last, under everything, so the buttons come first (asked for). */}
        {whatsNew}
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
            <button type="button" className="mobile-only" title={lib.loadHint} onClick={() => void open()}>
              {lib.loadLabel}
            </button>
            {fromDrive('mobile-only')}
            <button type="button" className="add" onClick={newCourse}>
              <PlusIcon /> New course
            </button>
          </>
        }
      />
      {whatsNew}
      {courses.map((course) => (
        <section key={course.id} className="course-block">
          <div className="course-row">
            <h2>
              <a href={href({ name: 'course', course: course.name })}>{course.name}</a>
            </h2>
            <span className="muted">{plural(course.quizzes.length, 'quiz', 'quizzes')}</span>
          </div>
          <QuizTiles lib={lib} course={course} />
        </section>
      ))}
    </>
  )
}
