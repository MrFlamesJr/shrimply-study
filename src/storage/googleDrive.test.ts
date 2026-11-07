import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyLibrary } from '../model'
import { encodeLibrary } from './format'
import { DriveError, driveNow, problem, readDriveFile } from './googleDrive'

// Answers each fetch in turn: a status and a JSON body, or bytes for a download.
const answers = (...list: (Response | Error)[]) => {
  const fetch = vi.fn()
  for (const a of list) fetch.mockImplementationOnce(() => (a instanceof Error ? Promise.reject(a) : Promise.resolve(a)))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const error = (status: number, reason = '') => json({ error: { code: status, errors: [{ reason }] } }, status)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('problem', () => {
  it('says what went wrong in plain words', () => {
    expect(problem(404, 'notFound')).toMatch(/isn't shared with a link, or it was deleted/)
    expect(problem(401, 'authError')).toMatch(/sign-in ran out/)
    expect(problem(429, '')).toMatch(/busy/)
    expect(problem(403, 'downloadQuotaExceeded')).toMatch(/busy/)
    expect(problem(503, '')).toMatch(/having trouble/)
    expect(problem(403, 'forbidden')).toBe('Google Drive refused this (403).')
  })
})

describe('driveNow', () => {
  it("gives the file's checksum and its name now", async () => {
    answers(json({ md5Checksum: 'abc', name: 'Bio.shrimp' }))
    await expect(driveNow('f1')).resolves.toEqual({ md5: 'abc', name: 'Bio.shrimp', trashed: false })
  })

  it('says gone when the file is no longer shared or was deleted', async () => {
    answers(error(404, 'notFound'))
    await expect(driveNow('f1')).resolves.toBe('gone')
  })

  it('fails when Google can not be reached or is busy, so nothing is forgotten', async () => {
    answers(new TypeError('Failed to fetch'))
    await expect(driveNow('f1')).rejects.toThrow(/Couldn't reach Google Drive/)
    answers(error(403, 'rateLimitExceeded'))
    await expect(driveNow('f1')).rejects.toBeInstanceOf(DriveError)
  })
})

describe('readDriveFile', () => {
  it('reads a shared file without signing in', async () => {
    const fetch = answers(json({ name: 'Bio.shrimp', md5Checksum: 'abc' }), new Response(encodeLibrary(emptyLibrary()).slice()))
    const { library, source } = await readDriveFile('f1')
    expect(library.courses).toEqual([])
    expect(source).toEqual({ id: 'f1', name: 'Bio.shrimp', md5: 'abc', shared: true, mine: false, trashed: false })
    // Both with the key, never a sign-in.
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toMatch(/[?&]key=/)
      expect(init).toBeUndefined()
    }
  })

  it('turns down a Google Doc, which has no checksum', async () => {
    answers(json({ name: 'Notes' }))
    await expect(readDriveFile('f1')).rejects.toThrow(/not a Shrimply Study file/)
  })

  it('turns down a file that is no .shrimp', async () => {
    answers(json({ name: 'cat.png', md5Checksum: 'abc' }), new Response(new Uint8Array([1, 2, 3])))
    await expect(readDriveFile('f1')).rejects.toThrow()
  })

  it("says so when the file isn't shared", async () => {
    answers(error(404, 'notFound'))
    await expect(readDriveFile('f1')).rejects.toThrow(/isn't shared with a link/)
  })
})

describe('listDriveFiles', () => {
  it('reads every page, keeping only libraries', async () => {
    // Signed in in this tab: a fresh token, as kept over a reload.
    vi.resetModules()
    const kept = JSON.stringify({ token: { value: 't', until: Date.now() + 60_000 } })
    vi.stubGlobal('sessionStorage', { getItem: () => kept, setItem: () => undefined, removeItem: () => undefined })
    const { listDriveFiles } = await import('./googleDrive')
    const file = (id: string, name: string, mimeType = 'application/zip') => ({ id, name, mimeType, modifiedTime: '2026-11-07T12:00:00Z' })
    const fetch = answers(
      json({ files: [file('a', 'A.shrimp'), file('p', 'photo.png', 'image/png')], nextPageToken: 'next 2' }),
      json({ files: [file('b', 'Renamed')] }),
    )
    expect((await listDriveFiles()).map((f) => f.id)).toEqual(['a', 'b'])
    expect(fetch.mock.calls[1][0]).toContain('&pageToken=next%202')
  })
})
