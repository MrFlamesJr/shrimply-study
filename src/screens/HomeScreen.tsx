import { go, goToNew, href } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { QuizTiles } from '../components/QuizTiles'
import { PlusIcon } from '../components/Icons'
import { plural } from '../logic/plural'

export function HomeScreen({ lib }: { lib: LibraryApi }) {
  const { courses } = lib.library
  const open = async () => {
    if (await lib.open()) go({ name: 'home' })
  }
  if (courses.length === 0) {
    return (
      <section className="empty">
        <h1>Start studying in three steps</h1>
        <ol className="steps">
          <li>Create a course, like Biology.</li>
          <li>Add a quiz and paste your cards. A Quizlet export works.</li>
          <li>Pick a study mode: flashcards, multiple choice or typing.</li>
        </ol>
        <div className="actions">
          <button type="button" className="primary" onClick={() => goToNew({ name: 'course', id: lib.addCourse() })}>
            Create your first course
          </button>
          <button type="button" title={lib.loadHint} onClick={open}>
            {lib.loadLabel}
          </button>
        </div>
        <p className="muted small">Your work stays in this browser until you download it as a .shrimp file.</p>
      </section>
    )
  }
  const quizCount = courses.reduce((n, c) => n + c.quizzes.length, 0)
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Your courses</h1>
          <p className="muted">
            {plural(courses.length, 'course')} · {plural(quizCount, 'quiz', 'quizzes')}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="mobile-only" title={lib.loadHint} onClick={open}>
            {lib.loadLabel}
          </button>
          <button type="button" className="add" onClick={() => goToNew({ name: 'course', id: lib.addCourse() })}>
            <PlusIcon /> New course
          </button>
        </div>
      </header>
      {courses.map((course) => (
        <section key={course.id} className="course-block">
          <div className="course-row">
            <h2>
              <a href={href({ name: 'course', id: course.id })}>{course.name}</a>
            </h2>
            <span className="muted">{plural(course.quizzes.length, 'quiz', 'quizzes')}</span>
          </div>
          <QuizTiles lib={lib} course={course} />
        </section>
      ))}
    </>
  )
}
