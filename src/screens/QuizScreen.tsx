import { useEffect, useState, type MouseEvent } from 'react'
import { isTermCard, type Card, type StudyOptions } from '../model'
import { href, type Nav } from '../route'
import type { LibraryApi } from '../state/useWorkspace'
import { canChoose, usableCards } from '../logic/buildRound'
import { missingPart } from '../logic/cardStatus'
import { plural } from '../logic/plural'
import { CardDialog } from '../components/CardDialog'
import type { Notify } from '../components/Toasts'
import { PageHead } from '../components/Page'
import { ViewOnlyNote } from '../components/ViewOnlyNote'
import { OpenIcon, PencilIcon, PlayIcon } from '../components/Icons'
import { QuizCardList } from './quiz/QuizCardList'
import { StudyOptionsPanel } from './quiz/StudyOptionsPanel'

type Props = {
  lib: LibraryApi
  quizId: string
  prefs: StudyOptions
  setPrefs: (p: StudyOptions) => void
  collapsed: ReadonlySet<string>
  setCollapsed: (collapsed: ReadonlySet<string>) => void
  nav: Nav
  /** Opens the How studying works tab (`background`: Ctrl or the middle button, keeping this page in front). */
  onStudyTips: (background: boolean) => void
  /** Says things in a toast (a card deleted); without it nothing is said. */
  notify?: Notify
  /**
   * The deleted-card toast's Undo: called right after the delete, it gives the function that undoes that step only
   * (the workspace's `undoLater`). Without it the toast names Ctrl+Z.
   */
  undoLater?: () => () => void
  /** A card to open in the card dialog as the page shows (the Explorer's Edit); `onCardOpened` once it is. */
  openCard?: string | null
  onCardOpened?: () => void
}

export function QuizScreen({ lib, quizId, prefs, setPrefs, collapsed, setCollapsed, nav, onStudyTips, notify, undoLater, openCard, onCardOpened }: Props) {
  // The id of the card open in the edit dialog.
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => {
    if (!openCard) return
    setEditing(openCard)
    onCardOpened?.()
  }, [openCard])
  const found = lib.findQuiz(quizId)
  const { go, goToNew } = nav
  if (!found) return null
  const { course, quiz } = found
  const studied = usableCards(quiz.cards)
  const usable = studied.length
  const kinds = { term: studied.some(isTermCard), cloze: studied.some((c) => c.type === 'cloze'), trueFalse: studied.some((c) => c.type === 'true-false'), choice: studied.some((c) => c.type === 'choice'), sequence: studied.some((c) => c.type === 'sequence') }
  const incomplete = quiz.cards.filter((c) => missingPart(c)).length
  // Multiple choice needs a wrong answer to offer, so fall back to flashcards.
  const choosable = canChoose(studied)
  const format = prefs.format === 'choice' && !choosable ? 'flashcards' : prefs.format
  const edit = () => go({ name: 'edit', course: course.name, quiz: quiz.name })
  const editingCard = quiz.cards.find((c) => c.id === editing)
  const addCards = () => goToNew(`add:${quiz.id}`, { name: 'edit', course: course.name, quiz: quiz.name })
  const deleteCard = (id: string) => {
    const number = quiz.cards.findIndex((c) => c.id === id) + 1
    lib.setCards(quiz.id, quiz.cards.filter((c) => c.id !== id), quiz.groups)
    const undo = undoLater?.()
    notify?.('info', undo ? `Deleted card #${number}.` : `Deleted card #${number}. Ctrl+Z puts it back.`, undefined, undo && { label: 'Undo', run: undo })
    setEditing(null)
  }
  const openTips = (e: MouseEvent, background: boolean) => {
    e.preventDefault()
    onStudyTips(background)
  }
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
            {!lib.readOnly && (
              <button type="button" className="edit" title="Change the name and cards" onClick={edit}>
                <PencilIcon /> Edit quiz
              </button>
            )}
            {usable > 0 && (
              <button type="button" className="start" onClick={() => go({ name: 'study', course: course.name, quiz: quiz.name, format })}>
                <PlayIcon /> Start
              </button>
            )}
          </>
        }
      />
      <ViewOnlyNote lib={lib} />

      {incomplete > 0 && usable > 0 && (
        <p className="note">
          {plural(incomplete, 'card')} {incomplete === 1 ? 'is' : 'are'} missing a front, back or blank and{' '}
          {incomplete === 1 ? 'is' : 'are'} skipped while studying. Edit the quiz to fix {incomplete === 1 ? 'it' : 'them'}.
        </p>
      )}

      {usable === 0 ? (
        <section className="empty">
          <p>
            {quiz.cards.length === 0
              ? 'This quiz has no cards yet.'
              : `${quiz.cards.length === 1 ? 'The card is' : 'Every card is'} missing a front, back or blank, so there is nothing to study yet.`}
          </p>
          {!lib.readOnly && (
            <div className="actions">
              <button type="button" className="primary" onClick={edit}>
                {quiz.cards.length === 0 ? 'Add cards' : 'Finish cards'}
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          <StudyOptionsPanel prefs={prefs} setPrefs={setPrefs} format={format} choosable={choosable} hasGroups={quiz.groups.length > 0} kinds={kinds} />
          <p className="study-tips-link">
            <a
              className="open-link"
              href={href({ name: 'studyTips' })}
              title="What to know about each kind of card, in a tab of its own"
              onClick={(e) => openTips(e, e.ctrlKey || e.metaKey)}
              onAuxClick={(e) => e.button === 1 && openTips(e, true)}
            >
              How studying works <OpenIcon />
            </a>
          </p>
        </>
      )}

      {quiz.cards.length > 0 && <QuizCardList quiz={quiz} collapsed={collapsed} setCollapsed={setCollapsed} onEdit={setEditing} onDelete={deleteCard} onAdd={addCards} readOnly={lib.readOnly} />}

      {editingCard && !lib.readOnly && (
        <CardDialog card={editingCard} index={quiz.cards.indexOf(editingCard)} lib={lib} onSave={saveCard} onDelete={() => deleteCard(editingCard.id)} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
