import { useState } from 'react'
import { windowNav, type Nav } from '../route'
import type { LibraryApi } from '../state/useWorkspace'
import { QuizTiles } from '../components/QuizTiles'
import { AutoText } from '../components/AutoText'
import { DangerZone, PageHead } from '../components/Page'
import { plural } from '../logic/plural'
import { nameTaken } from '../logic/names'

export function CourseScreen({ lib, courseId, nav }: { lib: LibraryApi; courseId: string; nav?: Nav }) {
  const course = lib.findCourse(courseId)
  const { go, takeCreated } = nav ?? windowNav({ name: 'course', course: course?.name ?? '' })
  // Only right after "+ New course" is the name selected, never on a later visit.
  const [created] = useState(() => takeCreated(courseId))
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
              onEnter={(box) => (box.ownerDocument.activeElement as HTMLElement | null)?.blur()}
            />
          }
          sub={plural(course.quizzes.length, 'quiz', 'quizzes')}
        />
        <QuizTiles lib={lib} course={course} nav={nav} />
      </div>
      <DangerZone
        label="Delete course"
        detail={`Deletes this course and its ${plural(course.quizzes.length, 'quiz', 'quizzes')}. Ctrl+Z brings it back.`}
        question={`Delete "${course.name}" and its ${plural(course.quizzes.length, 'quiz', 'quizzes')}?`}
        onDelete={() => {
          lib.deleteCourse(course.id)
          go({ name: 'home' })
        }}
      />
    </>
  )
}
