import { describe, expect, it } from 'vitest'
import { pushToast, type Toast, type ToastKind } from './pushToast'

const toast = (id: string, text = id, kind: ToastKind = 'info'): Toast => ({ id, kind, text, ms: 1000 })
const ids = (list: Toast[]) => list.map((t) => t.id)

describe('pushToast', () => {
  it('appends to the end', () => expect(ids(pushToast([toast('a')], toast('b')))).toEqual(['a', 'b']))
  it('replaces a toast with the same kind and text and moves it to the end', () =>
    expect(ids(pushToast([toast('a', 'x'), toast('b')], toast('c', 'x')))).toEqual(['b', 'c']))
  it('stacks the same text with a different kind', () =>
    expect(ids(pushToast([toast('a', 'x', 'info')], toast('b', 'x', 'error')))).toEqual(['a', 'b']))
  it('never drops distinct toasts', () => {
    let list: Toast[] = []
    for (let i = 0; i < 20; i++) list = pushToast(list, toast(String(i)))
    expect(list).toHaveLength(20)
  })
})
