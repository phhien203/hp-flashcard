/**
 * Who is using the app, as the app sees it. Clerk provides it in the real
 * app (clerk.tsx); tests and explicit mock development use a controllable
 * stand-in (mock-auth.tsx). Nothing else in the app knows which.
 */
export type AuthSession =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | {
      status: 'signed-in'
      /** The account's stable identifier. A change means another account. */
      userId: string
      /**
       * The current session token for API requests, or `null` once this
       * account is no longer signed in.
       */
      getToken: () => Promise<string | null>
      signOut: () => void | Promise<void>
    }
