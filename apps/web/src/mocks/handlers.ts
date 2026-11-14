import { http, HttpResponse } from 'msw'

import type {
  ApiErrorBody,
  CardPage,
  CardStatistics,
  CategoryList,
  Card,
} from '../api/types.js'
import {
  creationFingerprint,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MESSAGE,
  IDEMPOTENCY_KEY_PATTERN,
  IDEMPOTENT_REPLAYED_HEADER,
} from '../domain/idempotency.js'
import { QUOTA_EXCEEDED_MESSAGE, type CardText } from '../domain/card-text.js'
import {
  parseCardBody,
  parseCardListQuery,
  parseCategoryFilter,
  type Parsed,
} from '../domain/requests.js'
import { MASTERED } from '../domain/progress.js'
import { mockOwnerOf } from './identity.js'
import { mockBackend, type MockStore, type WriteResult } from './store.js'

const error = (status: number, body: ApiErrorBody) =>
  HttpResponse.json(body, { status })

const invalid = (message: string, fieldErrors: Record<string, string>) =>
  error(400, { code: 'validation_failed', message, fieldErrors })

/** The backend's answer to a request without a valid session token. */
export const unauthorized = () =>
  error(401, { code: 'unauthorized', message: 'Sign in to continue.' })

/** The backend's answer when the Collection is full. */
export const quotaExceeded = () =>
  error(409, {
    code: 'quota_exceeded',
    message: QUOTA_EXCEEDED_MESSAGE,
  })

/**
 * Runs `resolve` with the Collection of the account the request's bearer
 * token speaks for; without one, answers 401 and touches nothing.
 */
function owned<R extends { request: Request }>(
  resolve: (info: R, store: MockStore) => Response | Promise<Response>,
) {
  return (info: R) => {
    const owner = mockOwnerOf(info.request)
    if (!owner) return unauthorized()
    return resolve(info, mockBackend.collectionOf(owner))
  }
}

/** The backend's answer when an idempotency key is reused for another request. */
const keyReused = () =>
  error(422, {
    code: 'idempotency_key_reused',
    message: 'This Idempotency-Key was used for a different request.',
  })

/** The backend's answer when no Card has this id. */
export const notFound = (cardId: string) =>
  error(404, { code: 'not_found', message: `No Card has the id "${cardId}".` })

/** Reads a `CardInput` or `CardPatch` body. */
async function readCardBody(request: Request, options: { required: boolean }) {
  const body: unknown = await request.json().catch(() => undefined)
  return parseCardBody(body, options)
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
    return {
      ok: false,
      error: 'The body must be a JSON object.',
      fieldErrors: {},
    }
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

/**
 * The mock backend: the parts of api/openapi.yaml implemented so far.
 * Paths are relative to the page's origin unless `origin` is given (in Node,
 * where there is no page).
 */
export const createHandlers = (origin = '') => [
  http.get(
    `${origin}/api/cards`,
    owned(({ request }, store) => {
      const query = parseCardListQuery(new URL(request.url).searchParams)
      if (!query.ok) return invalid(query.error, query.fieldErrors)
      return HttpResponse.json<CardPage>(store.listCards(query.value))
    }),
  ),

  http.post(
    `${origin}/api/cards`,
    owned(async ({ request }, store) => {
      const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)
      const body = await readCardBody(request, { required: true })
      if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
        return invalid('The Idempotency-Key header is invalid.', {
          ...(body.ok ? {} : body.fieldErrors),
          [IDEMPOTENCY_KEY_HEADER]: IDEMPOTENCY_KEY_MESSAGE,
        })
      }
      if (!body.ok) return invalid(body.error, body.fieldErrors)
      const fields = body.value as CardText
      const result = store.createCardOnce(
        fields,
        key,
        creationFingerprint(fields),
      )
      if (!result.ok && result.reason === 'quota_exceeded')
        return quotaExceeded()
      if (!result.ok && result.reason === 'key_reused') return keyReused()
      const response = writeResponse(result as WriteResult, '', 201)
      if (result.ok && result.replayed)
        response.headers.set(IDEMPOTENT_REPLAYED_HEADER, 'true')
      return response
    }),
  ),

  // Before /api/cards/:cardId, which would take "statistics" for an id.
  http.get(
    `${origin}/api/cards/statistics`,
    owned(({ request }, store) => {
      const filter = parseCategoryFilter(new URL(request.url).searchParams)
      if (!filter.ok) return invalid(filter.error, filter.fieldErrors)
      return HttpResponse.json<CardStatistics>(store.statistics(filter.value))
    }),
  ),

  http.get<{ cardId: string }>(
    `${origin}/api/cards/:cardId`,
    owned(({ params }, store) => {
      const card = store.getCard(params.cardId)
      if (!card) return notFound(params.cardId)
      return HttpResponse.json<Card>(card)
    }),
  ),

  http.patch<{ cardId: string }>(
    `${origin}/api/cards/:cardId`,
    owned(async ({ params, request }, store) => {
      if (!store.getCard(params.cardId)) return notFound(params.cardId)
      const body = await readCardBody(request, { required: false })
      if (!body.ok) return invalid(body.error, body.fieldErrors)
      return writeResponse(
        store.updateCard(params.cardId, body.value),
        params.cardId,
      )
    }),
  ),

  http.put<{ cardId: string }>(
    `${origin}/api/cards/:cardId/progress`,
    owned(async ({ params, request }, store) => {
      if (!store.getCard(params.cardId)) return notFound(params.cardId)
      const body = await readProgressBody(request)
      if (!body.ok) return invalid(body.error, body.fieldErrors)
      const card = store.setProgress(params.cardId, body.value)
      if (!card) return notFound(params.cardId)
      return HttpResponse.json<Card>(card)
    }),
  ),

  http.delete<{ cardId: string }>(
    `${origin}/api/cards/:cardId`,
    owned(({ params }, store) => {
      if (!store.deleteCard(params.cardId)) return notFound(params.cardId)
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get(
    `${origin}/api/categories`,
    owned((_, store) =>
      HttpResponse.json<CategoryList>({ items: store.listCategories() }),
    ),
  ),
]

export const handlers = createHandlers()
