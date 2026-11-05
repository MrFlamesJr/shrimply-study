import { GROUP_NAME_MAX, type Group } from '../../model'
import { plural } from '../../logic/plural'
import { AutoText } from '../../components/AutoText'
import { ColorPicker } from '../../components/ColorPicker'
import { ChevronDownIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'

type Props = {
  group: Group
  /** How many cards are in the group. */
  count: number
  collapsed: boolean
  onToggle: () => void
  onPatch: (patch: Partial<Group>) => void
  onUngroup: () => void
  /** Enter in the name: go to the group's first card. */
  onEnter: () => void
}

/** The top row of a group box: collapse chevron, color, name, card count and Ungroup. */
export function GroupHead({ group, count, collapsed, onToggle, onPatch, onUngroup, onEnter }: Props) {
  return (
    <div className="group-head">
      <IconButton
        className="group-toggle"
        label={collapsed ? 'Expand group' : 'Collapse group'}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <ChevronDownIcon />
      </IconButton>
      <ColorPicker value={group.color} onChange={(color) => onPatch({ color })} />
      <AutoText
        className="group-name"
        aria-label="Group name"
        required
        data-group-name={group.id}
        maxLength={GROUP_NAME_MAX}
        counter
        value={group.name}
        onChange={(name) => onPatch({ name })}
        onEnter={onEnter}
      />
      <span className="muted">{plural(count, 'card')}</span>
      <button
        type="button"
        className="quiet small"
        title="Remove the group. Its cards stay in the quiz."
        onClick={() => {
          if (confirm(`Remove the group "${group.name}"? Its cards stay in the quiz.`)) onUngroup()
        }}
      >
        Ungroup
      </button>
    </div>
  )
}
