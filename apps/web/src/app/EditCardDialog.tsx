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
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'

import type { Card } from '../api/types.js'
import { useApi } from './api-context.js'
import {
  CardFields,
  draftOf,
  FormError,
  sameDraft,
  useCardDraft,
} from './card-form.js'
import { useIdempotencyKeys } from './idempotency-keys.js'
import { useKeptEdit, type KeptEdit } from './kept-edit.js'
import { fetchCard, isConflict, isNotFound, useUpdateCard } from './queries.js'

export interface EditCardDialogProps {
  /** The Card being edited, as it was when the dialog opened. */
  card: Card
  /** An edit kept from this account's previous session, to resume. */
  resumed?: KeptEdit
  /** Called once the Card is saved and the collection shows the change. */
  onSaved: (card: Card) => void
  /** Called when the dialog has finished closing, saved or not. */
  onClosed: () => void
  /** Where focus goes when the dialog closes, if it is still on the page. */
  returnFocusTo: () => HTMLElement | null
}

/** What became of the Card while this edit was unsaved. */
type Conflict =
  /** Another device changed it: this is its latest version. */
  | { kind: 'changed'; latest: Card }
  /** Another device deleted it. */
  | { kind: 'deleted' }

/**
 * "Edit your card": the Card's fields in a modal. It closes only once the
 * backend has saved the change. With unsaved changes, every way of closing
 * it (✕, Escape, a click outside) first asks to discard them.
 *
 * The edit is based on the Card's content version as the dialog opened. If
 * another device has changed the Card since, the save is refused, and the
 * dialog shows the latest version beside the unsaved changes until the
 * person picks one: nothing is overwritten or merged unseen.
 */
export function EditCardDialog({
  card,
  resumed,
  onSaved,
  onClosed,
  returnFocusTo,
}: EditCardDialogProps) {
  const [open, setOpen] = useState(true)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  /** The version of the Card this edit is based on. */
  const [base, setBase] = useState(resumed?.card ?? card)
  const [conflict, setConflict] = useState<Conflict>()
  const [note, setNote] = useState<string | undefined>(
    resumed
      ? 'Your session ended before this card was saved. Your changes are still here: press Update Card to save them.'
      : undefined,
  )
  const form = useCardDraft(resumed?.draft ?? draftOf(card))
  const update = useUpdateCard()
  const attempt = useIdempotencyKeys(resumed?.pending)
  const queryClient = useQueryClient()
  const api = useApi()
  const { keep } = useKeptEdit()
  const dirty = !sameDraft(form.draft, draftOf(base))

  // Kept in memory, so that if the session ends before the save, the same
  // account gets the edit back after signing in again.
  useEffect(() => {
    if (open)
      keep(
        dirty
          ? { card: base, draft: form.draft, pending: attempt.pending() }
          : undefined,
      )
    // `update.status`: a save attempt takes a key worth keeping.
  }, [open, dirty, base, form.draft, update.status, keep, attempt])

  const requestClose = () => {
    if (update.isPending) return
    if (dirty) setConfirmingDiscard(true)
    else setOpen(false)
  }

  /** Loads what another device made of the Card, to review. */
  const review = async () => {
    try {
      const latest = await fetchCard(queryClient, api, base.id)
      setConflict({ kind: 'changed', latest })
    } catch (error) {
      if (isNotFound(error)) setConflict({ kind: 'deleted' })
      else form.showSaveError(error)
    }
  }

  /** Bases the edit on `latest`, keeping or replacing what was typed. */
  const resolve = (latest: Card, keepChanges: boolean) => {
    setBase(latest)
    setConflict(undefined)
    if (keepChanges)
      setNote(
        'Your changes are based on the latest version now. Press Update Card to save them over it.',
      )
    else form.replace(draftOf(latest))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          keep(undefined)
          onClosed()
        }
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
            if (update.isPending || conflict) return
            const input = form.check()
            if (!input) return
            setNote(undefined)
            const { contentVersion } = base
            update.mutate(
              {
                cardId: base.id,
                patch: input,
                write: {
                  contentVersion,
                  // A retry of the same change to the same version repeats
                  // its key, so the backend applies it at most once.
                  idempotencyKey: attempt.keyFor(
                    JSON.stringify([contentVersion, input]),
                  ),
                },
              },
              {
                onSuccess: ({ value: saved }) => {
                  attempt.done()
                  setOpen(false)
                  onSaved(saved)
                },
                onError: (error) => {
                  if (isConflict(error)) void review()
                  else form.showSaveError(error)
                },
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
          {note && (
            <p
              role="status"
              className="text-preset-5-medium text-muted-foreground"
            >
              {note}
            </p>
          )}
          {conflict?.kind === 'changed' && (
            <ConflictReview
              latest={conflict.latest}
              onKeepMine={() => resolve(conflict.latest, true)}
              onUseLatest={() => resolve(conflict.latest, false)}
            />
          )}
          <FormError
            message={
              conflict?.kind === 'deleted'
                ? 'This card was deleted on another device, so your changes can’t be saved.'
                : form.formError
            }
          />
          <DialogFooter>
            <Button
              type="submit"
              disabled={update.isPending || conflict !== undefined}
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

/**
 * The latest version of a Card another device changed, beside the unsaved
 * changes in the form, and the two ways on: keep the changes (to save them
 * over the latest version) or take the latest version instead.
 */
function ConflictReview({
  latest,
  onKeepMine,
  onUseLatest,
}: {
  latest: Card
  onKeepMine: () => void
  onUseLatest: () => void
}) {
  const titleId = useId()
  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      className="flex flex-col gap-150 rounded-12 border border-border bg-muted p-200 text-preset-5-regular"
    >
      <p id={titleId} className="text-preset-4-semibold">
        This card was changed on another device.
      </p>
      <p>Your changes haven&rsquo;t been saved. This is the latest version:</p>
      <dl
        aria-label="Latest version"
        className="flex flex-col gap-50 break-words"
      >
        <dt className="text-preset-5-medium">Question</dt>
        <dd>{latest.question}</dd>
        <dt className="text-preset-5-medium">Answer</dt>
        <dd className="whitespace-pre-wrap">{latest.answer}</dd>
        <dt className="text-preset-5-medium">Category</dt>
        <dd>{latest.category.name}</dd>
      </dl>
      <div className="flex flex-wrap gap-100">
        <Button variant="outline" onClick={onKeepMine}>
          Keep my changes
        </Button>
        <Button variant="outline" onClick={onUseLatest}>
          Use the latest version
        </Button>
      </div>
    </section>
  )
}
