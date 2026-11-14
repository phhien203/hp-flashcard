import { Button } from '@hp-flashcard/ui'
import { useEffect, useId, useRef } from 'react'

import type { Card, CardInput } from '../api/types.js'
import {
  CardFields,
  EMPTY_DRAFT,
  FormError,
  hasContent,
  useCardDraft,
} from './card-form.js'
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
          create.mutate(attempt.keyFor(input), {
            onSuccess: (card) => {
              attempt.done()
              form.reset()
              onCreated(card)
            },
            onError: form.showSaveError,
          })
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

/**
 * One idempotency key per intended creation. Submitting the same Card again
 * after a failure (perhaps a lost response) reuses its key, so the backend
 * creates it at most once; once it is created, or the text changes, the
 * next submission is a new creation with a new key.
 */
function useIdempotencyKeys() {
  const pending = useRef<{ key: string; sent: string }>(undefined)
  return {
    keyFor(input: CardInput) {
      const sent = JSON.stringify(input)
      if (pending.current?.sent !== sent)
        pending.current = { key: crypto.randomUUID(), sent }
      return { input, idempotencyKey: pending.current.key }
    },
    done() {
      pending.current = undefined
    },
  }
}
