import {
  delay,
  http,
  HttpResponse,
  type AnyHandler,
  type PathParams,
} from 'msw'

import type { ApiErrorBody } from '../api/types.js'
import { notFound } from './handlers.js'
import type { MockStore } from './store.js'

/**
 * Development-only situations the mock backend can be put in, to see and
 * test loading, empty and failure states. They live in the mock layer, not
 * in the API contract: in development, pick them with the page URL, e.g.
 * `/?scenario=page-error` or `/?scenario=slow,empty`.
 */
export const SCENARIOS = {
  /** Every Card listing takes 1.5 seconds. */
  slow: () => [
    http.get('/api/cards', async () => {
      await delay(1500)
      // Returning nothing hands the request on to the real handler.
    }),
  ],
  /** The backend starts with no Cards. */
  empty: (store: MockStore) => {
    store.reset([])
    return []
  },
  /** The first request for the first page of Cards fails; later ones work. */
  'initial-error': () => failOnce((offset) => offset === 0),
  /** The first request for a later page of Cards fails; later ones work. */
  'page-error': () => failOnce((offset) => offset > 0),
  /** The Category listing fails once. */
  'categories-error': () => {
    let failed = false
    return [
      http.get('/api/categories', () => {
        if (failed) return
        failed = true
        return serverError()
      }),
    ]
  },
  /** Creating, editing and deleting Cards takes 1.5 seconds. */
  'slow-writes': () => [
    http.post('/api/cards', async () => {
      await delay(1500)
    }),
    http.patch('/api/cards/:cardId', async () => {
      await delay(1500)
    }),
    http.delete('/api/cards/:cardId', async () => {
      await delay(1500)
    }),
  ],
  /** The first Card creation fails with a server error; later ones work. */
  'create-error': () => [writeFailsOnce('post', '/api/cards', serverError)],
  /** The first Card edit fails with a server error; later ones work. */
  'edit-error': () => [
    writeFailsOnce('patch', '/api/cards/:cardId', serverError),
  ],
  /** The first Card edit finds no such Card, as if it had been deleted. */
  'edit-not-found': () => [
    writeFailsOnce('patch', '/api/cards/:cardId', ({ params }) =>
      notFound(String(params.cardId)),
    ),
  ],
  /** The first Card deletion fails with a server error; later ones work. */
  'delete-error': () => [
    writeFailsOnce('delete', '/api/cards/:cardId', serverError),
  ],
  /**
   * The first Card deletion finds no such Card, as if another client had
   * deleted it already: the Card is deleted too, then the backend says 404.
   */
  'delete-not-found': (store: MockStore) => [
    writeFailsOnce('delete', '/api/cards/:cardId', ({ params }) => {
      const cardId = String(params.cardId)
      store.deleteCard(cardId)
      return notFound(cardId)
    }),
  ],
} satisfies Record<string, (store: MockStore) => AnyHandler[]>

export type ScenarioName = keyof typeof SCENARIOS

const serverError = () =>
  HttpResponse.json<ApiErrorBody>(
    { code: 'server_error', message: 'The server failed.' },
    { status: 500 },
  )

/** Fails the first Card listing whose offset matches, then lets them through. */
function failOnce(matches: (offset: number) => boolean) {
  let failed = false
  return [
    http.get('/api/cards', ({ request }) => {
      const offset = Number(new URL(request.url).searchParams.get('offset'))
      if (failed || !matches(offset)) return
      failed = true
      return serverError()
    }),
  ]
}

/** Answers the first matching write with `respond`, then lets them through. */
function writeFailsOnce(
  method: 'post' | 'patch' | 'delete',
  path: string,
  respond: (request: { params: PathParams }) => Response,
) {
  let failed = false
  return http[method](path, ({ params }) => {
    if (failed) return
    failed = true
    return respond({ params })
  })
}

export const isScenarioName = (name: string): name is ScenarioName =>
  Object.hasOwn(SCENARIOS, name)

/** Reads the scenario names in a page URL's `scenario` parameter. */
export function scenariosFromUrl(url: string): ScenarioName[] {
  const raw = new URL(url).searchParams.get('scenario') ?? ''
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter(isScenarioName)
}
