import { BLANK_MESSAGES, CARD_TEXT_FIELDS, type CardText } from './card-text.js'
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MESSAGE,
  IDEMPOTENCY_KEY_PATTERN,
} from './idempotency.js'
import { IF_MATCH_HEADER, IF_MATCH_MESSAGE, parseIfMatch } from './versions.js'

/**
 * Reading API requests: the shape checks the mock backend and the Worker
 * share, so both reject the same requests with the same field errors.
 */

export type Parsed<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; fieldErrors: Record<string, string> }

export const DEFAULT_LIMIT = 12
export const MAX_LIMIT = 48
export const MAX_SEED = 4294967295

/** What a Card listing asks for. */
export interface CardListQuery {
  categoryIds: string[]
  hideMastered: boolean
  offset: number
  limit: number
  seed: number | undefined
}

/** Parses an optional whole-number parameter, or explains why it can't. */
function wholeNumber<F extends number | undefined>(
  raw: string | null,
  { min, max, fallback }: { min: number; max: number; fallback: F },
): { ok: true; value: number | F } | { ok: false; error: string } {
  if (raw === null) return { ok: true, value: fallback }
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'Must be a whole number.' }
  const value = Number(raw)
  if (value < min || value > max)
    return { ok: false, error: `Must be from ${min} to ${max}.` }
  return { ok: true, value }
}

/** Reads the `category` filter: identifiers, none of them empty. */
export function parseCategoryFilter(params: URLSearchParams): Parsed<string[]> {
  const categoryIds = params.getAll('category')
  if (categoryIds.some((id) => id === ''))
    return {
      ok: false,
      error: 'The query parameters are invalid.',
      fieldErrors: { category: 'Must not be empty.' },
    }
  return { ok: true, value: categoryIds }
}

/** Reads the query parameters of `GET /api/cards`. */
export function parseCardListQuery(
  params: URLSearchParams,
): Parsed<CardListQuery> {
  const fieldErrors: Record<string, string> = {}

  const hideMasteredRaw = params.get('hideMastered')
  if (hideMasteredRaw !== null && !['true', 'false'].includes(hideMasteredRaw))
    fieldErrors.hideMastered = 'Must be true or false.'
  const offset = wholeNumber(params.get('offset'), {
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    fallback: 0,
  })
  if (!offset.ok) fieldErrors.offset = offset.error
  const limit = wholeNumber(params.get('limit'), {
    min: 1,
    max: MAX_LIMIT,
    fallback: DEFAULT_LIMIT,
  })
  if (!limit.ok) fieldErrors.limit = limit.error
  const seed = wholeNumber(params.get('seed'), {
    min: 0,
    max: MAX_SEED,
    fallback: undefined,
  })
  if (!seed.ok) fieldErrors.seed = seed.error
  const categories = parseCategoryFilter(params)
  if (!categories.ok) Object.assign(fieldErrors, categories.fieldErrors)

  if (
    !offset.ok ||
    !limit.ok ||
    !seed.ok ||
    !categories.ok ||
    Object.keys(fieldErrors).length > 0
  )
    return {
      ok: false,
      error: 'The query parameters are invalid.',
      fieldErrors,
    }
  return {
    ok: true,
    value: {
      categoryIds: categories.value,
      hideMastered: hideMasteredRaw === 'true',
      offset: offset.value,
      limit: limit.value,
      seed: seed.value,
    },
  }
}

/**
 * Reads a `CardInput` (every field `required`) or `CardPatch` body, already
 * parsed from JSON: an object of string fields and nothing else. Blank and
 * over-long values are `checkCardText`'s business; this checks the shape.
 */
export function parseCardBody(
  body: unknown,
  { required }: { required: boolean },
): Parsed<Partial<CardText>> {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return {
      ok: false,
      error: 'The body must be a JSON object.',
      fieldErrors: {},
    }
  const fieldErrors: Record<string, string> = {}
  const fields: Partial<CardText> = {}
  for (const [name, value] of Object.entries(body)) {
    if (!(CARD_TEXT_FIELDS as readonly string[]).includes(name))
      fieldErrors[name] = 'Unknown field.'
    else if (typeof value !== 'string') fieldErrors[name] = 'Must be text.'
    else fields[name as keyof CardText] = value
  }
  for (const name of CARD_TEXT_FIELDS) {
    if (required && !(name in body)) fieldErrors[name] = BLANK_MESSAGES[name]
  }
  if (!required && Object.keys(body).length === 0)
    return {
      ok: false,
      error: 'Give at least one field to change.',
      fieldErrors: {},
    }
  if (Object.keys(fieldErrors).length > 0)
    return { ok: false, error: 'The Card is invalid.', fieldErrors }
  return { ok: true, value: fields }
}

/** The headers of a Card write: its idempotency key and, for an existing Card, the version it was based on. */
export interface WriteHeaders {
  key: string
  contentVersion: number
}

/**
 * Reads `Idempotency-Key` and `If-Match` for an edit or deletion. Field
 * errors are keyed by header name.
 */
export function parseVersionedWriteHeaders(
  get: (name: string) => string | null | undefined,
): Parsed<WriteHeaders> {
  const fieldErrors: Record<string, string> = {}
  const key = get(IDEMPOTENCY_KEY_HEADER)
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key))
    fieldErrors[IDEMPOTENCY_KEY_HEADER] = IDEMPOTENCY_KEY_MESSAGE
  const contentVersion = parseIfMatch(get(IF_MATCH_HEADER))
  if (contentVersion === undefined)
    fieldErrors[IF_MATCH_HEADER] = IF_MATCH_MESSAGE
  if (!key || contentVersion === undefined || Object.keys(fieldErrors).length)
    return { ok: false, error: 'The request headers are invalid.', fieldErrors }
  return { ok: true, value: { key, contentVersion } }
}
