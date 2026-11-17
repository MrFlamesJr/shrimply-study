/** What a sign-in keeps: its token and account, or `signedOut` for a tab that chose to be signed out. */
export type Kept<T> = { token?: T; account?: string; signedOut?: boolean }

/**
 * How a tab starts (asked for): with its own sign-in when it has one (kept in its session storage, so a reload keeps
 * it), else with the account chosen last in any tab, which it then keeps as its own (`copy`: write it to the tab's
 * key), so a later switch or sign-out elsewhere never reaches it. With neither, it starts signed out, and stays so.
 */
export function startSession<T>(tab: Kept<T> | null, last: Kept<T> | null): { session: Kept<T>; copy: boolean } {
  if (tab) return { session: tab, copy: false }
  if (last && !last.signedOut && (last.token || last.account)) return { session: last, copy: true }
  return { session: {}, copy: true }
}

/** What the last-chosen key becomes after a write: the new value, null to remove it, undefined to leave it. `choose`: an explicit sign-in or switch. `renew`: only when it already holds this account. `out`: removes it when it holds the account signed out (`now`). */
export function lastAfter<T>(mode: 'choose' | 'renew' | 'out', now: Kept<T>, last: Kept<T> | null): Kept<T> | null | undefined {
  const same = !!last && !!now.account && last.account === now.account
  if (mode === 'choose') return now
  if (mode === 'renew') return same ? now : undefined
  return same ? null : undefined
}
