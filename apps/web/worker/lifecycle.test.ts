import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { contractChecker } from '../src/api/contract-check.js'
import { IDEMPOTENCY_KEY_HEADER } from '../src/domain/idempotency.js'
import { ifMatch, IF_MATCH_HEADER } from '../src/domain/versions.js'
import { collection, database } from './collection.js'
import { isIdentityDeleted, lifecycle } from './lifecycle.js'
import { admitWrite } from './rate-limit.js'
import {
  card,
  newAccount as createAccount,
  newKey,
  type Account,
  type Card,
} from './test/accounts.js'
import {
  createIssuer,
  createWebhookSender,
  startWorker,
  type Issuer,
  type TestWorker,
  type WebhookSender,
} from './test/harness.js'

/*
 * Administrator deletion (ADR 0002): Clerk's signed `user.deleted` webhook
 * purges the Collection for good, on a local D1 built by the checked-in
 * migrations. Deliveries are signed as Clerk signs them, with a test
 * signing secret given to the Worker as its secret.
 */

let issuer: Issuer
let webhooks: WebhookSender
let worker: TestWorker
let check: Awaited<ReturnType<typeof contractChecker>>

beforeAll(async () => {
  issuer = createIssuer()
  webhooks = createWebhookSender()
  worker = await startWorker({ issuer, webhooks })
  check = await contractChecker(worker.fetch)
})
afterAll(() => worker?.dispose())

const newAccount = () => createAccount({ issuer, check })

/** A `user.deleted` event for `userId`, as Clerk sends it. */
const userDeleted = (userId: string) =>
  JSON.stringify({
    type: 'user.deleted',
    object: 'event',
    data: { id: userId, object: 'user', deleted: true },
    timestamp: Date.now(),
    instance_id: 'ins_test',
  })

/** Delivers exactly `body` with `headers` to the webhook endpoint. */
const deliver = (body: string, headers: Record<string, string>) =>
  worker.fetch('/api/webhooks/clerk', { method: 'POST', headers, body })

/** Delivers `body`, signed, checking the response against the contract. */
const deliverSigned = async (
  body: string,
  options: Parameters<WebhookSender['headers']>[1] = {},
  status = 200,
) => {
  const response = await deliver(body, webhooks.headers(body, options))
  const text = await response.text()
  expect(response.status, text).toBe(status)
  return JSON.parse(text) as unknown
}

/** Everything a Collection holds, read straight from D1. */
async function rowsOwnedBy(userId: string) {
  const d1 = (await worker.env()).DB
  const count = async (table: string) =>
    (
      await d1
        .prepare(`select count(*) as n from ${table} where owner_id = ?`)
        .bind(userId)
        .first<{ n: number }>()
    )?.n
  return {
    cards: await count('cards'),
    categories: await count('categories'),
    idempotencyRecords: await count('idempotency_records'),
    writeRequests: await count('write_requests'),
  }
}

const NOTHING = {
  cards: 0,
  categories: 0,
  idempotencyRecords: 0,
  writeRequests: 0,
}

/** An account with Cards, Progress, retry records and rate-limit entries. */
async function populated(): Promise<{ account: Account; cards: Card[] }> {
  const account = newAccount()
  const one = (await account.create(card(1, 'A'))).body as Card
  const two = (await account.create(card(2, 'B'))).body as Card
  await account.saveProgress(one.id, 1, 3)
  await account.edit(two.id, 1, { answer: 'Edited.' })
  expect(await rowsOwnedBy(account.userId)).toEqual({
    cards: 2,
    categories: 2,
    idempotencyRecords: 4,
    writeRequests: 4,
  })
  return { account, cards: [one, two] }
}

describe('a verified user.deleted delivery', () => {
  it('purges the whole Collection and shuts out sessions still unexpired', async () => {
    const { account, cards } = await populated()
    const bystander = await populated()

    expect(await deliverSigned(userDeleted(account.userId))).toEqual({
      received: true,
    })

    expect(await rowsOwnedBy(account.userId)).toEqual(NOTHING)
    // The session token is still valid for Clerk, but its identity is gone.
    await account.call('get', '/api/cards', '/api/cards', 401)
    await account.get(cards[0]!.id, 401)
    await account.create(card(3), { status: 401 })
    await account.saveProgress(cards[0]!.id, 2, 4, { status: 401 })
    await account.remove(cards[1]!.id, 2, { status: 401 })
    expect(await rowsOwnedBy(account.userId)).toEqual(NOTHING)
    // Nobody else's Collection is touched.
    expect(await rowsOwnedBy(bystander.account.userId)).toMatchObject({
      cards: 2,
    })
    expect((await bystander.account.list()).total).toBe(2)
  })

  it('verifies the original body, byte for byte', async () => {
    const { account } = await populated()
    // Not how JSON.stringify would write it: re-serializing would break it.
    const body = `{ "type" : "user.deleted",\n  "data": {"id": "${account.userId}", "deleted": true} }`

    await deliverSigned(body)

    expect(await rowsOwnedBy(account.userId)).toEqual(NOTHING)
  })

  it('applies a repeated delivery once, and a second delivery harmlessly', async () => {
    const { account } = await populated()
    const body = userDeleted(account.userId)
    const id = `msg_${crypto.randomUUID()}`

    const deliveries = await Promise.all([
      deliverSigned(body, { id }),
      deliverSigned(body, { id }),
      deliverSigned(body, { id }),
    ])
    expect(deliveries).toEqual(Array(3).fill({ received: true }))
    // Clerk retrying later, with a fresh timestamp: still acknowledged.
    await deliverSigned(body, { id })
    // Another delivery of the same deletion finds nothing left to delete.
    await deliverSigned(userDeleted(account.userId))

    expect(await rowsOwnedBy(account.userId)).toEqual(NOTHING)
    await account.create(card(1), { status: 401 })
  })

  it('acknowledges other events and changes nothing', async () => {
    const { account } = await populated()
    const body = JSON.stringify({
      type: 'user.updated',
      data: {
        id: account.userId,
        email_addresses: [{ email_address: 'someone@example.com' }],
      },
    })

    await deliverSigned(body)

    expect((await account.list()).total).toBe(2)
  })
})

describe('a forged or altered delivery', () => {
  it.for([
    [
      'a signature by another secret',
      (body: string) => createWebhookSender().headers(body),
    ],
    [
      'an altered body',
      (body: string) =>
        webhooks.headers(body.replace('user.deleted', 'user.created')),
    ],
    [
      'no signature',
      (body: string) => {
        const headers: Record<string, string> = webhooks.headers(body)
        delete headers['svix-signature']
        return headers
      },
    ],
    [
      'a signature from 10 minutes ago (a replay)',
      (body: string) =>
        webhooks.headers(body, {
          timestamp: Math.floor(Date.now() / 1000) - 600,
        }),
    ],
    [
      'a signature for another delivery id',
      (body: string) => ({
        ...webhooks.headers(body),
        'svix-id': `msg_${crypto.randomUUID()}`,
      }),
    ],
  ] as const)(
    'is refused with 400 and purges nothing: %s',
    async ([, sign]) => {
      const { account } = await populated()
      const body = userDeleted(account.userId)

      const response = await deliver(body, sign(body))

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'invalid_signature' })
      expect((await account.list()).total).toBe(2)
    },
  )

  it('is refused with 413 when the body is too large to read', async () => {
    const body = JSON.stringify({
      type: 'user.deleted',
      pad: 'x'.repeat(200_000),
    })
    const response = await deliver(body, webhooks.headers(body))
    expect(response.status).toBe(413)
  })
})

describe('requests racing a purge', () => {
  it('never bring a deleted Collection back', async () => {
    const { account, cards } = await populated()
    const send = (path: string, method: string, body: unknown, version = 1) =>
      worker
        .fetch(path, {
          method,
          headers: {
            ...account.auth(),
            'Content-Type': 'application/json',
            [IDEMPOTENCY_KEY_HEADER]: newKey(),
            [IF_MATCH_HEADER]: ifMatch(version),
          },
          body: JSON.stringify(body),
        })
        .then(async (response) => {
          await response.body?.cancel()
          return response.status
        })

    const statuses = await Promise.all([
      ...Array.from({ length: 8 }, (_, i) =>
        send('/api/cards', 'POST', card(`racing ${i}`, `Racing ${i}`)),
      ),
      send(`/api/cards/${cards[0]!.id}/progress`, 'PUT', { progress: 4 }, 2),
      send(`/api/cards/${cards[1]!.id}`, 'PATCH', { answer: 'Racing.' }, 2),
      deliverSigned(userDeleted(account.userId)).then(() => 200),
      ...Array.from({ length: 8 }, (_, i) =>
        send('/api/cards', 'POST', card(`late ${i}`, `Late ${i}`)),
      ),
    ])

    // Each request finished before the purge, or was refused: shut out
    // (401), or, past the session check, finding its Card gone (404).
    for (const status of statuses)
      expect([200, 201, 401, 404]).toContain(status)
    expect(await rowsOwnedBy(account.userId)).toEqual(NOTHING)
  })

  it('refuses, in the database, writes authenticated before the purge', async () => {
    // A request past authentication when the purge commits writes through
    // the Collection directly: the deleted-identity guards refuse it.
    const { account } = await populated()
    const db = database((await worker.env()).DB)
    const owned = collection(db, account.userId)
    await deliverSigned(userDeleted(account.userId))
    expect(await lifecycle(db).isDeleted(account.userId)).toBe(true)

    const refused = await owned
      .createCard(card('late'), newKey(), 'hash', Date.now())
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(isIdentityDeleted(refused)).toBe(true)
    const admitted = await admitWrite(db, account.userId, Date.now()).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(isIdentityDeleted(admitted)).toBe(true)
    expect(await rowsOwnedBy(account.userId)).toEqual(NOTHING)
  })
})
