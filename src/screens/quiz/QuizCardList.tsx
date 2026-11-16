import type { Quiz } from '../../model'
import { sections, withCollapsed } from '../../logic/groups'
import { plural } from '../../logic/plural'
import { CardRow } from '../../components/CardRow'
import { ChevronDownIcon, PlusIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'

type Props = {
  quiz: Quiz
  collapsed: ReadonlySet<string>
  setCollapsed: (collapsed: ReadonlySet<string>) => void
  onEdit: (cardId: string) => void
  onDelete: (cardId: string) => void
  /** Opens the editor on its Add box. */
  onAdd: () => void
}

export function QuizCardList({ quiz, collapsed, setCollapsed, onEdit, onDelete, onAdd }: Props) {
  // Card numbers match the editor's ("#1").
  const numbers = new Map(quiz.cards.map((c, i) => [c.id, i + 1]))

  const list = (cards: Quiz['cards']) => (
    <ol className="card-list card-rows quiz-rows" start={numbers.get(cards[0].id)}>
      {cards.map((card) => (
        <CardRow
          key={card.id}
          card={card}
          lead={
            <span className="row-num" aria-hidden="true">
              #{numbers.get(card.id)}
            </span>
          }
          kind
          onEdit={() => onEdit(card.id)}
          onDelete={() => onDelete(card.id)}
        />
      ))}
    </ol>
  )

  return (
    <section>
      <div className="list-head">
        <h2>Cards in this quiz</h2>
        <button type="button" className="quiet" title="Open the editor to add cards" onClick={onAdd}>
          <PlusIcon /> Add cards
        </button>
      </div>
      {sections(quiz.cards, quiz.groups).map(({ group, cards }) => {
        if (cards.length === 0) return null
        if (!group) return <div key="">{list(cards)}</div>
        const shut = collapsed.has(group.id)
        return (
          <div key={group.id} className={shut ? 'group-box is-collapsed' : 'group-box'} data-color={group.color}>
            <h3>
              <IconButton
                className="group-toggle"
                label={shut ? 'Expand group' : 'Collapse group'}
                aria-expanded={!shut}
                onClick={() => setCollapsed(withCollapsed(collapsed, [group.id], !shut))}
              >
                <ChevronDownIcon />
              </IconButton>
              <span className="swatch" aria-hidden="true" />
              {group.name}
              <span className="group-count">{plural(cards.length, 'card')}</span>
            </h3>
            <div className="group-body">
              <div>{list(cards)}</div>
            </div>
          </div>
        )
      })}
    </section>
  )
}
