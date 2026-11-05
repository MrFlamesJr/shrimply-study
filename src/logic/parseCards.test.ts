import { describe, expect, it } from 'vitest'
import { parseCards } from './parseCards'

describe('parseCards', () => {
  it('parses tab format', () => {
    expect(parseCards('cat\tchat\ndog\tchien')).toEqual([
      { term: 'cat', definition: 'chat' },
      { term: 'dog', definition: 'chien' },
    ])
  })

  it('parses dash format', () => {
    expect(parseCards('cat - chat\ndog - chien')).toEqual([
      { term: 'cat', definition: 'chat' },
      { term: 'dog', definition: 'chien' },
    ])
  })

  it('skips blank lines', () => {
    expect(parseCards('cat - chat\n\n  \ndog - chien')).toHaveLength(2)
  })

  it('handles CRLF', () => {
    expect(parseCards('cat\tchat\r\ndog\tchien\r\n')).toEqual([
      { term: 'cat', definition: 'chat' },
      { term: 'dog', definition: 'chien' },
    ])
  })

  it('joins a definition that spans two lines', () => {
    expect(parseCards('cat\tchat\nrun\tto move fast\non foot\ndog\tchien')).toEqual([
      { term: 'cat', definition: 'chat' },
      { term: 'run', definition: 'to move fast\non foot' },
      { term: 'dog', definition: 'chien' },
    ])
  })

  it('treats a dash line without a tab as a continuation in tab mode', () => {
    expect(parseCards('cat\tchat\nsmall - furry')).toEqual([{ term: 'cat', definition: 'chat\nsmall - furry' }])
  })
})
