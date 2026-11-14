import type { CardText } from './card-text.js'

/**
 * Card creation is protected by an idempotency key the client picks for each
 * intended creation and repeats on every retry of it. The backend records a
 * completed creation under (owner, operation, key) for 24 hours: a repeat
 * with the same request answers the original Card again, without creating
 * another or spending quota; a repeat with a different request is refused.
 * Once the record expires, the key is forgotten and may create anew.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'

/** Set on a response that repeats an earlier completed result. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed'

/** How long a completed creation is remembered. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

/** 16 to 128 letters, digits, `-` or `_`: a UUID fits. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

export const IDEMPOTENCY_KEY_MESSAGE =
  'Send 16 to 128 letters, digits, "-" or "_".'

/**
 * What identifies a creation request for its key: the fields exactly as
 * sent, so reusing a key for different text is detected.
 */
export const creationFingerprint = (fields: CardText) =>
  JSON.stringify([fields.question, fields.answer, fields.category])
