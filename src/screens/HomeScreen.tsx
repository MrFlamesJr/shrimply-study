import { go, goToNew, href } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { QuizTiles } from '../components/QuizTiles'
import { PageHead } from '../components/Page'
import { PlusIcon, ShrimpIcon } from '../components/Icons'
import { plural } from '../logic/plural'
import type { Library } from '../model'

/** `guide` loads the bundled guide, offered on the first visit. */
export function HomeScreen({ lib, guide }: { lib: LibraryApi; guide: () => Promise<Library> }) {
  const { courses } = lib.library
  const open = async () => {
    if (await lib.open()) go({ name: 'home' })
  }
  const newCourse = () => {
    const course = lib.addCourse()
    goToNew(course.id, { name: 'course', course: course.name })
  }
  if (courses.length === 0) {
    return (
      <section className="empty welcome">
        <ShrimpIcon />
        <h1>Start studying in three steps</h1>
        <p className="welcome-lead muted">Turn your notes into cards and quiz yourself until they stick.</p>
        <ol className="steps">
          <li>
            <strong>Make a course</strong>
            <span className="muted">One per class, like Biology, with a quiz for each chapter.</span>
          </li>
          <li>
            <strong>Add cards</strong>
            <span className="muted">Type them, or paste a list or a Quizlet export. Images and blanks work too.</span>
          </li>
          <li>
            <strong>Study</strong>
            <span className="muted">Flashcards, multiple choice or typing. Then retry what you missed.</span>
          </li>
        </ol>
        <div className="actions">
          <button type="button" className="primary" onClick={newCourse}>
            Create your first course
          </button>
          <button type="button" title="Opens a short course about this app, to try it out" onClick={() => void lib.open(guide)}>
            Try the guide
          </button>
          <button type="button" title={lib.loadHint} onClick={open}>
            {lib.loadLabel}
          </button>
        </div>
        <p className="muted small">
          Your cards stay in this browser. Download them as a .shrimp file to keep a copy or study on another device.
        </p>
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
            <button type="button" className="mobile-only" title={lib.loadHint} onClick={open}>
              {lib.loadLabel}
            </button>
            <button type="button" className="add" onClick={newCourse}>
              <PlusIcon /> New course
            </button>
          </>
        }
      />
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
