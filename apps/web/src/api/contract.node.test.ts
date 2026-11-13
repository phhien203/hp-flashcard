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
      'GET /api/cards/{cardId}',
      'GET /api/categories',
      'PATCH /api/cards/{cardId}',
      'POST /api/cards',
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
    method: 'get' | 'post' | 'patch' | 'delete',
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
})
