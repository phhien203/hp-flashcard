import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  Textarea,
} from '@hp-flashcard/ui'

import { useState } from 'react'

import { ApiError } from '../api/client.js'
import type { Card, CardInput } from '../api/types.js'

/** What the user has typed into a Card form, untrimmed. */
export interface CardDraft {
  question: string
  answer: string
  category: string
}

export type CardField = keyof CardDraft

/** Messages shown beside the fields they are about. */
export type DraftErrors = Partial<Record<CardField, string>>

export const EMPTY_DRAFT: CardDraft = { question: '', answer: '', category: '' }

const BLANK_MESSAGES: Record<CardField, string> = {
  question: 'Please enter a question.',
  answer: 'Please enter an answer.',
  category: 'Please enter a category.',
}

/** The draft of an existing Card, as its edit form starts. */
export const draftOf = (card: Card): CardDraft => ({
  question: card.question,
  answer: card.answer,
  category: card.category.name,
})

/** Whether anything but whitespace has been typed. */
export const hasContent = (draft: CardDraft) =>
  Object.values(draft).some((value) => value.trim() !== '')

export const sameDraft = (a: CardDraft, b: CardDraft) =>
  a.question === b.question &&
  a.answer === b.answer &&
  a.category === b.category

/**
 * Trims the draft and rejects blank fields, as the API does: the
 * trimmed Card to send, or the errors to show.
 */
export function checkDraft(
  draft: CardDraft,
): { ok: true; input: CardInput } | { ok: false; errors: DraftErrors } {
  const input = {
    question: draft.question.trim(),
    answer: draft.answer.trim(),
    category: draft.category.trim(),
  }
  const errors: DraftErrors = {}
  for (const field of ['question', 'answer', 'category'] as const) {
    if (!input[field]) errors[field] = BLANK_MESSAGES[field]
  }
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, input }
}

/** How a failed save is explained: beside fields, or for the whole form. */
export function saveErrorOf(error: unknown): {
  fieldErrors: DraftErrors
  message: string | undefined
} {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.body?.fieldErrors) {
      const fieldErrors: DraftErrors = {}
      let other = false
      for (const [field, message] of Object.entries(error.body.fieldErrors)) {
        if (field in BLANK_MESSAGES) fieldErrors[field as CardField] = message
        else other = true
      }
      if (Object.keys(fieldErrors).length > 0 && !other) {
        return { fieldErrors, message: undefined }
      }
    }
    if (error.status === 404) {
      return {
        fieldErrors: {},
        message: 'This card no longer exists, so it could not be saved.',
      }
    }
  }
  return {
    fieldErrors: {},
    message: 'Your card could not be saved. Please try again.',
  }
}

export interface CardFieldsProps {
  draft: CardDraft
  errors: DraftErrors
  onChange: (field: CardField, value: string) => void
  /** While a save is pending, the fields can't change. */
  readOnly: boolean
}

/**
 * The question, answer and Category fields shared by the create form and
 * the edit dialog, each with its error beside it.
 */
export function CardFields({
  draft,
  errors,
  onChange,
  readOnly,
}: CardFieldsProps) {
  return (
    <>
      <Field invalid={Boolean(errors.question)}>
        <FieldLabel>Question</FieldLabel>
        <Input
          value={draft.question}
          onValueChange={(value) => onChange('question', value)}
          placeholder="e.g. What is the capital of France?"
          readOnly={readOnly}
        />
        {errors.question && <FieldError match>{errors.question}</FieldError>}
      </Field>
      <Field invalid={Boolean(errors.answer)}>
        <FieldLabel>Answer</FieldLabel>
        <Textarea
          value={draft.answer}
          onValueChange={(value) => onChange('answer', value)}
          placeholder="e.g. Paris"
          readOnly={readOnly}
        />
        {errors.answer && <FieldError match>{errors.answer}</FieldError>}
      </Field>
      <Field invalid={Boolean(errors.category)}>
        <FieldLabel>Category</FieldLabel>
        <Input
          value={draft.category}
          onValueChange={(value) => onChange('category', value)}
          placeholder="e.g. Geography"
          readOnly={readOnly}
        />
        {errors.category && <FieldError match>{errors.category}</FieldError>}
      </Field>
    </>
  )
}

/** A save failure that isn't about one field. */
export function FormError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-preset-5-medium text-destructive">
      {message}
    </p>
  ) : null
}

/**
 * A form's draft and its errors. Changing a field clears that field's
 * error, as the user is fixing it.
 */
export function useCardDraft(initial: CardDraft) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [formError, setFormError] = useState<string>()

  const change = (field: CardField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field]) return current
      const rest = { ...current }
      delete rest[field]
      return rest
    })
  }

  /** Shows why a save failed, keeping the draft. */
  const showSaveError = (error: unknown) => {
    const { fieldErrors, message } = saveErrorOf(error)
    setErrors(fieldErrors)
    setFormError(message)
  }

  /** Validates the draft: the trimmed Card, or `undefined` and the errors shown. */
  const check = () => {
    setFormError(undefined)
    const result = checkDraft(draft)
    setErrors(result.ok ? {} : result.errors)
    return result.ok ? result.input : undefined
  }

  const reset = () => {
    setDraft(initial)
    setErrors({})
    setFormError(undefined)
  }

  return { draft, errors, formError, change, check, showSaveError, reset }
}
