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
import { useState } from 'react'

import type { Card } from '../api/types.js'
import { FormError } from './card-form.js'
import { isNotFound, useDeleteCard } from './queries.js'

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
  const deletion = useDeleteCard()

  const finish = (outcome: DeleteOutcome) => {
    setGone(true)
    setOpen(false)
    onDeleted(outcome)
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
              deletion.mutate(card.id, {
                onSuccess: () => finish('deleted'),
                onError: (failure) => {
                  if (isNotFound(failure)) finish('missing')
                  else
                    setError(
                      'Your card could not be deleted. Please try again.',
                    )
                },
              })
            }}
          >
            {deletion.isPending ? 'Deleting Card…' : 'Delete Card'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
