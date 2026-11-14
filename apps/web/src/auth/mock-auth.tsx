import { Button } from '@hp-flashcard/ui'
import { useSyncExternalStore } from 'react'

import { mockToken } from '../mocks/identity.js'
import { MOCK_DEMO_USER } from '../mocks/store.js'
import type { AuthSession } from './session.js'

/**
 * A controllable sign-in for tests and explicit mock development. Its
 * tokens are understood only by the mock backend.
 */
export interface MockAuth {
  getSession: () => AuthSession
  subscribe: (onChange: () => void) => () => void
  signIn: (userId: string) => void
  signOut: () => void
  /** Puts the session back to loading, as while Clerk starts. */
  setLoading: () => void
}

/** A mock sign-in, signed in as `userId`, or signed out when `null`. */
export function createMockAuth(
  userId: string | null = MOCK_DEMO_USER,
): MockAuth {
  const listeners = new Set<() => void>()
  let session: AuthSession = { status: 'signed-out' }

  const set = (next: AuthSession) => {
    session = next
    listeners.forEach((listener) => listener())
  }

  const signedIn = (userId: string): AuthSession => {
    const current: AuthSession = {
      status: 'signed-in',
      userId,
      // Like Clerk: once this session has ended, there is no token for it.
      getToken: async () => (session === current ? mockToken(userId) : null),
      signOut: () => set({ status: 'signed-out' }),
    }
    return current
  }

  if (userId !== null) session = signedIn(userId)

  return {
    getSession: () => session,
    subscribe: (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    signIn: (userId) => set(signedIn(userId)),
    signOut: () => set({ status: 'signed-out' }),
    setLoading: () => set({ status: 'loading' }),
  }
}

/** The mock sign-in's current session. */
export const useMockSession = (auth: MockAuth) =>
  useSyncExternalStore(auth.subscribe, auth.getSession)

/**
 * Mock mode's stand-in for Clerk's sign-in: no email, no password, just a
 * choice of account. It exists only with the mock backend.
 */
export function MockSignIn({ auth }: { auth: MockAuth }) {
  return (
    <div className="flex flex-col items-center gap-200 rounded-16 border border-border bg-card p-300 text-card-foreground shadow-rest">
      <p className="text-preset-4-regular text-muted-foreground">
        Mock mode: no real account is involved.
      </p>
      <div className="flex flex-wrap justify-center gap-200">
        <Button onClick={() => auth.signIn(MOCK_DEMO_USER)}>
          Continue as the demo account
        </Button>
        <Button
          variant="secondary"
          onClick={() => auth.signIn(`user_mock_${crypto.randomUUID()}`)}
        >
          Continue as a new account
        </Button>
      </div>
    </div>
  )
}
