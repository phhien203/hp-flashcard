import { useState } from 'react'

/** The key of one intended write, and what it was sent with. */
export interface PendingKey {
  key: string
  /** What identifies the intended write, e.g. its JSON body and version. */
  sent: string
}

/**
 * One idempotency key per intended write. Sending the same write again
 * after a failure (perhaps a lost response) reuses its key, so the backend
 * applies it at most once; once it succeeds, or what is sent changes, the
 * next write is a new one with a new key. `initial` resumes a write kept
 * across a sign-in.
 */
export function useIdempotencyKeys(initial?: PendingKey) {
  // One stable object per component, holding the key outside React state:
  // a key must be the same for every retry, whatever re-renders between.
  const [keys] = useState(() => createKeys(initial))
  return keys
}

function createKeys(initial: PendingKey | undefined) {
  const pending: { current: PendingKey | undefined } = { current: initial }
  return {
    /** The key for a write identified by `sent`. */
    keyFor(sent: string) {
      if (pending.current?.sent !== sent)
        pending.current = { key: crypto.randomUUID(), sent }
      return pending.current.key
    },
    /** The write still awaiting success, if any. */
    pending: () => pending.current,
    done() {
      pending.current = undefined
    },
  }
}
