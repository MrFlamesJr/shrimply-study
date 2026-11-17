import { href, windowNav, type Nav } from '../route'
import type { Course } from '../model'
import type { LibraryApi } from '../state/useLibrary'
import { plural } from '../logic/plural'
import { PlusIcon } from './Icons'

export function QuizTiles({ lib, course, nav }: { lib: LibraryApi; course: Course; nav?: Nav }) {
  const { goToNew } = nav ?? windowNav({ name: 'course', course: course.name })
  return (
    <div className="tiles">
      {course.quizzes.map((quiz) => (
        <a key={quiz.id} className="tile" href={href({ name: 'quiz', course: course.name, quiz: quiz.name })}>
          <span className="tile-name">{quiz.name}</span>
          <span className="muted">{plural(quiz.cards.length, 'card')}</span>
        </a>
      ))}
      <button
        type="button"
        className="tile tile-new"
        onClick={() => {
          const quiz = lib.addQuiz(course.id)
          goToNew(quiz.id, { name: 'edit', course: course.name, quiz: quiz.name })
        }}
      >
        <span className="tile-new-plus">
          <PlusIcon />
        </span>
        <span className="tile-new-text">
          <strong>New quiz</strong>
          {course.quizzes.length === 0 && <span>No quizzes yet. Make one, then type or paste your cards.</span>}
        </span>
      </button>
    </div>
  )
}
