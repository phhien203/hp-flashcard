/** The part of a loaded Clerk instance that mints session tokens. */
export interface ClerkSessions {
  readonly session:
    | {
        readonly user: { readonly id: string } | null
        getToken: () => Promise<string | null>
      }
    | null
    | undefined
}

/**
 * A session token for `userId`'s account, or `null` once that account is no
 * longer the one signed in. Clerk's own `getToken` from `useAuth` reads
 * whichever session is active when it is called, so a request still in
 * flight from a previous account would otherwise carry, and write with, the
 * next account's identity.
 */
export function tokenForAccount(clerk: ClerkSessions, userId: string) {
  const session = clerk.session
  if (session?.user?.id !== userId) return Promise.resolve(null)
  // Minted by this session, so it stays this account's even if another
  // account signs in before it resolves.
  return session.getToken()
}
