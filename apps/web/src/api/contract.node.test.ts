import { readFile } from 'node:fs/promises'

import { compileErrors, dereference, validate } from '@readme/openapi-parser'
import { http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { generateApiTypes, TYPES_URL } from '../../scripts/api-types.ts'
import { CARD_QUOTA } from '../domain/card-text.js'
import { IDEMPOTENCY_KEY_HEADER } from '../domain/idempotency.js'
import { ifMatch, IF_MATCH_HEADER } from '../domain/versions.js'
import { createHandlers, rateLimited } from '../mocks/handlers.js'
import { mockToken } from '../mocks/identity.js'
import { RATE_LIMITED_SECONDS, serverError } from '../mocks/scenarios.js'
import { MOCK_DEMO_USER, mockBackend, mockStore } from '../mocks/store.js'
import { contractChecker, SPEC_PATH, type Method } from './contract-check.js'

const ORIGIN = 'http://localhost'
const bearer = (userId: string) => ({
  Authorization: `Bearer ${mockToken(userId)}`,
})

describe('the OpenAPI document', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    const result = await validate(SPEC_PATH)
    expect(result.valid ? '' : compileErrors(result)).toBe('')
  })

  it('defines every operation the app needs', async () => {
    const spec = await dereference(SPEC_PATH)
    const operations = Object.entries(spec.paths ?? {}).flatMap(
      ([path, item]) =>
        ['get', 'post', 'patch', 'delete', 'put']
          .filter((method) => method in (item ?? {}))
          .map((method) => `${method.toUpperCase()} ${path}`),
    )
    expect(operations.sort()).toEqual([
      'DELETE /api/cards/{cardId}',
      'GET /api/cards',
      'GET /api/cards/statistics',
      'GET /api/cards/{cardId}',
      'GET /api/categories',
      'GET /api/health',
      'PATCH /api/cards/{cardId}',
      'POST /api/cards',
      'POST /api/webhooks/clerk',
      'PUT /api/cards/{cardId}/progress',
    ])
  })

  it('matches the generated TypeScript types', async () => {
    // If this fails: pnpm --filter @hp-flashcard/web generate:api
    expect(await readFile(TYPES_URL, 'utf8')).toBe(await generateApiTypes())
  })
})

describe('the mock backend', () => {
  const server = setupServer(...createHandlers(ORIGIN))
  let check: Awaited<ReturnType<typeof contractChecker>>

  beforeAll(async () => {
    check = await contractChecker((path, init) =>
      fetch(`${ORIGIN}${path}`, init),
    )
    server.listen({ onUnhandledFrame: 'error' })
  })
  beforeEach(() => {
    mockBackend.reset()
    server.resetHandlers()
  })
  afterAll(() => server.close())

  /**
   * Sends a request as the demo account (a write with a fresh idempotency
   * key, and an edit or deletion based on the Card's current version), and
   * checks it against the contract: the body.
   */
  async function expectConforms(
    method: Method,
    pathTemplate: string,
    path: string,
    status: number,
    requestBody?: unknown,
  ) {
    const cardId = path.split('/')[3] ?? ''
    const key: Record<string, string> =
      method === 'post'
        ? { [IDEMPOTENCY_KEY_HEADER]: newKey() }
        : method === 'patch' || method === 'delete'
          ? {
              [IDEMPOTENCY_KEY_HEADER]: newKey(),
              [IF_MATCH_HEADER]: ifMatch(
                mockStore.getCard(cardId)?.contentVersion ?? 1,
              ),
            }
          : method === 'put'
            ? {
                [IDEMPOTENCY_KEY_HEADER]: newKey(),
                [IF_MATCH_HEADER]: ifMatch(
                  mockStore.getCard(cardId)?.progressVersion ?? 1,
                ),
              }
            : {}
    const { body } = await check(method, pathTemplate, path, status, {
      body: requestBody,
      headers: { ...bearer(MOCK_DEMO_USER), ...key },
    })
    return body
  }

  it('lists the first page of Cards', async () => {
    const page = await expectConforms('get', '/api/cards', '/api/cards', 200)
    expect(page).toMatchObject({
      total: 40,
      offset: 0,
      limit: 12,
      nextOffset: 12,
    })
  })

  it('lists a filtered, shuffled last page', async () => {
    const page = await expectConforms(
      'get',
      '/api/cards',
      '/api/cards?category=cat-1&category=cat-2&hideMastered=true&offset=12&limit=12&seed=99',
      200,
    )
    expect(page).toMatchObject({ offset: 12, nextOffset: null })
  })

  it.for([
    ['offset=-1', 'offset'],
    ['limit=0', 'limit'],
    ['limit=49', 'limit'],
    ['hideMastered=yes', 'hideMastered'],
    ['seed=4294967296', 'seed'],
  ])('rejects ?%s with a field error', async ([query, field]) => {
    const body = await expectConforms(
      'get',
      '/api/cards',
      `/api/cards?${query}`,
      400,
    )
    expect(body).toMatchObject({
      code: 'validation_failed',
      fieldErrors: { [field!]: expect.any(String) },
    })
  })

  it('gets one Card', async () => {
    const card = await expectConforms(
      'get',
      '/api/cards/{cardId}',
      '/api/cards/card-01',
      200,
    )
    expect(card).toMatchObject({ id: 'card-01', progress: 5 })
  })

  it('answers 404 for an unknown Card', async () => {
    const body = await expectConforms(
      'get',
      '/api/cards/{cardId}',
      '/api/cards/nope',
      404,
    )
    expect(body).toMatchObject({ code: 'not_found' })
  })

  it('lists Categories with global counts', async () => {
    const body = await expectConforms(
      'get',
      '/api/categories',
      '/api/categories',
      200,
    )
    expect(body).toMatchObject({
      items: expect.arrayContaining([
        { id: expect.any(String), name: 'Biology', count: 7 },
      ]),
    })
  })

  const input = {
    question: '  What is DNA? ',
    answer: 'Deoxyribonucleic acid.',
    category: ' biology',
  }

  it('creates a Card', async () => {
    const card = await expectConforms(
      'post',
      '/api/cards',
      '/api/cards',
      201,
      input,
    )
    expect(card).toMatchObject({
      question: 'What is DNA?',
      category: { name: 'Biology' },
      progress: 0,
    })
  })

  it.for([
    [{ ...input, question: '   ' }, 'question'],
    [{ question: 'Q?', answer: 'A.' }, 'category'],
    [{ ...input, answer: 42 }, 'answer'],
    [{ ...input, progress: 5 }, 'progress'],
  ] as const)(
    'rejects a Card with a bad %# field with a field error',
    async ([body, field]) => {
      const error = await expectConforms(
        'post',
        '/api/cards',
        '/api/cards',
        400,
        body,
      )
      expect(error).toMatchObject({
        code: 'validation_failed',
        fieldErrors: { [field]: expect.any(String) },
      })
    },
  )

  it('edits a Card, keeping its id and Progress', async () => {
    const card = await expectConforms(
      'patch',
      '/api/cards/{cardId}',
      '/api/cards/card-01',
      200,
      { category: 'History ' },
    )
    expect(card).toMatchObject({
      id: 'card-01',
      progress: 5,
      category: { name: 'History' },
    })
  })

  it('rejects a blank edit with a field error', async () => {
    const error = await expectConforms(
      'patch',
      '/api/cards/{cardId}',
      '/api/cards/card-01',
      400,
      { answer: ' ' },
    )
    expect(error).toMatchObject({
      code: 'validation_failed',
      fieldErrors: { answer: expect.any(String) },
    })
  })

  it('rejects an empty edit', async () => {
    const error = await expectConforms(
      'patch',
      '/api/cards/{cardId}',
      '/api/cards/card-01',
      400,
      {},
    )
    expect(error).toMatchObject({ code: 'validation_failed' })
  })

  it('answers 404 when editing an unknown Card', async () => {
    const error = await expectConforms(
      'patch',
      '/api/cards/{cardId}',
      '/api/cards/nope',
      404,
      { question: 'Q?' },
    )
    expect(error).toMatchObject({ code: 'not_found' })
  })

  it('deletes a Card, with no content', async () => {
    await expectConforms(
      'delete',
      '/api/cards/{cardId}',
      '/api/cards/card-01',
      204,
    )
    await expectConforms(
      'get',
      '/api/cards/{cardId}',
      '/api/cards/card-01',
      404,
    )
  })

  it('answers 404 when deleting an unknown or deleted Card', async () => {
    await expectConforms(
      'delete',
      '/api/cards/{cardId}',
      '/api/cards/card-01',
      204,
    )
    for (const id of ['card-01', 'nope']) {
      const error = await expectConforms(
        'delete',
        '/api/cards/{cardId}',
        `/api/cards/${id}`,
        404,
      )
      expect(error).toMatchObject({ code: 'not_found' })
    }
  })

  // The body the development `delete-error` scenario sends.
  it('answers 500 when deleting fails on the server', async () => {
    server.use(http.delete(`${ORIGIN}/api/cards/:cardId`, serverError))
    const error = await expectConforms(
      'delete',
      '/api/cards/{cardId}',
      '/api/cards/card-01',
      500,
    )
    expect(error).toMatchObject({ code: 'server_error' })
  })

  describe('versioned edits and deletions', () => {
    const write = (
      method: 'patch' | 'delete',
      cardId: string,
      status: number,
      {
        version,
        key = newKey(),
        body,
      }: { version: number; key?: string; body?: unknown },
    ) =>
      check(method, '/api/cards/{cardId}', `/api/cards/${cardId}`, status, {
        body,
        headers: {
          ...bearer(MOCK_DEMO_USER),
          [IDEMPOTENCY_KEY_HEADER]: key,
          [IF_MATCH_HEADER]: ifMatch(version),
        },
      })

    it('advances the content version with each edit', async () => {
      const { body } = await write('patch', 'card-02', 200, {
        version: 1,
        body: { answer: 'Canberra.' },
      })
      expect(body).toMatchObject({ id: 'card-02', contentVersion: 2 })
    })

    it('refuses a stale edit or deletion with a conflict, changing nothing', async () => {
      await write('patch', 'card-02', 200, {
        version: 1,
        body: { answer: 'B.' },
      })
      for (const method of ['patch', 'delete'] as const) {
        const { body } = await write(method, 'card-02', 409, {
          version: 1,
          body: method === 'patch' ? { answer: 'C.' } : undefined,
        })
        expect(body).toMatchObject({ code: 'version_conflict' })
      }
      expect(mockStore.getCard('card-02')).toMatchObject({
        answer: 'B.',
        contentVersion: 2,
      })
    })

    it('replays a repeated key, even after later writes, and refuses its reuse', async () => {
      const key = newKey()
      const first = await write('patch', 'card-02', 200, {
        version: 1,
        key,
        body: { answer: 'B.' },
      })
      await write('patch', 'card-02', 200, {
        version: 2,
        body: { answer: 'C.' },
      })
      const again = await write('patch', 'card-02', 200, {
        version: 1,
        key,
        body: { answer: 'B.' },
      })
      expect(again.body).toEqual(first.body)
      expect(again.headers.get('Idempotent-Replayed')).toBe('true')
      expect(mockStore.getCard('card-02')).toMatchObject({ answer: 'C.' })
      const reused = await write('patch', 'card-02', 422, {
        version: 1,
        key,
        body: { answer: 'D.' },
      })
      expect(reused.body).toMatchObject({ code: 'idempotency_key_reused' })

      const deletion = newKey()
      await write('delete', 'card-02', 204, { version: 3, key: deletion })
      const replayed = await write('delete', 'card-02', 204, {
        version: 3,
        key: deletion,
      })
      expect(replayed.headers.get('Idempotent-Replayed')).toBe('true')
    })

    it.for(['patch', 'delete'] as const)(
      'rejects %s without its write headers',
      async (method) => {
        const { body } = await check(
          method,
          '/api/cards/{cardId}',
          '/api/cards/card-02',
          400,
          {
            body: method === 'patch' ? { answer: 'B.' } : undefined,
            headers: bearer(MOCK_DEMO_USER),
          },
        )
        expect(body).toMatchObject({
          fieldErrors: {
            [IDEMPOTENCY_KEY_HEADER]: expect.any(String),
            [IF_MATCH_HEADER]: expect.any(String),
          },
        })
      },
    )
  })

  describe('Progress', () => {
    const setProgress = (cardId: string, body: unknown, status: number) =>
      expectConforms(
        'put',
        '/api/cards/{cardId}/progress',
        `/api/cards/${cardId}/progress`,
        status,
        body,
      )

    it("sets a Card's Progress, keeping its content, Category and place", async () => {
      const before = mockStore.getCard('card-02')
      const card = await setProgress('card-02', { progress: 5 }, 200)
      expect(card).toEqual({ ...before, progress: 5, progressVersion: 2 })
      const page = await expectConforms(
        'get',
        '/api/cards',
        '/api/cards?limit=3',
        200,
      )
      expect(page).toMatchObject({
        items: [{ id: 'card-01' }, { id: 'card-02', progress: 5 }, {}],
      })
    })

    it('resets to 0, advancing the Progress version each time', async () => {
      const card = await setProgress('card-01', { progress: 0 }, 200)
      expect(card).toMatchObject({
        id: 'card-01',
        progress: 0,
        contentVersion: 1,
        progressVersion: 2,
      })
      await expect(
        setProgress('card-01', { progress: 3 }, 200),
      ).resolves.toMatchObject({ progress: 3, progressVersion: 3 })
      await expect(
        expectConforms('get', '/api/cards/{cardId}', '/api/cards/card-01', 200),
      ).resolves.toMatchObject({ progress: 3 })
    })

    /** Saves card-02's Progress with these headers, unchecked by the store. */
    const save = (
      progress: number,
      { key, version }: { key: string; version: number },
      status: number,
    ) =>
      check(
        'put',
        '/api/cards/{cardId}/progress',
        '/api/cards/card-02/progress',
        status,
        {
          body: { progress },
          headers: {
            ...bearer(MOCK_DEMO_USER),
            [IDEMPOTENCY_KEY_HEADER]: key,
            [IF_MATCH_HEADER]: ifMatch(version),
          },
        },
      )

    it('refuses a save based on an older Progress version with 409', async () => {
      mockStore.setProgress('card-02', 1) // Another device.
      const { body } = await save(5, { key: newKey(), version: 1 }, 409)
      expect(body).toMatchObject({ code: 'version_conflict' })
      expect(mockStore.getCard('card-02')).toMatchObject({ progress: 1 })
    })

    it('replays a retried save without applying it again, and refuses a reused key', async () => {
      const key = newKey()
      const first = await save(5, { key, version: 1 }, 200)
      mockStore.setProgress('card-02', 0)
      const replay = await save(5, { key, version: 1 }, 200)
      expect(replay.headers.get('Idempotent-Replayed')).toBe('true')
      expect(replay.body).toEqual(first.body)
      expect(mockStore.getCard('card-02')).toMatchObject({ progress: 0 })
      await save(4, { key, version: 1 }, 422)
    })

    it('requires the idempotency key and Progress version headers', async () => {
      const { body } = await check(
        'put',
        '/api/cards/{cardId}/progress',
        '/api/cards/card-02/progress',
        400,
        { body: { progress: 5 }, headers: bearer(MOCK_DEMO_USER) },
      )
      expect(body).toMatchObject({
        fieldErrors: {
          [IDEMPOTENCY_KEY_HEADER]: expect.any(String),
          [IF_MATCH_HEADER]: expect.stringContaining('progressVersion'),
        },
      })
    })

    it.for([
      [{ progress: -1 }, 'progress'],
      [{ progress: 6 }, 'progress'],
      [{ progress: 2.5 }, 'progress'],
      [{ progress: '3' }, 'progress'],
      [{}, 'progress'],
      [{ progress: 1, question: 'Q?' }, 'question'],
    ] as const)(
      'rejects the body %j with a field error',
      async ([body, field]) => {
        const error = await setProgress('card-02', body, 400)
        expect(error).toMatchObject({
          code: 'validation_failed',
          fieldErrors: { [field]: expect.any(String) },
        })
        expect(mockStore.getCard('card-02')).toMatchObject({ progress: 4 })
      },
    )

    it('rejects a body that is not an object', async () => {
      const error = await setProgress('card-02', [3], 400)
      expect(error).toMatchObject({ code: 'validation_failed' })
    })

    it('answers 404 for an unknown Card', async () => {
      const error = await setProgress('nope', { progress: 1 }, 404)
      expect(error).toMatchObject({ code: 'not_found' })
    })

    // The response the development `rate-limited` scenario sends.
    it('answers 429 with Retry-After when the account writes too often', async () => {
      server.use(
        http.put(`${ORIGIN}/api/cards/:cardId/progress`, () =>
          rateLimited(RATE_LIMITED_SECONDS),
        ),
      )
      const { body, headers } = await save(
        5,
        { key: newKey(), version: 1 },
        429,
      )
      expect(body).toMatchObject({ code: 'rate_limited' })
      expect(headers.get('Retry-After')).toBe(String(RATE_LIMITED_SECONDS))
    })

    // The body the development `progress-error` scenario sends.
    it('answers 500 when saving fails on the server', async () => {
      server.use(http.put(`${ORIGIN}/api/cards/:cardId/progress`, serverError))
      const error = await setProgress('card-02', { progress: 5 }, 500)
      expect(error).toMatchObject({ code: 'server_error' })
    })
  })

  describe('statistics', () => {
    const statistics = (query = '', status = 200) =>
      expectConforms(
        'get',
        '/api/cards/statistics',
        `/api/cards/statistics${query}`,
        status,
      )
    const categoryId = (name: string) =>
      mockStore.listCategories().find((c) => c.name === name)!.id

    it('counts every Card by Progress', async () => {
      expect(await statistics()).toEqual({
        total: 40,
        notStarted: 8,
        inProgress: 24,
        mastered: 8,
      })
    })

    it('counts Cards in any of the given Categories', async () => {
      const ids = [categoryId('Biology'), categoryId('Programming')]
      const body = (await statistics(
        `?category=${ids[0]}&category=${ids[1]}`,
      )) as Record<string, number>
      expect(body.total).toBe(14)
      expect(body.notStarted! + body.inProgress! + body.mastered!).toBe(14)
    })

    it('counts nothing for a Category that does not exist', async () => {
      expect(await statistics('?category=cat-404')).toEqual({
        total: 0,
        notStarted: 0,
        inProgress: 0,
        mastered: 0,
      })
    })

    it('counts nothing when there are no Cards', async () => {
      mockStore.reset([])
      expect(await statistics()).toEqual({
        total: 0,
        notStarted: 0,
        inProgress: 0,
        mastered: 0,
      })
    })

    it('follows Progress changes', async () => {
      await expectConforms(
        'put',
        '/api/cards/{cardId}/progress',
        '/api/cards/card-02/progress',
        200,
        { progress: 5 },
      )
      expect(await statistics()).toMatchObject({ inProgress: 23, mastered: 9 })
    })

    it('rejects an empty Category with a field error', async () => {
      const error = await statistics('?category=', 400)
      expect(error).toMatchObject({
        code: 'validation_failed',
        fieldErrors: { category: expect.any(String) },
      })
    })

    it('answers 500 when the server fails', async () => {
      server.use(http.get(`${ORIGIN}/api/cards/statistics`, serverError))
      const error = await statistics('', 500)
      expect(error).toMatchObject({ code: 'server_error' })
    })
  })

  describe('accounts', () => {
    it.for([
      ['get', '/api/cards', '/api/cards'],
      ['post', '/api/cards', '/api/cards'],
      ['get', '/api/cards/statistics', '/api/cards/statistics'],
      ['get', '/api/cards/{cardId}', '/api/cards/card-01'],
      ['patch', '/api/cards/{cardId}', '/api/cards/card-01'],
      ['put', '/api/cards/{cardId}/progress', '/api/cards/card-01/progress'],
      ['delete', '/api/cards/{cardId}', '/api/cards/card-01'],
      ['get', '/api/categories', '/api/categories'],
    ] as const)(
      'answers %s %s with 401 without a session token',
      async ([method, template, path]) => {
        const attempts: Record<string, string>[] = [
          {},
          { Authorization: 'Bearer nonsense' },
        ]
        for (const headers of attempts) {
          const { body } = await check(method, template, path, 401, {
            headers,
          })
          expect(body).toMatchObject({ code: 'unauthorized' })
        }
        expect(mockStore.getCard('card-01')).toBeDefined()
      },
    )

    it('gives a new account an empty Collection of its own', async () => {
      const other = bearer('user_other')
      const { body: page } = await check(
        'get',
        '/api/cards',
        '/api/cards',
        200,
        { headers: other },
      )
      expect(page).toMatchObject({ items: [], total: 0 })
      await check('get', '/api/cards/{cardId}', '/api/cards/card-01', 404, {
        headers: other,
      })
    })
  })

  describe('creating', () => {
    const create = (
      status: number,
      { key = newKey(), body = input as unknown, userId = MOCK_DEMO_USER } = {},
    ) =>
      check('post', '/api/cards', '/api/cards', status, {
        body,
        headers: { ...bearer(userId), [IDEMPOTENCY_KEY_HEADER]: key },
      })

    it('answers a repeated key with the original Card, once', async () => {
      const key = newKey()
      const first = await create(201, { key })
      const again = await create(201, { key })
      expect(again.body).toEqual(first.body)
      expect(again.headers.get('Idempotent-Replayed')).toBe('true')
      expect(mockStore.statistics([]).total).toBe(41)
    })

    it('creates another Card for the same text with a new key', async () => {
      const first = await create(201)
      const second = await create(201)
      expect(second.body).not.toEqual(first.body)
      expect(mockStore.statistics([]).total).toBe(42)
    })

    it('refuses a key reused for a different Card', async () => {
      const key = newKey()
      await create(201, { key })
      const { body } = await create(422, {
        key,
        body: { ...input, answer: 'Something else.' },
      })
      expect(body).toMatchObject({ code: 'idempotency_key_reused' })
    })

    it('keeps keys apart between accounts', async () => {
      const key = newKey()
      await create(201, { key })
      const other = await create(201, { key, userId: 'user_other' })
      expect(other.headers.get('Idempotent-Replayed')).toBeNull()
      expect(mockBackend.collectionOf('user_other').statistics([]).total).toBe(
        1,
      )
    })

    it.for(['', 'too-short', 'has spaces in it, not allowed'])(
      'rejects the Idempotency-Key %j',
      async (key) => {
        const { body } = await create(400, { key })
        expect(body).toMatchObject({
          fieldErrors: { [IDEMPOTENCY_KEY_HEADER]: expect.any(String) },
        })
      },
    )

    it.for([
      ['question', 2000],
      ['answer', 10000],
      ['category', 100],
    ] as const)(
      'accepts a %s of %i characters, and rejects one more',
      async ([field, max]) => {
        // An astral emoji is one character, though two UTF-16 units.
        const at = { ...input, [field]: `  ${'😀'.repeat(max)}  ` }
        await create(201, { body: at })
        const over = { ...input, [field]: 'x'.repeat(max + 1) }
        const { body } = await create(400, { body: over })
        expect(body).toMatchObject({
          fieldErrors: { [field]: expect.stringContaining('at most') },
        })
      },
    )

    it('refuses the Card after the 1,000th', async () => {
      mockStore.reset(
        Array.from({ length: CARD_QUOTA - 1 }, (_, i) => ({
          id: `card-${i}`,
          question: `Q${i}?`,
          answer: 'A.',
          category: 'Bulk',
          progress: 0,
        })),
      )
      await create(201)
      const { body } = await create(409)
      expect(body).toMatchObject({ code: 'quota_exceeded' })
    })
  })
})

const newKey = (): string => crypto.randomUUID()
