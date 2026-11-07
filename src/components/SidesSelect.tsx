import { Fragment, useId, useState, type KeyboardEvent } from 'react'
import { SIDE_NAME_MAX, SIDE_PRESETS, type Sides } from '../model'
import { isPreset, samePair, sidePairs, sideTypeUses, toSides } from '../logic/sides'
import { plural } from '../logic/plural'
import type { LibraryApi } from '../state/useLibrary'
import { AutoText } from './AutoText'
import { askConfirm } from './ConfirmDialog'
import { IconButton } from './IconButton'
import { CheckIcon, ChevronDownIcon, PencilIcon, PlusIcon } from './Icons'
import { Modal, closeModal, goOnInDialog } from './Modal'

// What the naming dialog is for: its title, the names it starts with, what Save does, and (renaming) what Delete does.
type Naming = { title: string; start: Sides; onSave: (pair: Sides) => void; onDelete?: () => void }

const name = ([a, b]: Sides) => `${a} / ${b}`

/**
 * Names a term card's two sides: a button that pops out a menu of the presets and the library's own types.
 * Your own types can be renamed and deleted right there; "New type" adds one.
 */
export function SidesSelect({
  value,
  label,
  lib,
  onChange,
}: {
  value?: Sides
  /** The button's aria-label, before the current names. */
  label: string
  lib: LibraryApi
  onChange: (sides: Sides | undefined) => void
}) {
  const id = useId()
  const [naming, setNaming] = useState<Naming | null>(null)
  const current = value ?? SIDE_PRESETS[0]
  const close = () => document.getElementById(id)?.hidePopover()

  const pick = (pair: Sides) => {
    onChange(toSides(pair))
    close()
  }

  const create = () => {
    close()
    setNaming({
      title: 'New type',
      start: ['', ''],
      onSave: (pair) => {
        lib.addSideType(pair)
        onChange(toSides(pair))
      },
    })
  }

  const edit = (from: Sides) => {
    close()
    setNaming({ title: 'Edit type', start: from, onSave: (pair) => lib.renameSideType(from, pair), onDelete: () => void remove(from) })
  }

  const remove = async (pair: Sides) => {
    const n = sideTypeUses(lib.library, pair)
    const uses = n === 0 ? 'No card uses it.' : `${plural(n, 'card')} ${n === 1 ? 'uses' : 'use'} it and will go back to Front / Back.`
    if (await askConfirm(`Delete “${name(pair)}”? ${uses}`, 'Delete type', { danger: true })) lib.deleteSideType(pair)
  }

  // Up and Down move between the pick buttons and New type.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const stops = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-stop]')]
    const at = stops.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? at + 1 : at - 1
    stops[(next + stops.length) % stops.length]?.focus()
  }

  return (
    <>
      <button
        type="button"
        className="pair-kind sides-button"
        popoverTarget={id}
        aria-label={`${label}: ${name(current)}`}
        title="Name this card's sides"
      >
        {name(current)}
        <ChevronDownIcon />
      </button>
      <div
        id={id}
        popover="auto"
        className="sides-menu"
        onKeyDown={onKeyDown}
        onToggle={(e) => {
          if (e.newState === 'open') e.currentTarget.querySelector<HTMLElement>('[aria-current="true"]')?.focus()
        }}
      >
        {sidePairs(lib.library).map((pair) => (
          <div key={name(pair)} className="sides-row">
            <button
              type="button"
              className="sides-pick"
              data-stop
              aria-current={samePair(pair, current)}
              onClick={() => pick(pair)}
            >
              {name(pair)}
              {samePair(pair, current) && <CheckIcon />}
            </button>
            {!isPreset(pair) && (
              <IconButton label={`Edit ${name(pair)}`} title="Rename or delete this type" onClick={() => edit(pair)}>
                <PencilIcon />
              </IconButton>
            )}
          </div>
        ))}
        <button type="button" className="quiet sides-new" data-stop onClick={create}>
          <PlusIcon /> New type
        </button>
      </div>
      {naming && <NameDialog {...naming} onClose={() => setNaming(null)} />}
    </>
  )
}

function NameDialog({ title, start, onSave, onDelete, onClose }: Naming & { onClose: () => void }) {
  const [pair, setPair] = useState<Sides>(start)
  const set = (i: 0 | 1, value: string) => setPair(i === 0 ? [value, pair[1]] : [pair[0], value])
  const complete = pair[0].trim() !== '' && pair[1].trim() !== ''
  return (
    <Modal title={title} compact onClose={onClose}>
      <div className="name-pair">
        {(['Front', 'Back'] as const).map((side, i) => (
          <Fragment key={side}>
            {i === 1 && (
              <span className="muted" aria-hidden="true">
                /
              </span>
            )}
            <AutoText
              aria-label={`${side} name`}
              label={side}
              required
              maxLength={SIDE_NAME_MAX}
              counter
              value={pair[i]}
              onChange={(value) => set(i as 0 | 1, value)}
              onEnter={goOnInDialog}
            />
          </Fragment>
        ))}
      </div>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!complete}
          onClick={(e) => {
            onSave([pair[0].trim(), pair[1].trim()])
            closeModal(e.currentTarget)
          }}
        >
          Save
        </button>
        <button type="button" onClick={(e) => closeModal(e.currentTarget)}>
          Cancel
        </button>
        {onDelete && (
          // Asks first (how many cards use it), after this dialog has closed.
          <button
            type="button"
            className="danger actions-end"
            onClick={(e) => {
              closeModal(e.currentTarget)
              onDelete()
            }}
          >
            Delete type
          </button>
        )}
      </div>
    </Modal>
  )
}
