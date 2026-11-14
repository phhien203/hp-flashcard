import { IDEMPOTENCY_KEY_HEADER } from '../domain/idempotency.js'
import type {
  ApiErrorBody,
  Card,
  CardInput,
  CardPage,
  CardPatch,
  CardStatistics,
  CardStatisticsQuery,
  CategoryList,
  ListCardsQuery,
  ProgressInput,
} from './types.js'

/** A failed API response, with the contract's error body when there is one. */
export class ApiError extends Error {
  readonly status: number
  readonly body: ApiErrorBody | undefined

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.message ?? `The API responded with ${status}.`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ApiErrorBody).code === 'string' &&
  typeof (value as ApiErrorBody).message === 'string'

/** Builds a query string, repeating array parameters (`category=a&category=b`). */
export function toSearchParams(
  query: Record<
    string,
    string | number | boolean | readonly string[] | undefined
  >,
) {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(name, item)
    } else {
      params.append(name, String(value))
    }
  }
  return params
}

/** `path` with `query` appended, or bare when every parameter is unset. */
const withQuery = (
  path: string,
  query: Parameters<typeof toSearchParams>[0],
) => {
  const search = toSearchParams(query).toString()
  return search ? `${path}?${search}` : path
}

export interface ApiClientOptions {
  baseUrl?: string
  /**
   * The signed-in person's current session token, sent as a bearer token
   * with every request. `null` sends none, and the API answers 401.
   */
  getToken: () => Promise<string | null>
}

/**
 * A typed client for the API in api/openapi.yaml, on native `fetch`, for
 * one signed-in account. It neither knows nor cares whether MSW or a real
 * server answers.
 */
export function createApiClient({ baseUrl = '', getToken }: ApiClientOptions) {
  async function request<T>(
    path: string,
    {
      method = 'GET',
      body,
      signal,
      headers,
    }: {
      method?: string
      body?: unknown
      signal?: AbortSignal
      headers?: Record<string, string>
    } = {},
  ): Promise<T> {
    const token = await getToken()
    signal?.throwIfAborted()
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => undefined)
      throw new ApiError(response.status, isErrorBody(body) ? body : undefined)
    }
    // 204 No Content has no body.
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return {
    listCards: (query: ListCardsQuery, signal?: AbortSignal) =>
      request<CardPage>(withQuery('/api/cards', query), { signal }),
    getCard: (cardId: string, signal?: AbortSignal) =>
      request<Card>(`/api/cards/${encodeURIComponent(cardId)}`, { signal }),
    /**
     * Creates a Card. Retrying the same intended creation must repeat its
     * `idempotencyKey`, so the backend creates it at most once.
     */
    createCard: (input: CardInput, idempotencyKey: string) =>
      request<Card>('/api/cards', {
        method: 'POST',
        body: input,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      }),
    updateCard: (cardId: string, patch: CardPatch) =>
      request<Card>(`/api/cards/${encodeURIComponent(cardId)}`, {
        method: 'PATCH',
        body: patch,
      }),
    setCardProgress: (cardId: string, progress: ProgressInput['progress']) =>
      request<Card>(`/api/cards/${encodeURIComponent(cardId)}/progress`, {
        method: 'PUT',
        body: { progress } satisfies ProgressInput,
      }),
    getCardStatistics: (query: CardStatisticsQuery, signal?: AbortSignal) =>
      request<CardStatistics>(withQuery('/api/cards/statistics', query), {
        signal,
      }),
    deleteCard: (cardId: string) =>
      request<void>(`/api/cards/${encodeURIComponent(cardId)}`, {
        method: 'DELETE',
      }),
    listCategories: (signal?: AbortSignal) =>
      request<CategoryList>('/api/categories', { signal }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
