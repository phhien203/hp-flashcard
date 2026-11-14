import { createContext, useContext } from 'react'

import type { Card } from '../api/types.js'
import type { CardDraft } from './card-form.js'
import type { PendingKey } from './idempotency-keys.js'

/**
 * An unsaved edit kept while its account signs in again: the Card it is
 * based on, what was typed, and the idempotency key of a save that may
 * have reached the backend, so retrying it can't apply it twice.
 */
export interface KeptEdit {
  card: Card
  draft: CardDraft
  pending: PendingKey | undefined
}

/**
 * Keeps one unsaved edit in memory, never in storage, across a session
 * that ends without the person signing out (it expired, or was ended
 * elsewhere). Only the same account gets it back; any other account that
 * signs in makes it forgotten, as does signing out.
 */
export function createEditKeeper() {
  let owner: string | undefined
  let edit: KeptEdit | undefined
  const clear = () => {
    owner = undefined
    edit = undefined
  }
  return {
    keep(userId: string, next: KeptEdit | undefined) {
      owner = userId
      edit = next
    },
    /** The edit kept for `userId`. Anyone else's is forgotten. */
    resume(userId: string) {
      if (owner !== userId) clear()
      return edit
    },
    clear,
  }
}

export type EditKeeper = ReturnType<typeof createEditKeeper>

interface KeptEditContextValue {
  /** The edit kept from this account's previous session, if any. */
  restored: KeptEdit | undefined
  /** Keeps the open edit (or, with `undefined`, nothing). */
  keep: (edit: KeptEdit | undefined) => void
}

const KeptEditContext = createContext<KeptEditContextValue>({
  restored: undefined,
  keep: () => {},
})

export const KeptEditProvider = KeptEditContext.Provider

export const useKeptEdit = () => useContext(KeptEditContext)
