import { Button } from '@hp-flashcard/ui'
import { useEffect, useId } from 'react'

import type { Card } from '../api/types.js'
import {
  CardFields,
  EMPTY_DRAFT,
  FormError,
  hasContent,
  useCardDraft,
} from './card-form.js'
import { useIdempotencyKeys } from './idempotency-keys.js'
import { useCreateCard } from './queries.js'

export interface CreateCardFormProps {
  /** Called when the form starts or stops holding unsaved input. */
  onHasDraftChange: (hasDraft: boolean) => void
  /** Called once the Card is saved and the collection shows it. */
  onCreated: (card: Card) => void
}

/**
 * The form at the top of All Cards. It keeps what was typed until the
 * backend has saved the Card, then clears for the next one.
 */
export function CreateCardForm({
  onHasDraftChange,
  onCreated,
}: CreateCardFormProps) {
  const headingId = useId()
  const form = useCardDraft(EMPTY_DRAFT)
  const create = useCreateCard()
  const attempt = useIdempotencyKeys()

  const hasDraft = hasContent(form.draft)
  useEffect(() => {
    onHasDraftChange(hasDraft)
  }, [hasDraft, onHasDraftChange])
  useEffect(() => () => onHasDraftChange(false), [onHasDraftChange])

  return (
    <div className="rounded-16 border border-border bg-card p-200 text-card-foreground shadow-rest md:p-300">
      <h2 id={headingId} className="sr-only">
        Create a card
      </h2>
      <form
        aria-labelledby={headingId}
        noValidate
        className="flex flex-col gap-200"
        onSubmit={(event) => {
          event.preventDefault()
          if (create.isPending) return
          const input = form.check()
          if (!input) return
          // A retry of the same Card repeats its key, so the backend
          // creates it at most once.
          const idempotencyKey = attempt.keyFor(JSON.stringify(input))
          create.mutate(
            { input, idempotencyKey },
            {
              onSuccess: ({ value: card }) => {
                attempt.done()
                form.reset()
                onCreated(card)
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
          readOnly={create.isPending}
        />
        <FormError message={form.formError} />
        <Button
          type="submit"
          className="self-start"
          disabled={create.isPending}
          focusableWhenDisabled
        >
          {create.isPending ? 'Creating Card…' : 'Create Card'}
        </Button>
      </form>
    </div>
  )
}
