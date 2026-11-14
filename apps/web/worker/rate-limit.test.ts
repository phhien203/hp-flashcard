import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { contractChecker } from '../src/api/contract-check.js'
import { IDEMPOTENCY_KEY_HEADER } from '../src/domain/idempotency.js'
import {
  RETRY_AFTER_HEADER,
  WRITE_LIMIT,
  WRITE_WINDOW_MS,
} from '../src/domain/rate-limit.js'
import { MAX_BODY_BYTES } from './app.js'
import { database } from './collection.js'
import { admitWrite, forgetOldWrites } from './rate-limit.js'
import {
  card,
  newAccount as createAccount,
  newKey,
  type Card,
} from './test/accounts.js'
import {
  createIssuer,
  startWorker,
  type Issuer,
  type TestWorker,
} from './test/harness.js'

/*
 * The write rate limit (ADR 0002): 60 write requests per account in any
 * 60 seconds, counted in D1, so every Worker instance enforces the same
 * count. Request bodies are bounded, and read only once authenticated.
 */

let issuer: Issuer
let worker: TestWorker
let check: Awaited<ReturnType<typeof contractChecker>>

beforeAll(async () => {
  issuer = createIssuer()
  worker = await startWorker({ issuer })
  check = await contractChecker(worker.fetch)
})
afterAll(() => worker?.dispose())

const newAccount = () => createAccount({ issuer, check })

const db = async () => database((await worker.env()).DB)

/** A unique owner for tests of the limiter itself. */
const owner = () => `user_rate_${crypto.randomUUID()}`

describe('the write rate limit, over HTTP', () => {
  it(`admits ${WRITE_LIMIT} writes a minute, then answers 429 with Retry-After`, async () => {
    const account = newAccount()
    const created = (await account.create(card(0))).body as Card
    // Every kind of write counts, refused ones included.
    await account.saveProgress(created.id, 1, 1)
    await account.edit(created.id, 1, { answer: 'Edited.' })
    await account.create({ question: ' ' }, { status: 400 })
    for (let i = 4; i < WRITE_LIMIT; i++) await account.create(card(i))

    const { body, headers } = await account.create(card('too many'), {
      status: 429,
    })

    expect(body).toMatchObject({
      code: 'rate_limited',
      message: expect.stringMatching(/Wait \d+ seconds?, then try again/),
    })
    const retryAfter = Number(headers.get(RETRY_AFTER_HEADER))
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(60)
    await account.saveProgress(created.id, 2, 2, { status: 429 })
    await account.remove(created.id, 2, { status: 429 })
    // Refused writes did nothing; reads go on.
    expect((await account.list()).total).toBe(WRITE_LIMIT - 3)
    expect((await account.get(created.id)).body).toMatchObject({
      progress: 1,
      contentVersion: 2,
    })
    // Another account's limit is its own.
    await newAccount().create(card(1))
  })

  it('holds across Worker instances', async () => {
    const account = newAccount()
    await Promise.all(
      Array.from({ length: WRITE_LIMIT }, (_, i) => account.create(card(i))),
    )
    await worker.restart()
    await account.create(card('after restart'), { status: 429 })
  })

  it('never admits more than the limit, however requests race', async () => {
    const account = newAccount()
    const statuses = await Promise.all(
      Array.from({ length: WRITE_LIMIT + 20 }, async (_, i) => {
        const response = await worker.fetch('/api/cards', {
          method: 'POST',
          headers: {
            ...account.auth(),
            'Content-Type': 'application/json',
            [IDEMPOTENCY_KEY_HEADER]: newKey(),
          },
          body: JSON.stringify(card(i)),
        })
        await response.body?.cancel()
        return response.status
      }),
    )
    expect(statuses.filter((s) => s === 201)).toHaveLength(WRITE_LIMIT)
    expect(statuses.filter((s) => s === 429)).toHaveLength(20)
    expect((await account.list()).total).toBe(WRITE_LIMIT)
  })

  it('refuses unauthenticated writes before counting them or reading a body', async () => {
    const response = await worker.fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(MAX_BODY_BYTES * 2),
    })
    expect(response.status).toBe(401)
  })

  it(`refuses bodies over ${MAX_BODY_BYTES} bytes with 413`, async () => {
    const account = newAccount()
    const { body } = await account.create(
      { ...card(1), answer: 'x'.repeat(MAX_BODY_BYTES) },
      { status: 413 },
    )
    expect(body).toMatchObject({ code: 'payload_too_large' })
    // The longest valid Card fits, even written entirely as JSON escapes.
    await account.create({
      question: '\u0001'.repeat(2000),
      answer: '\u0001'.repeat(10000),
      category: '\u0001'.repeat(100),
    })
  })
})

describe('the sliding window', () => {
  it('frees a place as each admitted request leaves the window', async () => {
    const database = await db()
    const ownerId = owner()
    const t0 = Date.now()
    // Half the limit at t0, half 30 seconds later.
    for (let i = 0; i < WRITE_LIMIT / 2; i++)
      expect(await admitWrite(database, ownerId, t0)).toEqual({ ok: true })
    for (let i = 0; i < WRITE_LIMIT / 2; i++)
      expect(await admitWrite(database, ownerId, t0 + 30_000)).toEqual({
        ok: true,
      })

    expect(await admitWrite(database, ownerId, t0 + 30_001)).toEqual({
      ok: false,
      retryAfterSeconds: 30,
    })
    expect(
      await admitWrite(database, ownerId, t0 + WRITE_WINDOW_MS - 1),
    ).toEqual({ ok: false, retryAfterSeconds: 1 })
    // The first half leaves the window: exactly that many places free up.
    for (let i = 0; i < WRITE_LIMIT / 2; i++)
      expect(await admitWrite(database, ownerId, t0 + WRITE_WINDOW_MS)).toEqual(
        { ok: true },
      )
    expect(await admitWrite(database, ownerId, t0 + WRITE_WINDOW_MS)).toEqual({
      ok: false,
      retryAfterSeconds: 30,
    })
    // A full window after the last, the account writes freely again.
    expect(
      await admitWrite(database, ownerId, t0 + 2 * WRITE_WINDOW_MS),
    ).toEqual({ ok: true })
  })

  it("doesn't count refused requests, so waiting is enough", async () => {
    const database = await db()
    const ownerId = owner()
    const t0 = Date.now()
    for (let i = 0; i < WRITE_LIMIT; i++)
      await admitWrite(database, ownerId, t0)
    // Hammering while refused doesn't push the recovery back.
    for (let i = 1; i <= 10; i++)
      expect((await admitWrite(database, ownerId, t0 + i * 5000)).ok).toBe(
        false,
      )
    expect(await admitWrite(database, ownerId, t0 + WRITE_WINDOW_MS)).toEqual({
      ok: true,
    })
  })

  it('lets the daily cleanup forget only entries out of their window', async () => {
    const database = await db()
    const [old, recent] = [owner(), owner()]
    const t0 = Date.now()
    await admitWrite(database, old, t0 - WRITE_WINDOW_MS)
    await admitWrite(database, recent, t0 - 1)
    await forgetOldWrites(database, t0)
    const d1 = (await worker.env()).DB
    const count = async (ownerId: string) =>
      (
        await d1
          .prepare(
            'select count(*) as n from write_requests where owner_id = ?',
          )
          .bind(ownerId)
          .first<{ n: number }>()
      )?.n
    expect(await count(old)).toBe(0)
    expect(await count(recent)).toBe(1)
  })
})
