import { useState } from 'react'
import { go, takeCreated } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { QuizTiles } from '../components/QuizTiles'
import { AutoText } from '../components/AutoText'
import { plural } from '../logic/plural'

export function CourseScreen({ lib, courseId }: { lib: LibraryApi; courseId: string }) {
  // Only right after "+ New course" is the name selected, never on a later visit.
  const [created] = useState(() => takeCreated(courseId))
  const course = lib.findCourse(courseId)
  if (!course) return null
  return (
    <>
      <header className="page-head">
        <div>
          <h1>
            <AutoText
              className="title-input"
              aria-label="Course name"
              required
              value={course.name}
              selectOnMount={created}
              onChange={(name) => lib.renameCourse(course.id, name)}
              onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
            />
          </h1>
          <p className="muted">{plural(course.quizzes.length, 'quiz', 'quizzes')}</p>
        </div>
      </header>
      <QuizTiles lib={lib} course={course} />
      <div className="page-foot">
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(`Delete "${course.name}" and its ${plural(course.quizzes.length, 'quiz', 'quizzes')}?`)) {
              lib.deleteCourse(course.id)
              go({ name: 'home' })
            }
          }}
        >
          Delete course
        </button>
      </div>
    </>
  )
}
