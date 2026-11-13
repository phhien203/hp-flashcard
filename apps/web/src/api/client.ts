import type {
  ApiErrorBody,
  Card,
  CardInput,
  CardPage,
  CardPatch,
  CategoryList,
  ListCardsQuery,
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

/**
 * A typed client for the API in api/openapi.yaml, on native `fetch`. It
 * neither knows nor cares whether MSW or a real server answers.
 */
export function createApiClient(baseUrl = '') {
  async function request<T>(
    path: string,
    {
      method = 'GET',
      body,
      signal,
    }: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => undefined)
      throw new ApiError(response.status, isErrorBody(body) ? body : undefined)
    }
    return (await response.json()) as T
  }

  return {
    listCards: (query: ListCardsQuery, signal?: AbortSignal) => {
      const search = toSearchParams(query).toString()
      return request<CardPage>(`/api/cards${search ? `?${search}` : ''}`, {
        signal,
      })
    },
    getCard: (cardId: string, signal?: AbortSignal) =>
      request<Card>(`/api/cards/${encodeURIComponent(cardId)}`, { signal }),
    createCard: (input: CardInput) =>
      request<Card>('/api/cards', { method: 'POST', body: input }),
    updateCard: (cardId: string, patch: CardPatch) =>
      request<Card>(`/api/cards/${encodeURIComponent(cardId)}`, {
        method: 'PATCH',
        body: patch,
      }),
    listCategories: (signal?: AbortSignal) =>
      request<CategoryList>('/api/categories', { signal }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

/** The client the app uses: the API on the app's own origin. */
export const api = createApiClient()
