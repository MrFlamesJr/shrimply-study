import type { ComponentProps, ReactNode } from 'react'
import { AutoText } from './AutoText'
import { ImageSlot } from './ImageSlot'
import { Segmented } from './Segmented'

type Props = Omit<ComponentProps<typeof AutoText>, 'value' | 'onChange' | 'placeholder' | 'label'> & {
  statement: string
  answer: boolean
  onStatement: (statement: string) => void
  onAnswer: (answer: boolean) => void
  /** The statement box's label in place of the plain "Statement" (the editor's, which says what is missing). */
  hint?: ReactNode
  /** The card's image, beside the statement box. */
  image: Omit<ComponentProps<typeof ImageSlot>, 'children'>
}

/** The true-or-false editor: the statement with its image, and the right answer. */
export function TrueFalseField({ statement, answer, onStatement, onAnswer, hint, image, ...rest }: Props) {
  return (
    <div className="tf-field">
      <ImageSlot {...image}>
        <AutoText {...rest} label={hint ?? 'Statement'} value={statement} onChange={onStatement} />
      </ImageSlot>
      <Segmented
        label="Answer"
        options={[
          { value: true, label: 'True' },
          { value: false, label: 'False' },
        ]}
        value={answer}
        onChange={onAnswer}
      />
    </div>
  )
}
