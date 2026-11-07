import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { AutoText } from './AutoText'
import { CheckIcon, CrossIcon, PlusIcon } from './Icons'
import { ImageSlot } from './ImageSlot'

type List = 'right' | 'wrong'

type Props = Omit<ComponentProps<typeof AutoText>, 'value' | 'onChange' | 'placeholder' | 'label'> & {
  question: string
  right: string[]
  wrong: string[]
  onQuestion: (question: string) => void
  onList: (list: List, entries: string[]) => void
  /** The card's id: every answer gets `data-card` and `data-field="right-0"`, `"wrong-1"`, … so the editor can focus it. */
  cardId?: string
  /** The question box's label in place of the plain "Question" (the editor's, which says what is missing). */
  hint?: ReactNode
  /** The heading of each list, in place of the plain one (the editor marks what is missing there). */
  rightHint?: ReactNode
  wrongHint?: ReactNode
  /** The card's image, beside the question box. */
  image: Omit<ComponentProps<typeof ImageSlot>, 'children'>
}

const LISTS = {
  right: { title: 'Right answers', add: 'Right answer', Icon: CheckIcon, tone: 'is-ok' },
  wrong: { title: 'Wrong answers', add: 'Wrong answer', Icon: CrossIcon, tone: 'is-bad' },
} as const

/** The choice-question editor: the question with its image, then a list of right answers and a list of wrong ones,
 * side by side where there is room. */
export function ChoiceField({ question, right, wrong, onQuestion, onList, cardId, hint, rightHint, wrongHint, image, ...rest }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  // The answer to focus once the list has re-rendered (a new one, or the one before a removed one).
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (!pending.current) return
    wrap.current?.querySelector<HTMLElement>(`[data-entry="${pending.current}"]`)?.focus()
    pending.current = null
  })

  // An empty list still shows one empty answer to type in.
  const shown = { right: right.length ? right : [''], wrong: wrong.length ? wrong : [''] }
  const hints = { right: rightHint, wrong: wrongHint }

  const set = (list: List, i: number, value: string) => onList(list, shown[list].map((x, j) => (j === i ? value : x)))
  const add = (list: List) => {
    pending.current = `${list}-${shown[list].length}`
    onList(list, [...shown[list], ''])
  }
  const remove = (list: List, i: number) => {
    pending.current = `${list}-${Math.max(0, i - 1)}`
    onList(list, shown[list].filter((_, j) => j !== i))
  }
  // Enter goes on to the next box (the card or dialog around moves the focus, see AutoText). In a list's last answer
  // it adds one instead; in an empty last answer it leaves the list, and that empty answer goes (one always shows).
  const enter = (e: KeyboardEvent<HTMLTextAreaElement>, list: List, i: number) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || i < shown[list].length - 1) return
    if (shown[list][i].trim()) {
      e.preventDefault()
      add(list)
    } else {
      setLeft(list)
    }
  }
  // The empty answer goes after the render, so it builds on what the same Enter did around it (the editor adds a card).
  const [left, setLeft] = useState<List | null>(null)
  useEffect(() => {
    if (!left) return
    setLeft(null)
    const entries = shown[left]
    if (entries.length > 1 && !entries[entries.length - 1].trim()) onList(left, entries.slice(0, -1))
  }, [left])

  return (
    <div className="choice-field" ref={wrap}>
      <ImageSlot {...image}>
        <AutoText {...rest} label={hint ?? 'Question'} value={question} onChange={onQuestion} />
      </ImageSlot>
      <div className="choice-lists">
        {(['right', 'wrong'] as const).map((list) => {
          const { title, add: addLabel, Icon, tone } = LISTS[list]
          return (
            <div key={list} className="entry-list choice-list">
              <div className={`entry-label ${tone}`}>
                <Icon />
                {hints[list] ?? <span className="field-hint">{title}</span>}
              </div>
              {shown[list].map((text, i) => (
                <div key={i} className="entry">
                  <span className="entry-number" aria-hidden="true">
                    {i + 1}.
                  </span>
                  <AutoText
                    aria-label={`${LISTS[list].add} ${i + 1}`}
                    data-card={cardId}
                    data-field={`${list}-${i}`}
                    data-entry={`${list}-${i}`}
                    value={text}
                    onChange={(value) => set(list, i, value)}
                    onBlur={() => text !== text.trim() && set(list, i, text.trim())}
                    onKeyDown={(e) => enter(e, list, i)}
                    // A choice question needs a right and a wrong answer, so a list's last one can not go.
                    erase={{ label: 'Remove answer', onErase: () => remove(list, i), off: shown[list].length <= 1 }}
                  />
                </div>
              ))}
              <button type="button" className="quiet small entry-add" onClick={() => add(list)}>
                <PlusIcon /> {addLabel}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
