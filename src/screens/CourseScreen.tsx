import { useState } from 'react'
import { go, takeCreated } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { QuizTiles } from '../components/QuizTiles'
import { AutoText } from '../components/AutoText'
import { DangerZone, PageHead } from '../components/Page'
import { plural } from '../logic/plural'
import { nameTaken } from '../logic/names'

export function CourseScreen({ lib, courseId }: { lib: LibraryApi; courseId: string }) {
  // Only right after "+ New course" is the name selected, never on a later visit.
  const [created] = useState(() => takeCreated(courseId))
  const course = lib.findCourse(courseId)
  if (!course) return null
  return (
    <>
      <div className="page-body">
        <PageHead
          title={
            <AutoText
              className="title-input"
              aria-label="Course name"
              required
              value={course.name}
              selectOnMount={created}
              check={(name) => nameTaken(name, lib.library.courses.filter((c) => c.id !== course.id).map((c) => c.name), 'course')}
              onChange={(name) => lib.renameCourse(course.id, name)}
              onEnter={() => (document.activeElement as HTMLElement | null)?.blur()}
            />
          }
          sub={plural(course.quizzes.length, 'quiz', 'quizzes')}
        />
        <QuizTiles lib={lib} course={course} />
      </div>
      <DangerZone
        label="Delete course"
        detail={`Deletes this course and its ${plural(course.quizzes.length, 'quiz', 'quizzes')}. You can't undo this.`}
        question={`Delete "${course.name}" and its ${plural(course.quizzes.length, 'quiz', 'quizzes')}?`}
        onDelete={() => {
          lib.deleteCourse(course.id)
          go({ name: 'home' })
        }}
      />
    </>
  )
}
