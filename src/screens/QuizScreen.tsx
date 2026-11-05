import { useState } from 'react'
import type { Card, StudyOptions } from '../model'
import { go, href } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { usableCards } from '../logic/buildRound'
import { missingPart } from '../logic/cardStatus'
import { plural } from '../logic/plural'
import { CardDialog } from '../components/CardDialog'
import { PageHead } from '../components/Page'
import { PencilIcon, PlayIcon } from '../components/Icons'
import { QuizCardList } from './quiz/QuizCardList'
import { StudyOptionsPanel } from './quiz/StudyOptionsPanel'

type Props = {
  lib: LibraryApi
  quizId: string
  prefs: StudyOptions
  setPrefs: (p: StudyOptions) => void
  collapsed: ReadonlySet<string>
  setCollapsed: (collapsed: ReadonlySet<string>) => void
}

export function QuizScreen({ lib, quizId, prefs, setPrefs, collapsed, setCollapsed }: Props) {
  // The id of the card open in the edit dialog.
  const [editing, setEditing] = useState<string | null>(null)
  const found = lib.findQuiz(quizId)
  if (!found) return null
  const { course, quiz } = found
  const usable = usableCards(quiz.cards).length
  const incomplete = quiz.cards.filter((c) => missingPart(c)).length
  // Multiple choice needs a wrong answer to offer, so fall back to flashcards.
  const format = prefs.format === 'choice' && usable < 2 ? 'flashcards' : prefs.format
  const edit = () => go({ name: 'edit', course: course.name, quiz: quiz.name })
  const editingCard = quiz.cards.find((c) => c.id === editing)
  const saveCard = (edited: Card) => lib.updateCard(quiz.id, edited)

  return (
    <>
      <PageHead
        title={quiz.name}
        sub={
          <>
            {plural(quiz.cards.length, 'card')} · <a href={href({ name: 'course', course: course.name })}>{course.name}</a>
          </>
        }
        actions={
          <>
            <button type="button" className="edit" title="Change the name and cards" onClick={edit}>
              <PencilIcon /> Edit quiz
            </button>
            {usable > 0 && (
              <button type="button" className="start" onClick={() => go({ name: 'study', course: course.name, quiz: quiz.name, format })}>
                <PlayIcon /> Start
              </button>
            )}
          </>
        }
      />

      {incomplete > 0 && usable > 0 && (
        <p className="note">
          {plural(incomplete, 'card')} {incomplete === 1 ? 'is' : 'are'} missing a term, definition or blank and{' '}
          {incomplete === 1 ? 'is' : 'are'} skipped while studying. Edit the quiz to fix {incomplete === 1 ? 'it' : 'them'}.
        </p>
      )}

      {usable === 0 ? (
        <section className="empty">
          <p>
            {quiz.cards.length === 0
              ? 'This quiz has no cards yet.'
              : `${quiz.cards.length === 1 ? 'The card is' : 'Every card is'} missing a term, definition or blank, so there is nothing to study yet.`}
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={edit}>
              {quiz.cards.length === 0 ? 'Add cards' : 'Finish cards'}
            </button>
          </div>
        </section>
      ) : (
        <StudyOptionsPanel prefs={prefs} setPrefs={setPrefs} format={format} usable={usable} hasGroups={quiz.groups.length > 0} />
      )}

      {quiz.cards.length > 0 && <QuizCardList quiz={quiz} collapsed={collapsed} setCollapsed={setCollapsed} onEdit={setEditing} />}

      {editingCard && <CardDialog card={editingCard} onSave={saveCard} onClose={() => setEditing(null)} />}
    </>
  )
}
