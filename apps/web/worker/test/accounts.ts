import type { contractChecker, Method } from '../../src/api/contract-check.js'
import { IDEMPOTENCY_KEY_HEADER } from '../../src/domain/idempotency.js'
import { ifMatch, IF_MATCH_HEADER } from '../../src/domain/versions.js'
import type { Issuer } from './harness.js'

export type Card = {
  id: string
  question: string
  answer: string
  category: { id: string; name: string }
  progress: number
  contentVersion: number
  progressVersion: number
}
export type CardPage = {
  items: Card[]
  total: number
  nextOffset: number | null
}

type Check = Awaited<ReturnType<typeof contractChecker>>

export const newKey = (): string => crypto.randomUUID()

/** Card text numbered `n`. */
export const card = (n: number | string, category = 'General') => ({
  question: `Question ${n}?`,
  answer: `Answer ${n}.`,
  category,
})

let accounts = 0

/**
 * A new account, with a valid session, so tests don't share Collections.
 * Every call goes through `check`, so every response is checked against
 * api/openapi.yaml.
 */
export function newAccount({
  issuer,
  check,
}: {
  issuer: Issuer
  check: Check
}) {
  const userId = `user_test_${++accounts}_${crypto.randomUUID().slice(0, 8)}`
  const auth = (sid = 'sess_1') => ({
    Authorization: `Bearer ${issuer.sessionToken({ sub: userId, sid })}`,
  })
  const call = async (
    method: Method,
    template: string,
    path: string,
    status: number,
    {
      body,
      headers,
    }: { body?: unknown; headers?: Record<string, string> } = {},
  ) =>
    check(method, template, path, status, {
      body,
      headers: { ...auth(), ...headers },
    })
  return {
    userId,
    auth,
    call,
    create: (
      body: unknown,
      { status = 201, key = newKey() }: { status?: number; key?: string } = {},
    ) =>
      call('post', '/api/cards', '/api/cards', status, {
        body,
        headers: { [IDEMPOTENCY_KEY_HEADER]: key },
      }),
    /** Edits `cardId` as of content `version`. */
    edit: (
      cardId: string,
      version: number,
      body: unknown,
      { status = 200, key = newKey() }: { status?: number; key?: string } = {},
    ) =>
      call('patch', '/api/cards/{cardId}', `/api/cards/${cardId}`, status, {
        body,
        headers: {
          [IDEMPOTENCY_KEY_HEADER]: key,
          [IF_MATCH_HEADER]: ifMatch(version),
        },
      }),
    /** Deletes `cardId` as of content `version`. */
    remove: (
      cardId: string,
      version: number,
      { status = 204, key = newKey() }: { status?: number; key?: string } = {},
    ) =>
      call('delete', '/api/cards/{cardId}', `/api/cards/${cardId}`, status, {
        headers: {
          [IDEMPOTENCY_KEY_HEADER]: key,
          [IF_MATCH_HEADER]: ifMatch(version),
        },
      }),
    /** Sets `cardId`'s Progress as of Progress `version`. */
    saveProgress: (
      cardId: string,
      version: number,
      progress: unknown,
      { status = 200, key = newKey() }: { status?: number; key?: string } = {},
    ) =>
      call(
        'put',
        '/api/cards/{cardId}/progress',
        `/api/cards/${cardId}/progress`,
        status,
        {
          body: { progress },
          headers: {
            [IDEMPOTENCY_KEY_HEADER]: key,
            [IF_MATCH_HEADER]: ifMatch(version),
          },
        },
      ),
    get: (cardId: string, status = 200) =>
      call('get', '/api/cards/{cardId}', `/api/cards/${cardId}`, status),
    statistics: async (query = '') =>
      (
        await call(
          'get',
          '/api/cards/statistics',
          `/api/cards/statistics${query}`,
          200,
        )
      ).body as Record<string, number>,
    list: async (query = '') =>
      (await call('get', '/api/cards', `/api/cards${query}`, 200))
        .body as CardPage,
    categories: async () =>
      (
        (await call('get', '/api/categories', '/api/categories', 200)).body as {
          items: { id: string; name: string; count: number }[]
        }
      ).items,
  }
}

export type Account = ReturnType<typeof newAccount>
