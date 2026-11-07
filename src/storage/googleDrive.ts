import type { Library } from '../model'
import { decodeLibrary, encodeLibrary } from './format'

// Google Drive, the only file that talks to Google. Two ways in:
// - Reading a shared file needs no sign-in: the API key reads any file set to "Anyone with the link".
// - Saving signs in with Google (a popup) for the `drive.file` permission only: the app can see and change only
//   the files it created in that person's Drive. Google enforces it, so nobody can save to someone else's file.
// Both values are public by design: the key only works from this site and only for the Drive API, and the
// client ID only asks Google to sign someone in. Empty until Google Drive is set up (Google Cloud console).
const CLIENT_ID: string = '585408959557-dr5tq8git1pr3s9avl72finqn5f9tnod.apps.googleusercontent.com'
const API_KEY: string = 'AIzaSyBPV4pS4Dz6BJvPDPvw7k_FHIVeh17Bbqg'

/** False until the client ID and key above are filled in. */
export const driveSetUp = CLIENT_ID !== '' && API_KEY !== ''

/**
 * The Drive file a library came from or was saved to. `md5` is its content as this browser last saw it (Drive's
 * checksum, so renaming or sharing the file is no change). `shared`: set to "Anyone with the link", so its
 * updates can be checked without signing in. `mine`: the user's own file as far as this browser knows (made or
 * opened from their Drive here, or Google said so), which shows the top row's Save to Drive; every save still asks
 * Google. `trashed`: in its owner's bin on Google Drive, as last seen. It still opens by its link until it is deleted
 * for good (after 30 days), so it keeps working here, with a warning.
 */
export type DriveSource = { id: string; name: string; md5: string; shared: boolean; mine: boolean; trashed: boolean }

/** A library in the signed-in user's Drive. */
export type DriveFile = { id: string; name: string; modified: string }

const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TYPE = 'application/zip'

/** An error to show as is. `status` is the HTTP status, 0 when Google was not reached; `reason` is Google's. */
export class DriveError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly reason = '',
  ) {
    super(message)
  }
}

/** The sign-in popup was closed: nothing to report. */
export class SignInClosed extends Error {}

const BUSY = ['rateLimitExceeded', 'userRateLimitExceeded', 'downloadQuotaExceeded', 'sharingRateLimitExceeded']
const busy = (status: number, reason: string) => status === 429 || BUSY.includes(reason)

/** Google's answer to a failed request, in plain words. */
export function problem(status: number, reason: string): string {
  if (busy(status, reason)) return 'Google Drive is busy. Try again in a few minutes.'
  if (status === 404) return "This file isn't shared with a link, or it was deleted."
  if (status === 401) return 'Your Google sign-in ran out. Try again.'
  if (status >= 500) return 'Google Drive is having trouble. Try again later.'
  return `Google Drive refused this (${status}).`
}

/** Not this user's to read or change (not a rate limit): the app can't see files it didn't create for them. */
const refused = (err: unknown) =>
  err instanceof DriveError && (err.status === 404 || (err.status === 403 && !busy(err.status, err.reason)))

async function call(url: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch {
    throw new DriveError("Couldn't reach Google Drive. Check your connection.")
  }
  if (response.ok) return response
  const body = await response.json().catch(() => undefined)
  const reason = String(body?.error?.errors?.[0]?.reason ?? '')
  throw new DriveError(problem(response.status, reason), response.status, reason)
}

const withKey = (url: string) => call(`${url}${url.includes('?') ? '&' : '?'}key=${API_KEY}`)

// Google's sign-in script (Google Identity Services), loaded on first need. Not in TypeScript's DOM types.
type TokenResponse = { access_token?: string; expires_in?: number }
type TokenClient = { requestAccessToken(override?: { prompt?: string; login_hint?: string }): void }
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback: (error: { type: string }) => void
          }): TokenClient
          hasGrantedAllScopes(response: TokenResponse, scope: string): boolean
        }
      }
      picker?: PickerApi
    }
    gapi?: { load(name: string, callback: () => void): void }
  }
}
// Google's file picker (its builder calls chain). Not in TypeScript's DOM types.
type Chain = { [method: string]: (...args: unknown[]) => Chain }
type PickerApi = {
  DocsView: new (viewId: string) => Chain
  PickerBuilder: new () => Chain
  ViewId: { DOCS: string }
  DocsViewMode: { LIST: string }
  Feature: { MULTISELECT_ENABLED: string }
  Action: { PICKED: string; CANCEL: string }
}

let script: Promise<void> | undefined

/** Loads the sign-in script. The Drive dialog calls it as it opens, so a click can open the sign-in popup at once. */
export function prepareSignIn(): Promise<void> {
  script ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = 'https://accounts.google.com/gsi/client'
    tag.async = true
    tag.onload = () => resolve()
    tag.onerror = () => {
      script = undefined
      tag.remove()
      reject(new DriveError("Couldn't reach Google. Check your connection."))
    }
    document.head.append(tag)
  })
  return script
}

// Each tab signs in on its own, so two tabs can use two Google accounts (asked for), and a reload keeps it (asked for):
// it is kept in this tab's session storage, which other tabs don't share and which is gone when the tab closes. The
// token lasts about an hour; after that the tab stays signed in and the next action renews it for the same account.
type Token = { value: string; until: number }
const SESSION_KEY = 'shrimply-google-sign-in'
const fresh = (t: unknown): t is Token =>
  typeof (t as Token)?.value === 'string' && typeof (t as Token)?.until === 'number' && (t as Token).until > Date.now()
// What this tab kept from before a reload; nothing when blocked or unreadable (then it simply signs in again).
function readSession(): { token?: Token; account?: string } {
  try {
    const kept = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}')
    return { token: fresh(kept.token) ? kept.token : undefined, account: typeof kept.account === 'string' ? kept.account : undefined }
  } catch {
    return {}
  }
}
function keepSession() {
  try {
    if (token || account) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, account }))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Blocked: the sign-in still works, it just won't outlive a reload.
  }
}
const kept = readSession()
let token: Token | undefined = kept.token
let client: TokenClient | undefined
// This tab's account, once known: renewing the sign-in asks Google for it again instead of offering a choice.
let account: string | undefined = kept.account

/** Signs out in this tab only: other tabs keep their own sign-in, and the next sign-in here offers the account choice. */
export function signOut(): void {
  token = undefined
  account = undefined
  keepSession()
}

let pending: { resolve(token: string): void; reject(err: Error): void } | undefined

/** Signed in in this tab: its account is known (renewed on the next action once its hour is up), or a token is fresh. */
export const signedIn = () => !!account || fresh(token)
/** A token that works right now, without asking Google (a popup) for a new one. */
export const hasFreshToken = () => fresh(token)

/** The signed-in user's access token. Asks Google for one (a popup) when there is none or it ran out. */
export async function signIn(): Promise<string> {
  if (token && token.until > Date.now()) return token.value
  await prepareSignIn()
  client ??= window.google!.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      const done = pending
      pending = undefined
      if (!response.access_token || !window.google!.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
        done?.reject(new DriveError('Shrimply Study needs to use your Google Drive. Sign in again and keep that box checked.'))
        return
      }
      // A minute early, so a token never runs out halfway through an upload.
      token = { value: response.access_token, until: Date.now() + ((response.expires_in ?? 3600) - 60) * 1000 }
      keepSession()
      // Which account it is, kept with it, so a renewal (after a reload too) stays with it.
      if (!account) void accountEmail().catch(() => undefined)
      done?.resolve(response.access_token)
    },
    error_callback: (error) => {
      const done = pending
      pending = undefined
      done?.reject(
        error.type === 'popup_failed_to_open'
          ? new DriveError('Allow pop-ups for this site to sign in with Google.')
          : new SignInClosed(),
      )
    },
  })
  return new Promise((resolve, reject) => {
    pending?.reject(new SignInClosed())
    pending = { resolve, reject }
    // First sign-in in this tab: the account choice. Renewing: the same account, without asking.
    client!.requestAccessToken(account ? { prompt: '', login_hint: account } : { prompt: 'select_account' })
  })
}

// Google's file picker (asked for): where the user picks .shrimp files the app didn't save itself (uploaded, copied in
// Drive, sent by someone). Google shows the whole Drive in its own window; the app gets only the files picked, from
// then on like the ones it saved. Its script loads on first use. The app ID is the Cloud project number, the client
// ID's first part.
const APP_ID = CLIENT_ID.split('-')[0]
let pickerScript: Promise<void> | undefined
function loadPicker(): Promise<void> {
  pickerScript ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = 'https://apis.google.com/js/api.js'
    tag.async = true
    tag.onload = () => window.gapi!.load('picker', () => resolve())
    tag.onerror = () => {
      pickerScript = undefined
      tag.remove()
      reject(new DriveError("Couldn't reach Google. Check your connection."))
    }
    document.head.append(tag)
  })
  return pickerScript
}

/** Google's picker on a search for .shrimp, several files at once. Resolves the picked files' ids (none when closed). */
export async function pickDriveFiles(): Promise<{ id: string; name: string }[]> {
  const value = await signIn()
  await loadPicker()
  const picker = window.google!.picker!
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS).setQuery('.shrimp').setIncludeFolders(false).setMode(picker.DocsViewMode.LIST)
    new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setTitle('Choose .shrimp files')
      .setOAuthToken(value)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setCallback((data: unknown) => {
        const { action, docs } = data as { action: string; docs?: { id: string; name: string }[] }
        if (action === picker.Action.PICKED) resolve((docs ?? []).map(({ id, name }) => ({ id, name })))
        else if (action === picker.Action.CANCEL) resolve([])
      })
      .build()
      .setVisible(true)
  })
}

/** The signed-in Google account's email address. */
export async function accountEmail(): Promise<string> {
  const { user } = await (await withToken('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')).json()
  account = typeof user?.emailAddress === 'string' ? user.emailAddress : undefined
  keepSession()
  return account ?? ''
}

async function withToken(url: string, init: RequestInit = {}): Promise<Response> {
  const value = await signIn()
  try {
    return await call(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${value}` } })
  } catch (err) {
    if (err instanceof DriveError && err.status === 401) {
      token = undefined
      keepSession()
    }
    throw err
  }
}

// What is written must open again, as Download checks too. The error names the spot.
function checkedBytes(library: Library) {
  const bytes = encodeLibrary(library)
  decodeLibrary(bytes)
  return bytes.slice()
}

/**
 * A file's library. `own` reads it signed in (a file in your Drive, shared or not); otherwise with the key, so it
 * must be set to "Anyone with the link".
 */
export async function readDriveFile(id: string, own = false): Promise<{ library: Library; source: DriveSource }> {
  const get = own ? withToken : withKey
  const path = `${API}/${encodeURIComponent(id)}`
  // The checksum first: should the file change in between, the next check asks once too often, never too few.
  const meta = await (await get(`${path}?fields=name,md5Checksum,trashed`)).json()
  // Google Docs, Sheets and Slides have no checksum, and are no .shrimp.
  if (typeof meta.md5Checksum !== 'string') throw new DriveError('This is not a Shrimply Study file (.shrimp).')
  const bytes = new Uint8Array(await (await get(`${path}?alt=media`)).arrayBuffer())
  return { library: decodeLibrary(bytes), source: { id, name: meta.name, md5: meta.md5Checksum, shared: !own, mine: own, trashed: meta.trashed === true } }
}

/** A shared file's checksum and name now (renamed in Drive, it keeps its id), `gone` when it is no longer shared or was deleted. */
export async function driveNow(id: string): Promise<{ md5: string; name: string; trashed: boolean } | 'gone'> {
  try {
    const meta = await (await withKey(`${API}/${encodeURIComponent(id)}?fields=md5Checksum,name,trashed`)).json()
    return typeof meta.md5Checksum === 'string' ? { md5: meta.md5Checksum, name: meta.name, trashed: meta.trashed === true } : 'gone'
  } catch (err) {
    if (err instanceof DriveError && err.status === 404) return 'gone'
    throw err
  }
}

/**
 * Whether the signed-in user can save to the file, and its checksum and name now (renamed in Drive, it keeps its id).
 * Someone else's file is never theirs to save.
 */
export async function ownFile(id: string): Promise<{ canEdit: boolean; md5?: string; name?: string; trashed?: boolean }> {
  try {
    const meta = await (await withToken(`${API}/${encodeURIComponent(id)}?fields=md5Checksum,name,trashed,capabilities/canEdit`)).json()
    return { canEdit: meta.capabilities?.canEdit === true, md5: meta.md5Checksum, name: meta.name, trashed: meta.trashed === true }
  } catch (err) {
    if (refused(err)) return { canEdit: false }
    throw err
  }
}

const notYours = () => new DriveError('This file belongs to someone else. Save a copy to your Drive instead.')

const FOLDER = 'Shrimply Study'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'

// The "Shrimply Study" folder new libraries go in, made the first time. Looked up on every save, not remembered, so a
// folder moved to the bin or another account signing in never leaves a stale one. With `drive.file` the app only
// finds a folder it made itself.
async function appFolder(): Promise<string> {
  const q = encodeURIComponent(`mimeType = '${FOLDER_TYPE}' and name = '${FOLDER}' and trashed = false`)
  const { files } = await (await withToken(`${API}?q=${q}&fields=files(id)&pageSize=1`)).json()
  if (typeof files?.[0]?.id === 'string') return files[0].id
  const made = await withToken(`${API}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: FOLDER_TYPE }),
  })
  return (await made.json()).id
}

export const isLibraryName = (name: string) => name.toLowerCase().endsWith('.shrimp')

/** Saves the library as a new file in the signed-in user's Drive, in the "Shrimply Study" folder. */
export async function createDriveFile(library: Library, name: string): Promise<DriveSource> {
  const fileName = name.toLowerCase().endsWith('.shrimp') ? name : `${name}.shrimp`
  const bytes = checkedBytes(library)
  const metadata = { name: fileName, mimeType: TYPE, parents: [await appFolder()] }
  const body = new FormData()
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  body.append('file', new Blob([bytes], { type: TYPE }))
  const meta = await (await withToken(`${UPLOAD}?uploadType=multipart&fields=id,name,md5Checksum`, { method: 'POST', body })).json()
  return { id: meta.id, name: meta.name, md5: meta.md5Checksum, shared: false, mine: true, trashed: false }
}

/** Replaces the file's content with the library; resolves with its new checksum. */
export async function updateDriveFile(id: string, library: Library): Promise<string> {
  try {
    const url = `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=md5Checksum`
    const response = await withToken(url, { method: 'PATCH', headers: { 'Content-Type': TYPE }, body: checkedBytes(library) })
    return (await response.json()).md5Checksum
  } catch (err) {
    throw refused(err) ? notYours() : err
  }
}

/** Moves the file to the bin in the signed-in user's Drive (Google keeps it there for 30 days). */
export async function trashDriveFile(id: string): Promise<void> {
  try {
    await withToken(`${API}/${encodeURIComponent(id)}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  } catch (err) {
    throw refused(err) ? notYours() : err
  }
}

/** Sets the file to "Anyone with the link can view". */
export async function shareDriveFile(id: string): Promise<void> {
  try {
    await withToken(`${API}/${encodeURIComponent(id)}/permissions?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    })
  } catch (err) {
    if (refused(err) && (err as DriveError).status === 403) {
      throw new DriveError("Your Google account doesn't allow sharing with a link (school accounts often don't). A personal Google account works.", 403)
    }
    throw err
  }
}

/**
 * The libraries the app can see in the signed-in user's Drive, newest first, in whatever folder they are now (moving
 * one keeps it here): the ones it saved, and the ones picked with `pickDriveFiles`. With `drive.file` Google shows it
 * nothing else, so a file uploaded or copied by hand appears only once picked.
 */
export async function listDriveFiles(): Promise<DriveFile[]> {
  const q = encodeURIComponent(`trashed = false and mimeType != '${FOLDER_TYPE}'`)
  const url = `${API}?q=${q}&orderBy=modifiedTime%20desc&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,modifiedTime)`
  // Google answers a page at a time: every page, so no library is left out.
  let files: { id: string; name: string; mimeType: string; modifiedTime: string }[] = []
  let page: string | undefined
  do {
    const answer = await (await withToken(page ? `${url}&pageToken=${encodeURIComponent(page)}` : url)).json()
    files = files.concat(answer.files ?? [])
    page = answer.nextPageToken
  } while (page)
  return files
    // Libraries only: a .shrimp name, or the type the app saves with (one it saved, then renamed in Drive). Something
    // else picked by mistake (a photo) stays out of the list.
    .filter((f) => isLibraryName(f.name) || f.mimeType === TYPE)
    .map((f) => ({ id: f.id, name: f.name, modified: f.modifiedTime }))
}
