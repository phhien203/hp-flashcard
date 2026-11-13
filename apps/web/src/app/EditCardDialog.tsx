import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hp-flashcard/ui'
import { useState } from 'react'

import type { Card } from '../api/types.js'
import {
  CardFields,
  draftOf,
  FormError,
  sameDraft,
  useCardDraft,
} from './card-form.js'
import { useUpdateCard } from './queries.js'

export interface EditCardDialogProps {
  /** The Card being edited, as it was when the dialog opened. */
  card: Card
  /** Called once the Card is saved and the collection shows the change. */
  onSaved: (card: Card) => void
  /** Called when the dialog has finished closing, saved or not. */
  onClosed: () => void
  /** Where focus goes when the dialog closes, if it is still on the page. */
  returnFocusTo: () => HTMLElement | null
}

/**
 * "Edit your card": the Card's fields in a modal. It closes only once the
 * backend has saved the change. With unsaved changes, every way of closing
 * it (✕, Escape, a click outside) first asks to discard them.
 */
export function EditCardDialog({
  card,
  onSaved,
  onClosed,
  returnFocusTo,
}: EditCardDialogProps) {
  const [open, setOpen] = useState(true)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const form = useCardDraft(draftOf(card))
  const update = useUpdateCard()
  const dirty = !sameDraft(form.draft, draftOf(card))

  const requestClose = () => {
    if (update.isPending) return
    if (dirty) setConfirmingDiscard(true)
    else setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClosed()
      }}
    >
      <DialogContent finalFocus={() => returnFocusTo() ?? true}>
        <DialogHeader>
          <DialogTitle>Edit your card</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-250"
          onSubmit={(event) => {
            event.preventDefault()
            if (update.isPending) return
            const input = form.check()
            if (!input) return
            update.mutate(
              { cardId: card.id, patch: input },
              {
                onSuccess: (saved) => {
                  setOpen(false)
                  onSaved(saved)
                },
                onError: form.showSaveError,
              },
            )
          }}
        >
          <CardFields
            draft={form.draft}
            errors={form.errors}
            onChange={form.change}
            readOnly={update.isPending}
          />
          <FormError message={form.formError} />
          <DialogFooter>
            <Button
              type="submit"
              disabled={update.isPending}
              focusableWhenDisabled
            >
              {update.isPending ? 'Updating Card…' : 'Update Card'}
            </Button>
          </DialogFooter>
        </form>

        <AlertDialog
          open={confirmingDiscard}
          onOpenChange={setConfirmingDiscard}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Your edits to this card haven&rsquo;t been saved and will be
                lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={() => setOpen(false)}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
