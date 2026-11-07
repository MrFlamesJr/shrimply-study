import { Fragment, useEffect, useRef, useState } from 'react'
import { newId, type Card, type Group } from '../model'
import { go, takeCreated } from '../route'
import type { LibraryApi } from '../state/useLibrary'
import type { ParsedCard } from '../logic/parseCards'
import { isBlank, missingPart, tidyCards, unfinishedMessage } from '../logic/cardStatus'
import { inGroupOrder, nextColor, sections, withCollapsed } from '../logic/groups'
import { plural } from '../logic/plural'
import { lastSides } from '../logic/sides'
import { nameTaken } from '../logic/names'
import { AutoText } from '../components/AutoText'
import { EditCard, type CardPatch, type Field } from '../components/EditCard'
import { ImportDialog } from '../components/ImportDialog'
import { DangerZone, PageHead } from '../components/Page'
import type { Notify } from '../components/Toasts'
import { AddPill } from './edit/AddPill'
import { AddRow, type CardKind } from './edit/AddRow'
import { EditOutline } from './edit/EditOutline'
import { GroupHead } from './edit/GroupHead'

// What to focus after the next write: a card's field (or its group select) by card id, or a group's name by group id.
type Focus = { card: string; field: Field | 'blank' | 'group' } | { groupName: string }

type Props = {
  lib: LibraryApi
  quizId: string
  notify: Notify
  collapsed: ReadonlySet<string>
  setCollapsed: (collapsed: ReadonlySet<string>) => void
}

export function EditScreen({ lib, quizId, notify, collapsed, setCollapsed }: Props) {
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

  // Focus never goes into a collapsed group: its group opens first, and the focus follows once it shows.
  const focusCard = (card: Card, field: Field | 'blank' | 'group') => {
    if (card.group && collapsed.has(card.group)) {
      pendingFocus.current = { card: card.id, field }
      setCollapsed(withCollapsed(collapsed, [card.group], false))
    } else {
      focusCell(card.id, field)
    }
  }

  // The field a card starts with.
  const firstField = (card: Card): Field | 'blank' =>
    card.type === 'cloze' ? 'blank' : card.type === 'true-false' ? 'statement' : card.type === 'choice' ? 'question' : card.type === 'sequence' ? 'title' : 'term'

  // The field to focus for a card's missing part: the first empty answer or step of a list, or the title or question itself.
  const partField = (card: Card, part: NonNullable<ReturnType<typeof missingPart>>): Field | 'blank' => {
    const first = (list: string[], name: 'right' | 'wrong' | 'step'): Field => {
      const empty = list.findIndex((x) => x.trim() === '')
      return `${name}-${empty === -1 ? list.length : empty}`
    }
    if (card.type === 'choice' && (part === 'right' || part === 'wrong')) return first(card[part], part)
    if (card.type === 'sequence' && part === 'steps') return first(card.steps, 'step')
    return part as Field | 'blank'
  }

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
  }, [cards, groups, collapsed])

  if (!found || !cards || !groups) return null
  const { course, quiz } = found

  // The one write path: keeps the cards in group order, so the list always matches the screen.
  const put = (next: Card[], nextGroups: Group[] = groups) =>
    lib.setCards(quiz.id, inGroupOrder(next, nextGroups), nextGroups)
  const patchCard = (id: string, patch: CardPatch) =>
    put(cards.map((c) => (c.id === id ? ({ ...c, ...patch } as Card) : c)))
  const patchGroup = (id: string, patch: Partial<Group>) =>
    put(cards, groups.map((g) => (g.id === id ? { ...g, ...patch } : g)))

  const addCard = (group?: string, kind: CardKind = 'term') => {
    const sides = lastSides(cards)
    const card: Card =
      kind === 'cloze'
        ? { id: newId(), type: 'cloze', statement: '', explanation: [], ...(group && { group }) }
        : kind === 'true-false'
          ? { id: newId(), type: 'true-false', statement: '', answer: true, ...(group && { group }) }
          : kind === 'choice'
            ? { id: newId(), type: 'choice', question: '', right: [''], wrong: ['', ''], ...(group && { group }) }
            : kind === 'sequence'
              ? { id: newId(), type: 'sequence', title: '', steps: ['', '', ''], ...(group && { group }) }
              : { id: newId(), term: '', definition: '', ...(sides && { sides }), ...(group && { group }) }
    pendingFocus.current = { card: card.id, field: firstField(card) }
    put([...cards, card])
  }

  // Focuses the first card of a section, or adds one when it is empty.
  const enterSection = (group?: string) => {
    const first = cards.find((c) => c.group === group)
    if (first) focusCard(first, firstField(first))
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
    if (group) setCollapsed(withCollapsed(collapsed, [group], false))
    put([...cards.filter((c) => c.id !== card.id), { ...card, group: group || undefined }])
  }

  // Enter in a card's last box (EditCard moves through its boxes) goes on to the next card in the same section,
  // or adds a card there.
  const advance = (card: Card) => {
    const section = cards.filter((c) => c.group === card.group)
    const next = section[section.indexOf(card) + 1]
    if (next) focusCell(next.id, firstField(next))
    else addCard(card.group, card.type ?? 'term')
  }

  // Blank cards are dropped and empty explanation fields closed, then groups left without cards.
  // Half-filled cards keep you here, with every error shown.
  const done = () => {
    const { cards: kept, groups: keptGroups, changed: tidied } = tidyCards(cards, groups)
    const firstBad = kept.findIndex((c) => missingPart(c))
    if (firstBad === -1) {
      if (tidied) put(kept, keptGroups)
      go({ name: 'quiz', course: course.name, quiz: quiz.name })
      return
    }
    setTriedDone(true)
    setNudge((n) => n + 1)
    notify('error', unfinishedMessage(kept)!)
    // Open every group that holds a half-filled card, so the red marks show.
    const flaggedGroups = kept.flatMap((c) => (c.group && missingPart(c) ? [c.group] : []))
    const target = { card: kept[firstBad].id, field: partField(kept[firstBad], missingPart(kept[firstBad])!) }
    if (tidied) {
      pendingFocus.current = target
      setCollapsed(withCollapsed(collapsed, flaggedGroups, false))
      put(kept, keptGroups)
    } else if (flaggedGroups.some((id) => collapsed.has(id))) {
      pendingFocus.current = target
      setCollapsed(withCollapsed(collapsed, flaggedGroups, false))
    } else {
      focusCell(target.card, target.field)
    }
  }

  // Blank rows are dropped so the new cards don't land after an empty one. A group the dialog just made is added.
  const importCards = (parsed: ParsedCard[], group?: Group) => {
    const kept = cards.filter((c) => !isBlank(c))
    const sides = lastSides(kept)
    const added: Card[] = parsed.map((p) => ({ id: newId(), ...p, ...(sides && { sides }), ...(group && { group: group.id }) }))
    if (group) setCollapsed(withCollapsed(collapsed, [group.id], false))
    put([...kept, ...added], group && !groups.some((g) => g.id === group.id) ? [...groups, group] : groups)
  }

  const renderCard = (card: Card) => (
    <EditCard
      key={card.id}
      card={card}
      index={cards.indexOf(card)}
      lib={lib}
      onPatch={(patch) => patchCard(card.id, patch)}
      editor={{
        groups,
        flagged: triedDone ? missingPart(card) : null,
        nudge,
        onMove: (group) => move(card, group),
        onDelete: () => put(cards.filter((c) => c.id !== card.id)),
        onAdvance: () => advance(card),
      }}
    />
  )

  const addRow = (group?: string) => <AddRow onAdd={(kind) => addCard(group, kind)} />

  return (
    <>
      {/* The outline hugs the editor; the screen-tall page body around it keeps the danger zone off screen. */}
      <div className="page-body">
        <div className="edit-frame">
          <PageHead
            title={
              <AutoText
                className="title-input"
                aria-label="Quiz name"
                required
                value={quiz.name}
                selectOnMount={created}
                check={(name) => nameTaken(name, course.quizzes.filter((q) => q.id !== quiz.id).map((q) => q.name), 'quiz in this course')}
                onChange={(name) => lib.renameQuiz(quiz.id, name)}
                onEnter={() => (cards.length > 0 ? focusCard(cards[0], firstField(cards[0])) : addCard())}
              />
            }
            sub={`${course.name} · ${plural(cards.length, 'card')}`}
            actions={
              <>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  title="Paste cards from Quizlet or a spreadsheet"
                  onClick={() => setImportOpen(true)}
                >
                  Import
                </button>
                <button type="button" className="primary" title="Exit editor" onClick={done}>
                  Done
                </button>
              </>
            }
          />

          {importOpen && <ImportDialog groups={groups} sides={lastSides(cards.filter((c) => !isBlank(c)))} onImport={importCards} onClose={() => setImportOpen(false)} />}

          <div ref={listRef} className="pairs">
            {sections(cards, groups).map(({ group, cards: members }) =>
              group ? (
                <section key={group.id} className={collapsed.has(group.id) ? 'group-box is-collapsed' : 'group-box'} data-color={group.color}>
                  <GroupHead
                    group={group}
                    count={members.length}
                    collapsed={collapsed.has(group.id)}
                    onToggle={() => setCollapsed(withCollapsed(collapsed, [group.id], !collapsed.has(group.id)))}
                    onPatch={(patch) => patchGroup(group.id, patch)}
                    onUngroup={() => ungroup(group.id)}
                    onEnter={() => enterSection(group.id)}
                  />
                  <div className="group-body">
                    <div>
                      {members.map(renderCard)}
                      {addRow(group.id)}
                    </div>
                  </div>
                </section>
              ) : (
                <Fragment key="ungrouped">
                  {members.map(renderCard)}
                  {addRow()}
                </Fragment>
              ),
            )}
            <div className="new-group">
              <AddPill onClick={addGroup}>New group</AddPill>
              <span className="muted">Multiple choice takes wrong answers from the same group first.</span>
            </div>
          </div>
          <EditOutline />
        </div>
      </div>

      <DangerZone
        label="Delete quiz"
        detail={`Deletes this quiz and its ${plural(cards.length, 'card')}. You can't undo this.`}
        question={`Delete "${quiz.name}" and its ${plural(cards.length, 'card')}?`}
        onDelete={() => {
          lib.deleteQuiz(quiz.id)
          go({ name: 'course', course: course.name })
        }}
      />
    </>
  )
}
