import { http, HttpResponse } from 'msw'

import type {
  ApiErrorBody,
  CardPage,
  CardStatistics,
  CategoryList,
  Card,
} from '../api/types.js'
import {
  BLANK_FIELD_MESSAGES,
  MASTERED,
  mockStore,
  type CardFields,
  type WriteResult,
} from './store.js'

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 48
const MAX_SEED = 4294967295

const error = (status: number, body: ApiErrorBody) =>
  HttpResponse.json(body, { status })

const FIELDS = ['question', 'answer', 'category'] as const

const invalid = (message: string, fieldErrors: Record<string, string>) =>
  error(400, { code: 'validation_failed', message, fieldErrors })

/** The backend's answer when no Card has this id. */
export const notFound = (cardId: string) =>
  error(404, { code: 'not_found', message: `No Card has the id "${cardId}".` })

/**
 * Reads a `CardInput` (every field `required`) or `CardPatch` body: an
 * object of string fields and nothing else. Blank values are the store's
 * business; this checks only the shape.
 */
async function readCardBody(
  request: Request,
  { required }: { required: boolean },
): Promise<Parsed<Partial<CardFields>>> {
  const body: unknown = await request.json().catch(() => undefined)
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return { ok: false, error: 'The body must be a JSON object.' }
  const fieldErrors: Record<string, string> = {}
  const fields: Partial<CardFields> = {}
  for (const [name, value] of Object.entries(body)) {
    if (!(FIELDS as readonly string[]).includes(name))
      fieldErrors[name] = 'Unknown field.'
    else if (typeof value !== 'string') fieldErrors[name] = 'Must be text.'
    else fields[name as keyof CardFields] = value
  }
  for (const name of FIELDS) {
    if (required && !(name in body))
      fieldErrors[name] = BLANK_FIELD_MESSAGES[name]
  }
  if (!required && Object.keys(body).length === 0)
    return { ok: false, error: 'Give at least one field to change.' }
  if (Object.keys(fieldErrors).length > 0)
    return { ok: false, error: 'The Card is invalid.', fieldErrors }
  return { ok: true, value: fields }
}

/** Answers a store write: the Card, or why it failed. */
function writeResponse(result: WriteResult, cardId: string, status = 200) {
  if (result.ok) {
    return HttpResponse.json<Card>(result.card, {
      status,
      headers:
        status === 201
          ? { Location: `/api/cards/${encodeURIComponent(result.card.id)}` }
          : undefined,
    })
  }
  if (result.reason === 'not_found') return notFound(cardId)
  return invalid('The Card is invalid.', result.fieldErrors)
}

/** Reads a `ProgressInput` body: `{ progress }`, a whole number from 0 to 5. */
async function readProgressBody(request: Request): Promise<Parsed<number>> {
  const body: unknown = await request.json().catch(() => undefined)
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return { ok: false, error: 'The body must be a JSON object.' }
  const fieldErrors: Record<string, string> = {}
  for (const name of Object.keys(body)) {
    if (name !== 'progress') fieldErrors[name] = 'Unknown field.'
  }
  const { progress } = body as { progress?: unknown }
  if (
    typeof progress !== 'number' ||
    !Number.isInteger(progress) ||
    progress < 0 ||
    progress > MASTERED
  )
    fieldErrors.progress = `Must be a whole number from 0 to ${MASTERED}.`
  if (Object.keys(fieldErrors).length > 0)
    return { ok: false, error: 'The Progress is invalid.', fieldErrors }
  return { ok: true, value: progress as number }
}

type Parsed<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Parses an optional whole-number parameter, or explains why it can't. */
function wholeNumber<F extends number | undefined>(
  raw: string | null,
  { min, max, fallback }: { min: number; max: number; fallback: F },
): Parsed<number | F> {
  if (raw === null) return { ok: true, value: fallback }
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'Must be a whole number.' }
  const value = Number(raw)
  if (value < min || value > max)
    return { ok: false, error: `Must be from ${min} to ${max}.` }
  return { ok: true, value }
}

/**
 * The mock backend: the parts of api/openapi.yaml implemented so far.
 * Paths are relative to the page's origin unless `origin` is given (in Node,
 * where there is no page).
 */
export const createHandlers = (origin = '') => [
  http.get(`${origin}/api/cards`, ({ request }) => {
    const params = new URL(request.url).searchParams
    const fieldErrors: Record<string, string> = {}

    const hideMasteredRaw = params.get('hideMastered')
    const hideMasteredError =
      hideMasteredRaw !== null && !['true', 'false'].includes(hideMasteredRaw)
    if (hideMasteredError) fieldErrors.hideMastered = 'Must be true or false.'

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

    if (!offset.ok || !limit.ok || !seed.ok || hideMasteredError) {
      return error(400, {
        code: 'validation_failed',
        message: 'The query parameters are invalid.',
        fieldErrors,
      })
    }

    return HttpResponse.json<CardPage>(
      mockStore.listCards({
        categoryIds: params.getAll('category'),
        hideMastered: hideMasteredRaw === 'true',
        offset: offset.value,
        limit: limit.value,
        seed: seed.value,
      }),
    )
  }),

  http.post(`${origin}/api/cards`, async ({ request }) => {
    const body = await readCardBody(request, { required: true })
    if (!body.ok) return invalid(body.error, body.fieldErrors ?? {})
    return writeResponse(
      mockStore.createCard(body.value as CardFields),
      '',
      201,
    )
  }),

  // Before /api/cards/:cardId, which would take "statistics" for an id.
  http.get(`${origin}/api/cards/statistics`, ({ request }) => {
    const categoryIds = new URL(request.url).searchParams.getAll('category')
    if (categoryIds.some((id) => id === ''))
      return invalid('The query parameters are invalid.', {
        category: 'Must not be empty.',
      })
    return HttpResponse.json<CardStatistics>(mockStore.statistics(categoryIds))
  }),

  http.get<{ cardId: string }>(`${origin}/api/cards/:cardId`, ({ params }) => {
    const card = mockStore.getCard(params.cardId)
    if (!card) return notFound(params.cardId)
    return HttpResponse.json<Card>(card)
  }),

  http.patch<{ cardId: string }>(
    `${origin}/api/cards/:cardId`,
    async ({ params, request }) => {
      if (!mockStore.getCard(params.cardId)) return notFound(params.cardId)
      const body = await readCardBody(request, { required: false })
      if (!body.ok) return invalid(body.error, body.fieldErrors ?? {})
      return writeResponse(
        mockStore.updateCard(params.cardId, body.value),
        params.cardId,
      )
    },
  ),

  http.put<{ cardId: string }>(
    `${origin}/api/cards/:cardId/progress`,
    async ({ params, request }) => {
      if (!mockStore.getCard(params.cardId)) return notFound(params.cardId)
      const body = await readProgressBody(request)
      if (!body.ok) return invalid(body.error, body.fieldErrors ?? {})
      const card = mockStore.setProgress(params.cardId, body.value)
      if (!card) return notFound(params.cardId)
      return HttpResponse.json<Card>(card)
    },
  ),

  http.delete<{ cardId: string }>(
    `${origin}/api/cards/:cardId`,
    ({ params }) => {
      if (!mockStore.deleteCard(params.cardId)) return notFound(params.cardId)
      return new HttpResponse(null, { status: 204 })
    },
  ),

  http.get(`${origin}/api/categories`, () =>
    HttpResponse.json<CategoryList>({ items: mockStore.listCategories() }),
  ),
]

export const handlers = createHandlers()
