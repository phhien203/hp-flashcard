import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { compileErrors, dereference, validate } from '@readme/openapi-parser'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  generateApiTypes,
  SPEC_URL,
  TYPES_URL,
} from '../../scripts/api-types.ts'
import { createHandlers } from '../mocks/handlers.js'
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
    method: 'get',
    pathTemplate: string,
    path: string,
    status: number,
  ) {
    const response = await fetch(`${ORIGIN}${path}`, {
      method: method.toUpperCase(),
    })
    expect(response.status).toBe(status)
    const definition =
      spec.paths[pathTemplate][method].responses[String(status)]
    expect(definition, `${status} is not documented`).toBeDefined()
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
})
