import { memo, type RefObject } from 'react'
import type { Card, Group } from '../../model'
import type { missingPart } from '../../logic/cardStatus'
import type { LibraryApi } from '../../state/useWorkspace'
import { EditCard, type CardPatch } from '../../components/EditCard'
import { useSortableCard } from './SortableCard'

/** What a card does to the quiz; EditScreen keeps the latest of these in a ref, so a card's props stay the same until it changes itself. */
export type CardActions = {
  patch: (id: string, patch: CardPatch) => void
  remove: (id: string) => void
  move: (card: Card, group: string) => void
  advance: (card: Card) => void
  shift: (card: Card, by: -1 | 1) => void
}

type Props = {
  card: Card
  index: number
  groups: Group[]
  lib: LibraryApi
  flagged: ReturnType<typeof missingPart>
  nudge: number
  actions: RefObject<CardActions>
}

/**
 * One card of the editor's list. Memoized: typing in a card, or moving one, renders only the cards whose own props
 * changed, not all of a 2000-card quiz.
 */
export const EditorCard = memo(function EditorCard({ card, index, groups, lib, flagged, nudge, actions }: Props) {
  const sortable = useSortableCard(card.id, index + 1)
  return (
    <EditCard
      card={card}
      index={index}
      lib={lib}
      onPatch={(patch) => actions.current.patch(card.id, patch)}
      onDelete={() => actions.current.remove(card.id)}
      editor={{
        groups,
        flagged,
        nudge,
        onMove: (group) => actions.current.move(card, group),
        onAdvance: () => actions.current.advance(card),
        onShift: (by) => actions.current.shift(card, by),
        sortable,
      }}
    />
  )
})
