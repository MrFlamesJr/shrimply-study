import { describe, expect, it } from 'vitest'
import { causeText, pushToast, toastDetail, type Toast, type ToastKind } from './pushToast'

const toast = (id: string, text = id, kind: ToastKind = 'info', detail: string[] = []): Toast => ({ id, kind, text, detail, ms: 1000 })
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
  it('stacks the same text with a different detail, replaces the same detail', () => {
    expect(ids(pushToast([toast('a', 'x', 'info', ['from A'])], toast('b', 'x', 'info', ['from B'])))).toEqual(['a', 'b'])
    expect(ids(pushToast([toast('a', 'x', 'info', ['from A'])], toast('b', 'x', 'info', ['from A'])))).toEqual(['b'])
  })
  it('keeps the action of the toast it adds', () => {
    const action = { label: 'Undo', run: () => {} }
    expect(pushToast([toast('a')], { ...toast('b'), action })[1].action).toBe(action)
  })
})

describe('causeText', () => {
  it('reads a string as it is', () => expect(causeText('Disk is busy')).toBe('Disk is busy'))
  it("prefers an object's original", () => expect(causeText({ original: '503 backendError: down', message: 'x' })).toBe('503 backendError: down'))
  it('writes an Error as Name: message, leaving a plain Error name out', () => {
    expect(causeText(new TypeError('Failed to fetch'))).toBe('TypeError: Failed to fetch')
    expect(causeText(new Error('Nope'))).toBe('Nope')
  })
  it('reads a DOMException by its name and message', () => expect(causeText({ name: 'NotAllowedError', message: 'Denied' })).toBe('NotAllowedError: Denied'))
  it('gives null for nothing to say', () => {
    for (const none of [undefined, null, '', '  ', new Error(''), 42, {}]) expect(causeText(none)).toBeNull()
  })
})

describe('toastDetail', () => {
  it('drops empty and false lines and trims', () =>
    expect(toastDetail('t', { detail: [' one ', false, null, undefined, '', 'two'] })).toEqual(['one', 'two']))
  it('takes a single string', () => expect(toastDetail('t', { detail: 'only' })).toEqual(['only']))
  it('puts the original error last', () =>
    expect(toastDetail('t', { detail: 'why', cause: new TypeError('Failed to fetch') })).toEqual(['why', 'Original error: TypeError: Failed to fetch']))
  it('leaves the original error out when null or already said', () => {
    expect(toastDetail('t', { cause: new Error('') })).toEqual([])
    expect(toastDetail('Disk is busy', { cause: new Error('Disk is busy') })).toEqual([])
    expect(toastDetail('t', { detail: 'Disk is busy.', cause: 'Disk is busy' })).toEqual(['Disk is busy.'])
  })
  it('is empty with nothing given', () => expect(toastDetail('t')).toEqual([]))
})
