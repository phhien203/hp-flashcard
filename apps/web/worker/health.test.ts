import { afterAll, beforeAll, expect, test } from 'vitest'

import { createIssuer, startWorker, type TestWorker } from './test/harness.js'

let worker: TestWorker
beforeAll(async () => {
  worker = await startWorker({ issuer: createIssuer() })
})
afterAll(async () => worker?.dispose())

test('health is public, uncached, schema-backed and contains only version identity', async () => {
  const response = await worker.fetch('/api/health')
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const data = await response.json()
  expect(data).toEqual({
    status: 'ok',
    version: expect.any(String),
    commit: expect.any(String),
  })
  expect((await worker.fetch('/api/cards')).status).toBe(401)
})

test('missing schema fails health rather than reporting a serving release healthy', async () => {
  const { DB } = await worker.env()
  await DB.prepare('DROP TABLE deleted_identities').run()
  const response = await worker.fetch('/api/health')
  expect(response.status).toBe(500)
  expect(await response.text()).not.toContain('deleted_identities')
})
