import { useId, useRef, useState, type ReactNode } from 'react'
import { GROUP_NAME_MAX, newId, type Group, type Sides } from '../model'
import { parseCards, type ParsedCard } from '../logic/parseCards'
import { sideNames } from '../logic/sides'
import { nextColor } from '../logic/groups'
import { plural } from '../logic/plural'
import { AutoText } from './AutoText'
import { PlusIcon } from './Icons'
import { Modal, closeModal } from './Modal'

// The "+ New group" choice. The others are '' (no group) and the group ids.
const NEW = '+new'

/** Paste import. Every place the cards can go is one click: no group, a group, or a new group named right there. */
export function ImportDialog({
  groups,
  sides,
  onImport,
  onClose,
}: {
  groups: Group[]
  /** The names the new cards will get (default Front and Back). */
  sides?: Sides
  onImport: (parsed: ParsedCard[], group?: Group) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [target, setTarget] = useState('')
  const [name, setName] = useState('')
  const addButton = useRef<HTMLButtonElement>(null)
  const radios = useId()
  const parsed = parseCards(text)
  const names = sideNames({ sides })
  const chosen = groups.find((g) => g.id === target)
  const newName = name.trim() || 'New group'
  const where = target === NEW ? newName : chosen?.name

  const submit = (button: Element) => {
    onImport(parsed, target === NEW ? { id: newId(), name: newName, color: nextColor(groups) } : chosen)
    closeModal(button)
  }

  const choice = (value: string, label: ReactNode, color?: string) => (
    <label key={value} className="chip" data-color={color}>
      <input type="radio" name={radios} checked={target === value} onChange={() => setTarget(value)} />
      {value !== NEW && <span className="swatch" aria-hidden="true" />}
      {label}
    </label>
  )

  return (
    <Modal title="Import cards" onClose={onClose}>
      <p className="muted">
        From Quizlet: open the set, choose ⋯ &gt; Export, keep Tab and New line, choose Copy text, then paste here.
        Spreadsheet rows and "term - definition" lines also work.
      </p>
      <div className="import-grid">
        <textarea
          className="import-text"
          aria-label="Text to import"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {parsed.length > 0 ? (
          <div className="preview">
            <table>
              <thead>
                <tr>
                  <th>{names.term}</th>
                  <th>{names.definition}</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((p, i) => (
                  <tr key={i}>
                    <td>{p.term}</td>
                    <td>{p.definition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Paste text to see a preview.</p>
        )}
      </div>
      <div>
        <span id={`${radios}-label`} className="chips-label">
          Add to
        </span>
        <div role="radiogroup" aria-labelledby={`${radios}-label`} className="chips">
          {choice('', 'No group')}
          {groups.map((g) => choice(g.id, g.name, g.color))}
          {choice(
            NEW,
            <>
              <PlusIcon /> New group
            </>,
          )}
          {target === NEW && (
            <AutoText
              className="import-group-name"
              aria-label="New group name"
              placeholder="Group name"
              maxLength={GROUP_NAME_MAX}
              counter
              selectOnMount
              value={name}
              onChange={setName}
              onEnter={() => addButton.current?.click()}
            />
          )}
        </div>
      </div>
      <div className="actions">
        <button
          ref={addButton}
          type="button"
          className="primary import-add"
          disabled={parsed.length === 0}
          onClick={(e) => submit(e.currentTarget)}
        >
          Add {plural(parsed.length, 'card')}
          {where && ` to ${where}`}
        </button>
        <button type="button" onClick={(e) => closeModal(e.currentTarget)}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
