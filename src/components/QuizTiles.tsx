import { goToNew, href } from '../route'
import type { Course } from '../model'
import type { LibraryApi } from '../state/useLibrary'
import { plural } from '../logic/plural'
import { PlusIcon } from './Icons'

export function QuizTiles({ lib, course }: { lib: LibraryApi; course: Course }) {
  return (
    <div className="tiles">
      {course.quizzes.map((quiz) => (
        <a key={quiz.id} className="tile" href={href({ name: 'quiz', id: quiz.id })}>
          <span className="tile-name">{quiz.name}</span>
          <span className="muted">{plural(quiz.cards.length, 'card')}</span>
        </a>
      ))}
      <button type="button" className="tile tile-new" onClick={() => goToNew({ name: 'edit', id: lib.addQuiz(course.id) })}>
        <PlusIcon /> New quiz
      </button>
    </div>
  )
}
