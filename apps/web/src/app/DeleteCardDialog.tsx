import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@hp-flashcard/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { Card } from '../api/types.js'
import { ApiError } from '../api/client.js'
import { useApi } from './api-context.js'
import { FormError, isNetworkFailure } from './card-form.js'
import { useIdempotencyKeys } from './idempotency-keys.js'
import { fetchCard, isConflict, isNotFound, useDeleteCard } from './queries.js'

export interface DeleteCardDialogProps {
  /** The Card to delete. */
  card: Card
  /**
   * Called once the Card is gone and the collection no longer shows it:
   * `deleted` when this request deleted it, `missing` when the backend no
   * longer had it.
   */
  onDeleted: (outcome: DeleteOutcome) => void
  /** Called when the dialog has finished closing, deleted or not. */
  onClosed: () => void
  /**
   * Where focus goes when the dialog closes, if it is still on the page.
   * `deleted` says whether the Card is gone.
   */
  returnFocusTo: (deleted: boolean) => HTMLElement | null
}

/** How a deletion ended: this request deleted the Card, or it was gone. */
export type DeleteOutcome = 'deleted' | 'missing'

/**
 * Figma's "Delete this card?" confirmation. Cancel and Escape keep the
 * Card, and a click outside does nothing. Delete Card waits for the
 * backend: the dialog stays open, unclosable, until the Card is deleted, and
 * stays open with an explanation if it could not be.
 *
 * The confirmation is for the Card as it was shown. If another device has
 * edited it since, nothing is deleted: the dialog shows the latest version,
 * and deleting that takes a second, informed confirmation.
 */
export function DeleteCardDialog({
  card,
  onDeleted,
  onClosed,
  returnFocusTo,
}: DeleteCardDialogProps) {
  const [open, setOpen] = useState(true)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState<string>()
  /** The version of the Card being confirmed: newer after a conflict. */
  const [confirmed, setConfirmed] = useState(card)
  const [changed, setChanged] = useState(false)
  const deletion = useDeleteCard()
  const attempt = useIdempotencyKeys()
  const queryClient = useQueryClient()
  const api = useApi()

  const finish = (outcome: DeleteOutcome) => {
    setGone(true)
    setOpen(false)
    onDeleted(outcome)
  }

  /** Shows what another device made of the Card, to confirm afresh. */
  const review = async () => {
    try {
      setConfirmed(await fetchCard(queryClient, api, card.id))
      setChanged(true)
    } catch (failure) {
      if (isNotFound(failure)) finish('missing')
      else setError('Your card could not be deleted. Please try again.')
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // A pending deletion can't be called off.
        if (!next && !deletion.isPending) setOpen(false)
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed()
      }}
    >
      <AlertDialogContent finalFocus={() => returnFocusTo(gone) ?? true}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this card?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {changed && (
          <div
            role="alert"
            className="flex flex-col gap-50 text-preset-5-regular break-words"
          >
            <p className="text-preset-5-medium">
              This card was changed on another device, so it wasn&rsquo;t
              deleted. It now reads:
            </p>
            <p>{confirmed.question}</p>
            <p className="whitespace-pre-wrap">{confirmed.answer}</p>
            <p>Delete this version?</p>
          </div>
        )}
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletion.isPending}>
            Cancel
          </AlertDialogCancel>
          <Button
            disabled={deletion.isPending}
            focusableWhenDisabled
            onClick={() => {
              if (deletion.isPending) return
              setError(undefined)
              const { contentVersion } = confirmed
              deletion.mutate(
                {
                  cardId: card.id,
                  write: {
                    contentVersion,
                    // A retry repeats the key: deleted at most once.
                    idempotencyKey: attempt.keyFor(String(contentVersion)),
                  },
                },
                {
                  onSuccess: () => finish('deleted'),
                  onError: (failure) => {
                    if (isNotFound(failure)) finish('missing')
                    else if (isConflict(failure)) {
                      setChanged(false)
                      void review()
                    } else
                      setError(
                        isNetworkFailure(failure)
                          ? 'Your card could not be deleted: you’re offline or the server can’t be reached. Check your connection and try again.'
                          : failure instanceof ApiError &&
                              failure.status === 401
                            ? 'Your session has ended. Sign in again to delete your card.'
                            : 'Your card could not be deleted. Please try again.',
                      )
                  },
                },
              )
            }}
          >
            {deletion.isPending ? 'Deleting Card…' : 'Delete Card'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
