import { delay, http, HttpResponse, type AnyHandler } from 'msw'

import type { ApiErrorBody } from '../api/types.js'
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
