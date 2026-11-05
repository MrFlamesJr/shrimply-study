import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { GROUP_NAME_MAX, newId, SIDE_IMAGE, type Card, type Group, type TermCard } from '../model'
import { go, takeCreated } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import type { ParsedCard } from '../logic/parseCards'
import { isBlank, missingPart, unfinishedMessage } from '../logic/cardStatus'
import { inGroupOrder, nextColor } from '../logic/groups'
import { plural } from '../logic/plural'
import { AutoText } from '../components/AutoText'
import { ClozeField } from '../components/ClozeField'
import { ColorPicker } from '../components/ColorPicker'
import { GroupIcon, PlusIcon, TrashIcon } from '../components/Icons'
import { ImageSlot } from '../components/ImageSlot'
import { ImportDialog } from '../components/ImportDialog'
import type { Notify } from '../components/Toasts'

type Field = 'term' | 'definition' | 'explanation'
const LABEL: Record<Field, string> = { term: 'Term', definition: 'Definition', explanation: 'Explanation' }
// What to focus after the next write: a card's field (or its group select) by card id, or a group's name by group id.
type Focus = { card: string; field: Field | 'blank' | 'group' } | { groupName: string }

export function EditScreen({ lib, quizId, notify }: { lib: LibraryApi; quizId: string; notify: Notify }) {
  const found = lib.findQuiz(quizId)
  const [importOpen, setImportOpen] = useState(false)
  // Half-filled cards are only marked after a blocked Done.
  const [triedDone, setTriedDone] = useState(false)
  // Bumped on every blocked Done so the red hints replay their shake.
  const [nudge, setNudge] = useState(0)
  const pendingFocus = useRef<Focus | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Only right after "+ New quiz" is the name selected, never on a later visit.
  const [created] = useState(() => takeCreated(quizId))
  const cards = found?.quiz.cards
  const groups = found?.quiz.groups

  const focusCell = (id: string, field: Field | 'blank' | 'group') =>
    listRef.current?.querySelector<HTMLElement>(`[data-card="${id}"][data-field="${field}"]`)?.focus()

  // The field a card starts with.
  const firstField = (card: Card) => (card.type === 'cloze' ? 'blank' : 'term')

  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    if ('groupName' in target) {
      const name = listRef.current?.querySelector<HTMLTextAreaElement>(`[data-group-name="${target.groupName}"]`)
      name?.focus()
      name?.select()
    } else {
      focusCell(target.card, target.field)
    }
  }, [cards, groups])

  if (!found || !cards || !groups) return null
  const { course, quiz } = found

  // The one write path: keeps the cards in group order, so the list always matches the screen.
  const put = (next: Card[], nextGroups: Group[] = groups) =>
    lib.setCards(quiz.id, inGroupOrder(next, nextGroups), nextGroups)
  const change = (id: string, patch: Partial<TermCard>) =>
    put(cards.map((c) => (c.id === id ? ({ ...c, ...patch } as Card) : c)))

  const edit = (id: string, field: Field, value: string) => change(id, { [field]: value })
  const editCloze = (id: string, statement: string, explanation: (string | null)[]) =>
    put(cards.map((c) => (c.id === id ? { ...c, statement, explanation } as Card : c)))

  // Leaving a field drops spaces and empty lines at its start and end (the ones in between stay).
  const trim = (card: TermCard, field: Field) => {
    const value = card[field]
    if (value !== undefined && value !== value.trim()) edit(card.id, field, value.trim())
  }

  const addCard = (group?: string, kind: 'term' | 'cloze' = 'term') => {
    const card: Card =
      kind === 'cloze'
        ? { id: newId(), type: 'cloze', statement: '', explanation: [], ...(group && { group }) }
        : { id: newId(), term: '', definition: '', ...(group && { group }) }
    pendingFocus.current = { card: card.id, field: firstField(card) }
    put([...cards, card])
  }

  // Focuses the first card of a section, or adds one when it is empty.
  const enterSection = (group?: string) => {
    const first = cards.find((c) => c.group === group)
    if (first) focusCell(first.id, firstField(first))
    else addCard(group)
  }

  const addGroup = () => {
    const group = { id: newId(), name: 'New group', color: nextColor(groups) }
    pendingFocus.current = { groupName: group.id }
    put(cards, [...groups, group])
  }

  const ungroup = (id: string) =>
    put(
      cards.map((c) => (c.group === id ? { ...c, group: undefined } : c)),
      groups.filter((g) => g.id !== id),
    )

  // The moved card goes to the end of its new section and keeps the focus.
  const move = (card: Card, group: string) => {
    pendingFocus.current = { card: card.id, field: 'group' }
    put([...cards.filter((c) => c.id !== card.id), { ...card, group: group || undefined }])
  }

  // Enter moves to the next field, then the next card in the same section, then adds a card there.
  const advance = (card: Card, field: Field | 'blank') => {
    if (field === 'term') focusCell(card.id, 'definition')
    else if (field === 'definition' && card.type !== 'cloze' && card.explanation !== undefined) focusCell(card.id, 'explanation')
    else {
      const section = cards.filter((c) => c.group === card.group)
      const next = section[section.indexOf(card) + 1]
      if (next) focusCell(next.id, firstField(next))
      else addCard(card.group, card.type === 'cloze' ? 'cloze' : 'term')
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, card: Card, field: Field) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    advance(card, field)
  }

  // Blank cards are dropped and empty explanation fields closed, then groups left without cards.
  // Half-filled cards keep you here, with every error shown.
  const done = () => {
    let tidied = false
    const kept = cards
      .filter((c) => !isBlank(c))
      .map((c): Card => {
        if (c.type === 'cloze') {
          const statement = c.statement.trim()
          // An opened explanation left empty closes, like a term card's.
          const explanation = c.explanation.map((x) => x?.trim() || null)
          if (statement === c.statement && explanation.every((x, i) => x === c.explanation[i])) return c
          tidied = true
          return { ...c, statement, explanation }
        }
        if (c.explanation === undefined || c.explanation.trim()) return c
        tidied = true
        return { ...c, explanation: undefined }
      })
    const keptGroups = groups.filter((g) => kept.some((c) => c.group === g.id))
    if (kept.length !== cards.length || keptGroups.length !== groups.length) tidied = true
    const firstBad = kept.findIndex((c) => missingPart(c))
    if (firstBad === -1) {
      if (tidied) put(kept, keptGroups)
      go({ name: 'quiz', id: quiz.id })
      return
    }
    setTriedDone(true)
    setNudge((n) => n + 1)
    notify('error', unfinishedMessage(kept)!)
    const target = { card: kept[firstBad].id, field: missingPart(kept[firstBad])! }
    if (tidied) {
      pendingFocus.current = target
      put(kept, keptGroups)
    } else {
      focusCell(target.card, target.field)
    }
  }

  // Blank rows are dropped so the new cards don't land after an empty one. A group the dialog just made is added.
  const importCards = (parsed: ParsedCard[], group?: Group) => {
    const kept = cards.filter((c) => !isBlank(c))
    const added: Card[] = parsed.map((p) => ({ id: newId(), ...p, ...(group && { group: group.id }) }))
    put([...kept, ...added], group && !groups.some((g) => g.id === group.id) ? [...groups, group] : groups)
  }

  const renderCard = (card: Card) => {
    const i = cards.indexOf(card)
    const flagged = triedDone ? missingPart(card) : null
    return (
      <div key={card.id} className="pair">
        <div className="pair-head">
          <span>
            #{i + 1}
            <span className="pair-kind muted small">{card.type === 'cloze' ? 'Fill in the blank' : 'Term and definition'}</span>
          </span>
          <span className="pair-tools">
            {groups.length > 0 && (
              <select
                aria-label={`Group of card ${i + 1}`}
                title="Move this card to another group"
                data-card={card.id}
                data-field="group"
                value={card.group ?? ''}
                onChange={(e) => move(card, e.target.value)}
              >
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id} data-color={g.color}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            {card.type !== 'cloze' && card.explanation === undefined && (
              <button
                type="button"
                className="quiet small"
                onClick={() => {
                  pendingFocus.current = { card: card.id, field: 'explanation' }
                  change(card.id, { explanation: '' })
                }}
              >
                <PlusIcon /> Explanation
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label={`Delete card ${i + 1}`}
              title="Delete card"
              onClick={() => put(cards.filter((c) => c.id !== card.id))}
            >
              <TrashIcon />
            </button>
          </span>
        </div>
        {card.type === 'cloze' ? (
          <div className="pair-fields">
            <div className="pair-field is-wide">
              <ClozeField
                aria-label={`Statement ${i + 1}`}
                aria-invalid={flagged === 'blank' || undefined}
                data-card={card.id}
                data-field="blank"
                statement={card.statement}
                explanation={card.explanation}
                onChange={(statement, explanation) => editCloze(card.id, statement, explanation)}
                image={{
                  src: card.image,
                  label: `card ${i + 1}`,
                  onChange: (image) => put(cards.map((c) => (c.id === card.id ? { ...c, image } : c))),
                }}
                onEnter={() => advance(card, 'blank')}
                hint={
                  <span
                    key={flagged === 'blank' ? `bad-${nudge}` : 'ok'}
                    className={flagged !== 'blank' ? 'field-hint' : nudge > 0 ? 'field-hint is-bad is-nudged' : 'field-hint is-bad'}
                  >
                    {flagged === 'blank' ? 'Add a blank' : 'Statement'}
                  </span>
                }
              />
            </div>
          </div>
        ) : (
        <div className="pair-fields">
          {(['term', 'definition'] as const).map((field) => (
            <label key={field} className="pair-field">
              <ImageSlot
                src={card[SIDE_IMAGE[field]]}
                label={`${field} ${i + 1}`}
                onChange={(src) => change(card.id, { [SIDE_IMAGE[field]]: src })}
              >
                <AutoText
                  aria-label={`${LABEL[field]} ${i + 1}`}
                  aria-invalid={flagged === field || undefined}
                  data-card={card.id}
                  data-field={field}
                  value={card[field]}
                  onChange={(value) => edit(card.id, field, value)}
                  onBlur={() => trim(card, field)}
                  onKeyDown={(e) => onKeyDown(e, card, field)}
                />
              </ImageSlot>
              <span
                key={flagged === field ? `bad-${nudge}` : 'ok'}
                className={flagged !== field ? 'field-hint' : nudge > 0 ? 'field-hint is-bad is-nudged' : 'field-hint is-bad'}
              >
                {flagged === field ? `Add a ${field}` : LABEL[field]}
              </span>
            </label>
          ))}
          {card.explanation !== undefined && (
            <label className="pair-field is-wide">
              <AutoText
                aria-label={`Explanation ${i + 1}`}
                data-card={card.id}
                data-field="explanation"
                value={card.explanation}
                onChange={(value) => edit(card.id, 'explanation', value)}
                onBlur={() => trim(card, 'explanation')}
                onKeyDown={(e) => onKeyDown(e, card, 'explanation')}
              />
              <span className="field-hint">Explanation</span>
            </label>
          )}
        </div>
        )}
      </div>
    )
  }

  const addRow = (group?: string) => (
    <div className="add-rows">
      <button type="button" className="add-row" onClick={() => addCard(group)}>
        <PlusIcon /> Add card
      </button>
      <button type="button" className="add-row" onClick={() => addCard(group, 'cloze')}>
        <PlusIcon /> Add fill in the blank
      </button>
    </div>
  )

  return (
    <>
      <header className="page-head">
        <div>
          <h1>
            <AutoText
              className="title-input"
              aria-label="Quiz name"
              required
              value={quiz.name}
              selectOnMount={created}
              onChange={(name) => lib.renameQuiz(quiz.id, name)}
              onEnter={() => (cards.length > 0 ? focusCell(cards[0].id, firstField(cards[0])) : addCard())}
            />
          </h1>
          <p className="muted">
            {course.name} · {plural(cards.length, 'card')}
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            aria-haspopup="dialog"
            title="Paste cards from Quizlet or a spreadsheet"
            onClick={() => setImportOpen(true)}
          >
            Import
          </button>
          <button type="button" className="primary" title="Back to the quiz. Empty cards are removed." onClick={done}>
            Done
          </button>
        </div>
      </header>

      {importOpen && (
        <ImportDialog
          groups={groups}
          onImport={importCards}
          onClose={() => setImportOpen(false)}
        />
      )}

      <div ref={listRef} className="pairs">
        {cards.filter((c) => !c.group).map(renderCard)}
        {addRow()}
        {groups.map((g) => {
          const members = cards.filter((c) => c.group === g.id)
          return (
            <section key={g.id} className="group-box" data-color={g.color}>
              <div className="group-head">
                <ColorPicker
                  value={g.color}
                  onChange={(color) => put(cards, groups.map((x) => (x.id === g.id ? { ...x, color } : x)))}
                />
                <AutoText
                  className="group-name"
                  aria-label="Group name"
                  required
                  data-group-name={g.id}
                  maxLength={GROUP_NAME_MAX}
                  counter
                  value={g.name}
                  onChange={(name) => put(cards, groups.map((x) => (x.id === g.id ? { ...x, name } : x)))}
                  onEnter={() => enterSection(g.id)}
                />
                <span className="muted">{plural(members.length, 'card')}</span>
                <button
                  type="button"
                  className="quiet small"
                  title="Remove the group. Its cards stay in the quiz."
                  onClick={() => {
                    if (confirm(`Remove the group "${g.name}"? Its cards stay in the quiz.`)) {
                      ungroup(g.id)
                    }
                  }}
                >
                  Ungroup
                </button>
              </div>
              {members.map(renderCard)}
              {addRow(g.id)}
            </section>
          )
        })}
        <div className="new-group">
          <button type="button" onClick={addGroup}>
            <GroupIcon />
            New group
          </button>
          <span className="muted">Multiple choice takes wrong answers from the same group first.</span>
        </div>
      </div>

      <div className="page-foot">
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(`Delete "${quiz.name}" and its ${plural(cards.length, 'card')}?`)) {
              lib.deleteQuiz(quiz.id)
              go({ name: 'course', id: course.id })
            }
          }}
        >
          Delete quiz
        </button>
      </div>
    </>
  )
}
