import { useState, type CSSProperties } from 'react'
import type { Card, Format, Side } from '../model'
import { go, href } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import { usableCards } from '../logic/buildRound'
import { missingPart } from '../logic/cardStatus'
import { plural } from '../logic/plural'
import { CardDialog } from '../components/CardDialog'
import { CardRow } from '../components/CardRow'
import { Segmented } from '../components/Segmented'
import { PencilIcon, PlayIcon } from '../components/Icons'
import type { Prefs } from '../App'

type Props = { lib: LibraryApi; quizId: string; prefs: Prefs; setPrefs: (p: Prefs) => void }

// [value, label, hint shown under the bar while it is chosen]
const MODES: [Format, string, string][] = [
  ['flashcards', 'Flashcards', 'Flip each card and rate yourself.'],
  ['choice', 'Multiple choice', 'Pick the right answer out of four.'],
  ['typing', 'Typing', 'Type the answer from memory.'],
]
const SIDES: [Side, string, string][] = [
  ['term', 'Term', 'You see the term and answer with the definition.'],
  ['definition', 'Definition', 'You see the definition and answer with the term.'],
  ['mixed', 'Mixed', 'Each card shows the term or the definition at random.'],
]
const ORDERS: [boolean, string, string][] = [
  [true, 'Shuffled', 'A new random order every round.'],
  [false, 'In order', 'The order the cards have in the quiz.'],
]

export function QuizScreen({ lib, quizId, prefs, setPrefs }: Props) {
  // The id of the card open in the edit dialog.
  const [editing, setEditing] = useState<string | null>(null)
  const found = lib.findQuiz(quizId)
  if (!found) return null
  const { course, quiz } = found
  const usable = usableCards(quiz.cards).length
  const incomplete = quiz.cards.filter((c) => missingPart(c)).length
  // Multiple choice needs a wrong answer to offer, so fall back to flashcards.
  const format = prefs.format === 'choice' && usable < 2 ? 'flashcards' : prefs.format
  const edit = () => go({ name: 'edit', id: quiz.id })
  const editingCard = quiz.cards.find((c) => c.id === editing)
  const saveCard = (edited: Card) => lib.setCards(quiz.id, quiz.cards.map((c) => (c.id === edited.id ? edited : c)))
  // Card numbers match the editor's ("#1"). The number column is as wide as the longest one, # included.
  const numbers = new Map(quiz.cards.map((c, i) => [c.id, i + 1]))
  const leadWidth = { '--lead-w': `${String(quiz.cards.length).length + 1}ch` } as CSSProperties

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{quiz.name}</h1>
          <p className="muted">
            {plural(quiz.cards.length, 'card')} · <a href={href({ name: 'course', id: course.id })}>{course.name}</a>
          </p>
        </div>
        <div className="actions">
          <button type="button" className="edit" title="Change the name and cards" onClick={edit}>
            <PencilIcon /> Edit quiz
          </button>
          {usable > 0 && (
            <button type="button" className="start" onClick={() => go({ name: 'study', id: quiz.id, format })}>
              <PlayIcon /> Start
            </button>
          )}
        </div>
      </header>

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
        <section className="study-options" aria-labelledby="options-title">
          <h2 id="options-title">Study options</h2>
          <div className="options">
            <Segmented
              label="Study mode"
              options={MODES.map(([value, label, hint]) => ({
                value,
                label,
                disabled: value === 'choice' && usable < 2,
                hint: `${hint}${value === 'choice' && quiz.groups.length > 0 ? " Wrong answers come from the card's group first." : ''}${usable < 2 ? ' Multiple choice needs at least 2 cards.' : ''}`,
              }))}
              value={format}
              onChange={(format) => setPrefs({ ...prefs, format })}
            />
            <Segmented
              label="Question side"
              options={SIDES.map(([value, label, hint]) => ({ value, label, hint }))}
              value={prefs.side}
              onChange={(side) => setPrefs({ ...prefs, side })}
            />
            <Segmented
              label="Card order"
              options={ORDERS.map(([value, label, hint]) => ({ value, label, hint }))}
              value={prefs.shuffle}
              onChange={(shuffle) => setPrefs({ ...prefs, shuffle })}
            />
          </div>
        </section>
      )}

      {quiz.cards.length > 0 && (
        <section>
          <h2>Cards in this quiz</h2>
          {[{ id: '', name: '', color: undefined }, ...quiz.groups].map((group) => {
            const members = quiz.cards.filter((c) => (c.group ?? '') === group.id)
            if (members.length === 0) return null
            return (
              <div key={group.id} className={group.id ? 'group-box' : undefined} data-color={group.color}>
                {group.id && (
                  <h3>
                    <span className="swatch" aria-hidden="true" />
                    {group.name}
                    <span className="group-count">{plural(members.length, 'card')}</span>
                  </h3>
                )}
                <ol className="card-list card-rows" start={numbers.get(members[0].id)} style={leadWidth}>
                  {members.map((card) => (
                    <CardRow
                      key={card.id}
                      card={card}
                      lead={
                        <span className="row-num" aria-hidden="true">
                          #{numbers.get(card.id)}
                        </span>
                      }
                      onEdit={() => setEditing(card.id)}
                    />
                  ))}
                </ol>
              </div>
            )
          })}
        </section>
      )}

      {editingCard && <CardDialog card={editingCard} onSave={saveCard} onClose={() => setEditing(null)} />}
    </>
  )
}
