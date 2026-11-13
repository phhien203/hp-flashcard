import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileErrors, dereference, validate } from '@readme/openapi-parser'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  generateApiTypes,
  SPEC_URL,
  TYPES_URL,
} from '../../scripts/api-types.ts'
import { createHandlers } from '../mocks/handlers.js'
import { serverError } from '../mocks/scenarios.js'
import { mockStore } from '../mocks/store.js'

const SPEC_PATH = fileURLToPath(SPEC_URL)
const ORIGIN = 'http://localhost'

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
      'PATCH /api/cards/{cardId}',
      'POST /api/cards',
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
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  addFormats.default(ajv)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spec: any

  beforeAll(async () => {
    spec = await dereference(SPEC_PATH)
    server.listen({ onUnhandledFrame: 'error' })
  })
  beforeEach(() => {
    mockStore.reset()
    server.resetHandlers()
  })
  afterAll(() => server.close())

  /** Fetches `path` and checks status and body against the contract. */
  async function expectConforms(
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    pathTemplate: string,
    path: string,
    status: number,
    requestBody?: unknown,
  ) {
    const operation = spec.paths[pathTemplate][method]
    if (requestBody !== undefined && status < 400) {
      const checkRequest = ajv.compile(
        operation.requestBody.content['application/json'].schema,
      )
      expect(
        checkRequest(requestBody) ? [] : checkRequest.errors,
        'the request body breaks the contract',
      ).toEqual([])
    }
    const response = await fetch(`${ORIGIN}${path}`, {
      method: method.toUpperCase(),
      headers:
        requestBody === undefined
          ? undefined
          : { 'Content-Type': 'application/json' },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    })
    expect(response.status).toBe(status)
    const definition = operation.responses[String(status)]
    expect(definition, `${status} is not documented`).toBeDefined()
    if (!definition.content) {
      // No content: the response must have no body.
      expect(await response.text()).toBe('')
      return undefined
    }
    const body: unknown = await response.json()
    const check = ajv.compile(definition.content['application/json'].schema)
    expect(check(body) ? [] : check.errors).toEqual([])
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
      expect(card).toEqual({ ...before, progress: 5 })
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

    it('resets to 0, and repeating a request changes nothing more', async () => {
      for (const progress of [0, 0]) {
        const card = await setProgress('card-01', { progress }, 200)
        expect(card).toMatchObject({ id: 'card-01', progress: 0 })
      }
      for (const progress of [3, 3]) {
        const card = await setProgress('card-01', { progress }, 200)
        expect(card).toMatchObject({ progress: 3 })
      }
      await expect(
        expectConforms('get', '/api/cards/{cardId}', '/api/cards/card-01', 200),
      ).resolves.toMatchObject({ progress: 3 })
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
})
