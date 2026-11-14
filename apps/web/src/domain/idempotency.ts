import type { CardText } from './card-text.js'

/**
 * Every Card write is protected by an idempotency key the client picks for
 * each intended write and repeats on every retry of it. The backend records
 * a completed write under (owner, operation, key) for 24 hours: a repeat
 * with the same request answers the original result again, without
 * applying the write twice; a repeat with a different request is refused.
 * Once the record expires, the key is forgotten and may write anew.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'

/** Set on a response that repeats an earlier completed result. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed'

/** How long a completed write is remembered. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

/** 16 to 128 letters, digits, `-` or `_`: a UUID fits. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export const IDEMPOTENCY_KEY_MESSAGE =
  'Send 16 to 128 letters, digits, "-" or "_".'

/** The operations idempotency keys are bound to, as the backends record them. */
export const OPERATIONS = {
  create: 'createCard',
  update: 'updateCard',
  delete: 'deleteCard',
  progress: 'setCardProgress',
} as const

/**
 * What identifies a creation request for its key: the fields exactly as
 * sent, so reusing a key for different text is detected.
 */
export const creationFingerprint = (fields: CardText) =>
  JSON.stringify([fields.question, fields.answer, fields.category])

/**
 * What identifies an edit request for its key: the Card, the version it was
 * based on and the fields exactly as sent (absent ones as `null`).
 */
export const editFingerprint = (
  cardId: string,
  contentVersion: number,
  fields: Partial<CardText>,
) =>
  JSON.stringify([
    cardId,
    contentVersion,
    fields.question ?? null,
    fields.answer ?? null,
    fields.category ?? null,
  ])

/** What identifies a deletion request for its key. */
export const deletionFingerprint = (cardId: string, contentVersion: number) =>
  JSON.stringify([cardId, contentVersion])

/**
 * What identifies a Progress save for its key: the Card, the
 * `progressVersion` it was based on and the Progress it sets.
 */
export const progressFingerprint = (
  cardId: string,
  progressVersion: number,
  progress: number,
) => JSON.stringify([cardId, progressVersion, progress])
