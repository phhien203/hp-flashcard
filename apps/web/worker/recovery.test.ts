import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { contractChecker } from '../src/api/contract-check.js'
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
} from '../src/domain/idempotency.js'
import {
  MAINTENANCE_MESSAGE,
  MAINTENANCE_RETRY_AFTER_SECONDS,
} from '../src/domain/maintenance.js'
import { collection, database } from './collection.js'
import { isIdentityDeleted } from './lifecycle.js'
import {
  card,
  newAccount as createAccount,
  newKey,
  type Account,
  type Card,
} from './test/accounts.js'
import {
  bookmark,
  createIssuer,
  createWebhookSender,
  startClerkApi,
  startWorker,
  type ClerkApi,
  type Issuer,
  type TestWorker,
  type WebhookSender,
} from './test/harness.js'

/*
 * Database recovery (ADR 0005, docs/web-recovery.md), at the Worker's HTTP
 * seam on a local D1 built by the checked-in migrations: maintenance
 * closes the API, Clerk's webhooks keep working, deleted identities are
 * reconciled against Clerk (a local stand-in for its Backend API), and
 * only a reconciled, consistent database reopens. D1 Time Travel exists
 * only remotely; `bookmark` stands in for it here, and the real restore is
 * rehearsed by scripts/recovery-drill.mjs.
 */

const ADMIN_TOKEN = 'recovery-operator-token-for-tests'

let issuer: Issuer
let webhooks: WebhookSender
let clerk: ClerkApi
let worker: TestWorker
let check: Awaited<ReturnType<typeof contractChecker>>

beforeAll(async () => {
  issuer = createIssuer()
  webhooks = createWebhookSender()
  clerk = await startClerkApi()
  worker = await startWorker({ issuer, webhooks })
  check = await contractChecker(worker.fetch)
})
afterAll(async () => {
  await worker?.dispose()
  await clerk?.close()
})

/** A new account that Clerk has. */
function newAccount() {
  const account = createAccount({ issuer, check })
  clerk.add(account.userId)
  return account
}

/** An account with Cards, Progress, an edit, retry records. */
async function populated() {
  const account = newAccount()
  const createKey = newKey()
  const one = (await account.create(card(1, 'A'), { key: createKey }))
    .body as Card
  const two = (await account.create(card(2, 'B'))).body as Card
  const saved = (await account.saveProgress(one.id, 1, 3)).body as Card
  const edited = (await account.edit(two.id, 1, { answer: 'Edited.' }))
    .body as Card
  return { account, createKey, cards: [saved, edited] }
}

/** Starts a recovery: the Worker gets a new epoch and the operator token. */
async function startRecovery(epoch = `recovery-${crypto.randomUUID()}`) {
  await worker.reconfigure({
    RECOVERY_EPOCH: epoch,
    RECOVERY_ADMIN_TOKEN: ADMIN_TOKEN,
    CLERK_SECRET_KEY: clerk.secretKey,
    CLERK_API_URL: clerk.url,
  })
  return epoch
}

/** Ends the recovery: the operator removes the epoch. */
const endRecovery = () => worker.reconfigure({})

/** The operator's request to a recovery endpoint, checked by the contract. */
const operator = (
  method: 'get' | 'post',
  path: '/api/recovery' | '/api/recovery/reconcile' | '/api/recovery/reopen',
  status: number,
  { body, token = ADMIN_TOKEN }: { body?: unknown; token?: string } = {},
) =>
  check(method, path, path, status, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  })

const reconcile = async (body: unknown, status = 200) =>
  (await operator('post', '/api/recovery/reconcile', status, { body })).body

const reopen = async (status = 200) =>
  (await operator('post', '/api/recovery/reopen', status)).body

const health = async () =>
  (await (await worker.fetch('/api/health')).json()) as {
    maintenance: boolean
  }

const d1 = async () => (await worker.env()).DB

/** How many rows `userId` owns, across every table a Collection uses. */
async function rowsOwnedBy(userId: string) {
  const db = await d1()
  let total = 0
  for (const table of [
    'cards',
    'categories',
    'idempotency_records',
    'write_requests',
  ]) {
    const row = await db
      .prepare(`select count(*) as n from ${table} where owner_id = ?`)
      .bind(userId)
      .first<{ n: number }>()
    total += row!.n
  }
  return total
}

/** Every Collection operation the account can make, and what it answers. */
async function everyOperation(account: Account, cardId: string) {
  const answers = await Promise.all([
    account.call('get', '/api/cards', '/api/cards', 503),
    account.call('get', '/api/cards/statistics', '/api/cards/statistics', 503),
    account.call('get', '/api/categories', '/api/categories', 503),
    account.get(cardId, 503),
    account.create(card('during maintenance'), { status: 503 }),
    account.edit(cardId, 2, { answer: 'During maintenance.' }, { status: 503 }),
    account.saveProgress(cardId, 2, 5, { status: 503 }),
    account.remove(cardId, 2, { status: 503 }),
  ])
  return answers
}

describe('without a recovery under way', () => {
  beforeEach(endRecovery)

  it('serves the API and has no recovery endpoints', async () => {
    const { account } = await populated()
    expect((await account.list()).total).toBe(2)
    expect(await health()).toMatchObject({ maintenance: false })
    await operator('get', '/api/recovery', 404)
    await operator('post', '/api/recovery/reopen', 404)
  })
})

describe('maintenance', () => {
  beforeEach(endRecovery)

  it('closes every Collection operation, writes nothing, and says why', async () => {
    const { account, cards } = await populated()
    const before = await rowsOwnedBy(account.userId)
    await startRecovery()

    const answers = await everyOperation(account, cards[1]!.id)

    for (const { body, headers } of answers) {
      expect(body).toEqual({
        code: 'maintenance',
        message: MAINTENANCE_MESSAGE,
      })
      expect(headers.get('Retry-After')).toBe(
        String(MAINTENANCE_RETRY_AFTER_SECONDS),
      )
      expect(headers.get('Cache-Control')).toBe('private, no-store')
    }
    // Nothing reached D1, not even the rate limit's count.
    expect(await rowsOwnedBy(account.userId)).toBe(before)
    // Without a session, too: no data is read to decide.
    expect((await worker.fetch('/api/cards')).status).toBe(503)
    expect(await health()).toMatchObject({ maintenance: true })
  })

  it('keeps processing Clerk deletion webhooks', async () => {
    const { account } = await populated()
    await startRecovery()
    clerk.remove(account.userId)
    const body = JSON.stringify({
      type: 'user.deleted',
      data: { id: account.userId, deleted: true },
    })

    const response = await worker.fetch('/api/webhooks/clerk', {
      method: 'POST',
      headers: webhooks.headers(body),
      body,
    })

    expect(response.status).toBe(200)
    expect(await rowsOwnedBy(account.userId)).toBe(0)
  })

  it('admits only the operator token to the recovery endpoints', async () => {
    await startRecovery()
    await operator('get', '/api/recovery', 401, { token: 'not-the-token' })
    const account = newAccount()
    // A Clerk session is no operator token.
    const response = await worker.fetch('/api/recovery', {
      headers: account.auth(),
    })
    expect(response.status).toBe(401)
  })

  it('stays closed while D1 cannot answer', async () => {
    await startRecovery()
    const db = await d1()
    await db.prepare('ALTER TABLE recoveries RENAME TO recoveries_away').run()
    try {
      expect((await worker.fetch('/api/cards')).status).toBe(503)
    } finally {
      await db.prepare('ALTER TABLE recoveries_away RENAME TO recoveries').run()
    }
  })
})

describe('a recovery with a restore', () => {
  it('reconciles deleted identities against Clerk before reopening', async () => {
    await endRecovery()
    // Before the bookmark: three people with Collections. `forgotten` was
    // deleted in Clerk, but its webhook never reached D1.
    const kept = await populated()
    const deletedLater = await populated()
    const forgotten = await populated()
    clerk.remove(forgotten.account.userId)
    const recoveryPoint = await bookmark(d1)

    // After the bookmark: acknowledged writes the restore will lose, and
    // a deletion processed by its webhook.
    const lateKey = newKey()
    const late = (
      await kept.account.create(card('late', 'Late'), { key: lateKey })
    ).body as Card
    clerk.remove(deletedLater.account.userId)
    const deletion = JSON.stringify({
      type: 'user.deleted',
      data: { id: deletedLater.account.userId, deleted: true },
    })
    const deliveryId = `msg_${crypto.randomUUID()}`
    const delivered = await worker.fetch('/api/webhooks/clerk', {
      method: 'POST',
      headers: webhooks.headers(deletion, { id: deliveryId }),
      body: deletion,
    })
    expect(delivered.status).toBe(200)
    expect(await rowsOwnedBy(deletedLater.account.userId)).toBe(0)
    // Damage.
    await (await d1()).prepare('DELETE FROM cards').run()

    // The operator closes the API, then restores.
    const epoch = await startRecovery()
    await recoveryPoint.restore()

    // The restore brought the deleted Collection back, without its
    // tombstone; the API is closed, so nobody can see or extend it.
    expect(await rowsOwnedBy(deletedLater.account.userId)).toBeGreaterThan(0)
    await deletedLater.account.call('get', '/api/cards', '/api/cards', 503)
    expect(
      await operator('get', '/api/recovery', 200).then((r) => r.body),
    ).toMatchObject({
      epoch,
      reconciledAt: null,
      reopenedAt: null,
      consistent: true,
    })
    // Not reconciled: it can't reopen.
    expect(await reopen(409)).toMatchObject({ code: 'recovery_state' })

    // A dry run counts; a wrong expectation purges nothing.
    expect(await reconcile({ purge: false })).toEqual({
      epoch,
      ownersChecked: expect.any(Number),
      deleted: 2,
      purged: false,
    })
    expect(
      await reconcile({ purge: true, expectedDeleted: 1 }, 409),
    ).toMatchObject({ code: 'recovery_state' })
    expect(await rowsOwnedBy(forgotten.account.userId)).toBeGreaterThan(0)

    expect(await reconcile({ purge: true, expectedDeleted: 2 })).toMatchObject({
      deleted: 2,
      purged: true,
    })
    expect(await rowsOwnedBy(deletedLater.account.userId)).toBe(0)
    expect(await rowsOwnedBy(forgotten.account.userId)).toBe(0)
    // Still closed until the operator, having verified, reopens.
    await kept.account.call('get', '/api/cards', '/api/cards', 503)
    expect(await reopen()).toMatchObject({
      epoch,
      reopenedAt: expect.any(Number),
    })
    expect(await health()).toMatchObject({ maintenance: false })

    // Reopened: the restored Collection, with its values, versions and
    // Progress; the write acknowledged after the bookmark is gone.
    const restored = await kept.account.list()
    expect(restored.items.map(({ id }) => id).sort()).toEqual(
      kept.cards.map(({ id }) => id).sort(),
    )
    for (const want of kept.cards)
      expect(restored.items.find(({ id }) => id === want.id)).toEqual(want)
    await kept.account.get(late.id, 404)
    expect(
      (await kept.account.categories()).map(({ name, count }) => [name, count]),
    ).toEqual([
      ['A', 1],
      ['B', 1],
    ])

    // Retry records came back as of the bookmark: a retry from before it
    // still replays…
    const replay = await kept.account.create(card(1, 'A'), {
      key: kept.createKey,
    })
    expect(replay.headers.get(IDEMPOTENT_REPLAYED_HEADER)).toBe('true')
    expect((replay.body as Card).id).toBe(kept.cards[0]!.id)
    // …but one acknowledged after it is lost, so its retry creates anew:
    // the 24-hour guarantee doesn't survive a restore (docs/web-recovery.md).
    const retried = await kept.account.create(card('late', 'Late'), {
      key: lateKey,
    })
    expect(retried.headers.get(IDEMPOTENT_REPLAYED_HEADER)).toBeNull()
    expect((retried.body as Card).id).not.toBe(late.id)

    // Later reads and versioned writes work.
    const one = kept.cards[0]!
    await kept.account.saveProgress(one.id, one.progressVersion, 4)
    await kept.account.edit(one.id, one.contentVersion, { answer: 'After.' })
    await kept.account.edit(
      one.id,
      one.contentVersion,
      { answer: 'Stale.' },
      { status: 409 },
    )

    // Deleted identities stay out: their sessions, a delayed or repeated
    // delivery of their deletion (the restore forgot the first), and a
    // write that got past authentication.
    await deletedLater.account.call('get', '/api/cards', '/api/cards', 401)
    await deletedLater.account.create(card('back'), { status: 401 })
    await forgotten.account.create(card('back'), { status: 401 })
    for (const id of [deliveryId, deliveryId, `msg_${crypto.randomUUID()}`]) {
      const response = await worker.fetch('/api/webhooks/clerk', {
        method: 'POST',
        headers: webhooks.headers(deletion, { id }),
        body: deletion,
      })
      expect(response.status).toBe(200)
    }
    const bypass = await collection(
      database(await d1()),
      deletedLater.account.userId,
    )
      .createCard(card('bypass'), newKey(), 'hash', Date.now())
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(isIdentityDeleted(bypass)).toBe(true)
    expect(await rowsOwnedBy(deletedLater.account.userId)).toBe(0)

    // The operator may now remove the epoch; the API stays open.
    await endRecovery()
    expect((await kept.account.list()).total).toBe(3)
  })

  it('refuses concurrent attempts to recreate a deleted Collection', async () => {
    await endRecovery()
    const gone = await populated()
    const point = await bookmark(d1)
    clerk.remove(gone.account.userId)
    await startRecovery()
    await point.restore()

    // Its session keeps writing while the operator reconciles and reopens.
    const race = (label: string) =>
      Array.from({ length: 12 }, (_, i) =>
        worker
          .fetch('/api/cards', {
            method: 'POST',
            headers: {
              ...gone.account.auth(),
              'Content-Type': 'application/json',
              [IDEMPOTENCY_KEY_HEADER]: newKey(),
            },
            body: JSON.stringify(card(`${label} ${i}`, `${label} ${i}`)),
          })
          .then(async (response) => {
            await response.body?.cancel()
            return response.status
          }),
      )
    const attempts = race('racing')
    const { deleted } = (await reconcile({ purge: false })) as {
      deleted: number
    }
    await reconcile({ purge: true, expectedDeleted: deleted })
    await reopen()

    for (const status of await Promise.all(attempts))
      expect([401, 503]).toContain(status)
    // Once open, concurrent attempts all meet the tombstone, never the gate.
    for (const status of await Promise.all(race('reopened')))
      expect(status).toBe(401)
    await gone.account.create(card('after'), { status: 401 })
    expect(await rowsOwnedBy(gone.account.userId)).toBe(0)
  })

  it('closes the API again when D1 is restored after reconciling', async () => {
    await endRecovery()
    const { account } = await populated()
    await startRecovery()
    const beforeReconciling = await bookmark(d1)
    const { deleted } = (await reconcile({ purge: false })) as {
      deleted: number
    }
    await reconcile({ purge: true, expectedDeleted: deleted })

    // A second restore, to a point before the reconciliation.
    await beforeReconciling.restore()

    expect(await reopen(409)).toMatchObject({ code: 'recovery_state' })
    await account.call('get', '/api/cards', '/api/cards', 503)
  })

  it('stays closed, purging nothing, when Clerk does not answer', async () => {
    await endRecovery()
    const { account } = await populated()
    clerk.remove(account.userId)
    await startRecovery()
    clerk.state.failing = true
    try {
      expect(
        await reconcile({ purge: true, expectedDeleted: 1 }, 502),
      ).toMatchObject({ code: 'upstream_unavailable' })
    } finally {
      clerk.state.failing = false
    }
    expect(await rowsOwnedBy(account.userId)).toBeGreaterThan(0)
    expect(await reopen(409)).toMatchObject({ code: 'recovery_state' })
    // Clean up for later tests: this identity is deleted in Clerk.
    const { deleted } = (await reconcile({ purge: false })) as {
      deleted: number
    }
    await reconcile({ purge: true, expectedDeleted: deleted })
  })

  it('refuses to reopen a database holding inconsistent rows', async () => {
    await endRecovery()
    const { account } = await populated()
    await startRecovery()
    const { deleted } = (await reconcile({ purge: false })) as {
      deleted: number
    }
    await reconcile({ purge: true, expectedDeleted: deleted })
    // A tombstone whose Collection survived: what a broken purge leaves.
    await (
      await d1()
    )
      .prepare('INSERT INTO deleted_identities VALUES (?, ?)')
      .bind(account.userId, Date.now())
      .run()

    expect(await reopen(409)).toMatchObject({ code: 'recovery_state' })
    expect(
      await operator('get', '/api/recovery', 200).then((r) => r.body),
    ).toMatchObject({ consistent: false })
    await account.call('get', '/api/cards', '/api/cards', 503)

    // Reconciling purges the tombstoned owner's rows; then it reopens.
    expect(await reconcile({ purge: false })).toMatchObject({ deleted: 1 })
    await reconcile({ purge: true, expectedDeleted: 1 })
    await reopen()
  })
})
