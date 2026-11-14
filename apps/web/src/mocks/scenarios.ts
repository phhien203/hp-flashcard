import {
  delay,
  http,
  HttpResponse,
  type AnyHandler,
  type PathParams,
} from 'msw'

import type { ApiErrorBody } from '../api/types.js'
import { notFound, rateLimited } from './handlers.js'
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
  /** Creating, editing, deleting and saving Progress takes 1.5 seconds. */
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
    http.put('/api/cards/:cardId/progress', async () => {
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
  /** The first Progress save fails with a server error; later ones work. */
  'progress-error': () => [
    writeFailsOnce('put', '/api/cards/:cardId/progress', serverError),
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
  /**
   * Before the first Card edit lands, another device edits the same Card,
   * so the edit conflicts (409).
   */
  'edit-conflict': (store: MockStore) => [editedElsewhereFirst('patch', store)],
  /**
   * Before the first Card deletion lands, another device edits the Card,
   * so the deletion conflicts (409).
   */
  'delete-conflict': (store: MockStore) => [
    editedElsewhereFirst('delete', store),
  ],
  /**
   * Before the first Progress save lands, another device saves the same
   * Card's Progress (resetting it), so the save conflicts (409).
   */
  'progress-conflict': (store: MockStore) => {
    let done = false
    return [
      http.put('/api/cards/:cardId/progress', ({ params }) => {
        if (done) return
        done = true
        store.setProgress(String(params.cardId), ELSEWHERE_PROGRESS)
      }),
    ]
  },
  /**
   * The first write of any kind is refused by the write rate limit (429,
   * retry after 30 seconds) and does nothing; later ones work.
   */
  'rate-limited': () => {
    let limited = false
    const once = () => {
      if (limited) return
      limited = true
      return rateLimited(RATE_LIMITED_SECONDS)
    }
    return [
      http.post('/api/cards', once),
      http.patch('/api/cards/:cardId', once),
      http.delete('/api/cards/:cardId', once),
      http.put('/api/cards/:cardId/progress', once),
    ]
  },
} satisfies Record<string, (store: MockStore) => AnyHandler[]>

/** What another device sets a Card's Progress to, in `progress-conflict`. */
export const ELSEWHERE_PROGRESS = 0

/** The `Retry-After` of `rate-limited`. */
export const RATE_LIMITED_SECONDS = 30

/** What another device changes a Card's answer to, in the conflict scenarios. */
export const ELSEWHERE_ANSWER = 'Changed on another device.'

/** Edits the Card of the first matching write elsewhere, then lets it through. */
function editedElsewhereFirst(method: 'patch' | 'delete', store: MockStore) {
  let done = false
  return http[method]('/api/cards/:cardId', ({ params }) => {
    if (done) return
    done = true
    store.updateCard(String(params.cardId), { answer: ELSEWHERE_ANSWER })
  })
}

export type ScenarioName = keyof typeof SCENARIOS

/** The backend's answer when it fails. */
export const serverError = () =>
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
  method: 'post' | 'patch' | 'put' | 'delete',
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
