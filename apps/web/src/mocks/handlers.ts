import { http, HttpResponse } from 'msw'

import type {
  ApiErrorBody,
  CardPage,
  CategoryList,
  Card,
} from '../api/types.js'
import { mockStore } from './store.js'

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 48
const MAX_SEED = 4294967295

const error = (status: number, body: ApiErrorBody) =>
  HttpResponse.json(body, { status })

/** Parses an optional whole-number parameter, or explains why it can't. */
function wholeNumber(
  raw: string | null,
  { min, max, fallback }: { min: number; max: number; fallback?: number },
): number | undefined | string {
  if (raw === null) return fallback
  if (!/^\d+$/.test(raw)) return 'Must be a whole number.'
  const value = Number(raw)
  if (value < min || value > max) return `Must be from ${min} to ${max}.`
  return value
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
    if (
      hideMasteredRaw !== null &&
      !['true', 'false'].includes(hideMasteredRaw)
    )
      fieldErrors.hideMastered = 'Must be true or false.'

    const offset = wholeNumber(params.get('offset'), {
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      fallback: 0,
    })
    if (typeof offset === 'string') fieldErrors.offset = offset
    const limit = wholeNumber(params.get('limit'), {
      min: 1,
      max: MAX_LIMIT,
      fallback: DEFAULT_LIMIT,
    })
    if (typeof limit === 'string') fieldErrors.limit = limit
    const seed = wholeNumber(params.get('seed'), { min: 0, max: MAX_SEED })
    if (typeof seed === 'string') fieldErrors.seed = seed

    if (
      Object.keys(fieldErrors).length > 0 ||
      typeof offset !== 'number' ||
      typeof limit !== 'number' ||
      typeof seed === 'string'
    ) {
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
        offset,
        limit,
        seed,
      }),
    )
  }),

  http.get<{ cardId: string }>(`${origin}/api/cards/:cardId`, ({ params }) => {
    const card = mockStore.getCard(params.cardId)
    if (!card) {
      return error(404, {
        code: 'not_found',
        message: `No Card has the id "${params.cardId}".`,
      })
    }
    return HttpResponse.json<Card>(card)
  }),

  http.get(`${origin}/api/categories`, () =>
    HttpResponse.json<CategoryList>({ items: mockStore.listCategories() }),
  ),
]

export const handlers = createHandlers()
