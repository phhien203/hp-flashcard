import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { contractChecker } from '../src/api/contract-check.js'
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_TTL_MS,
} from '../src/domain/idempotency.js'
import { ifMatch, IF_MATCH_HEADER } from '../src/domain/versions.js'
import { collection, database } from './collection.js'
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
 * Progress saves at the Worker's HTTP seam, on a local D1 built by the
 * checked-in migrations (ADR 0003): absolute values, their own version,
 * independent of content edits, and idempotent retries.
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

/** A new account with one new Card. */
async function withCard() {
  const account = newAccount()
  const created = (await account.create(card(1))).body as Card
  return { account, created }
}

/** Sends a Progress save without checking it, for races. */
const rawSave = (
  account: ReturnType<typeof newAccount>,
  cardId: string,
  version: number,
  progress: number,
  key = newKey(),
) =>
  worker.fetch(`/api/cards/${cardId}/progress`, {
    method: 'PUT',
    headers: {
      ...account.auth(),
      'Content-Type': 'application/json',
      [IDEMPOTENCY_KEY_HEADER]: key,
      [IF_MATCH_HEADER]: ifMatch(version),
    },
    body: JSON.stringify({ progress }),
  })

describe('saving Progress', () => {
  it('starts new Cards at 0, credits one at a time up to 5, and resets to 0', async () => {
    const { account, created } = await withCard()
    expect(created).toMatchObject({
      progress: 0,
      contentVersion: 1,
      progressVersion: 1,
    })

    let version = created.progressVersion
    for (const progress of [1, 2, 3, 4, 5]) {
      const { body, headers } = await account.saveProgress(
        created.id,
        version,
        progress,
      )
      expect(headers.get('Idempotent-Replayed')).toBeNull()
      expect(body).toEqual({
        ...created,
        progress,
        progressVersion: version + 1,
      })
      version++
    }
    expect(await account.statistics()).toEqual({
      total: 1,
      notStarted: 0,
      inProgress: 0,
      mastered: 1,
    })
    expect((await account.list('?hideMastered=true')).total).toBe(0)

    const { body } = await account.saveProgress(created.id, version, 0)
    expect(body).toMatchObject({ progress: 0, progressVersion: version + 1 })
    expect(await account.statistics()).toMatchObject({ notStarted: 1 })
  })

  it('keeps content, Category, contentVersion and default place', async () => {
    const account = newAccount()
    const first = (await account.create(card(1, 'A'))).body as Card
    const second = (await account.create(card(2, 'B'))).body as Card

    await account.saveProgress(first.id, 1, 3)

    const { items } = await account.list()
    expect(items.map((c) => c.id)).toEqual([second.id, first.id])
    expect(items[1]).toEqual({ ...first, progress: 3, progressVersion: 2 })
    expect(await account.categories()).toHaveLength(2)
  })

  it.for([
    [{ progress: 6 }, 'progress'],
    [{ progress: -1 }, 'progress'],
    [{ progress: 1.5 }, 'progress'],
    [{ progress: '1' }, 'progress'],
    [{}, 'progress'],
    [{ progress: 1, ownerId: 'user_other' }, 'ownerId'],
  ] as const)('rejects %j, naming %s', async ([body, field]) => {
    const { account, created } = await withCard()
    const { body: error } = await account.call(
      'put',
      '/api/cards/{cardId}/progress',
      `/api/cards/${created.id}/progress`,
      400,
      {
        body,
        headers: {
          [IDEMPOTENCY_KEY_HEADER]: newKey(),
          [IF_MATCH_HEADER]: ifMatch(1),
        },
      },
    )
    expect(error).toMatchObject({
      code: 'validation_failed',
      fieldErrors: { [field]: expect.any(String) },
    })
    expect((await account.get(created.id)).body).toEqual(created)
  })

  it('requires an idempotency key and the Progress version', async () => {
    const { account, created } = await withCard()
    const { body } = await account.call(
      'put',
      '/api/cards/{cardId}/progress',
      `/api/cards/${created.id}/progress`,
      400,
      { body: { progress: 1 } },
    )
    expect(body).toMatchObject({
      fieldErrors: {
        [IDEMPOTENCY_KEY_HEADER]: expect.any(String),
        [IF_MATCH_HEADER]: expect.stringContaining('progressVersion'),
      },
    })
  })
})

describe('Progress versions', () => {
  it('refuses a stale save with 409, keeping the newer Progress', async () => {
    const { account, created } = await withCard()
    await account.saveProgress(created.id, 1, 1)

    const { body } = await account.saveProgress(created.id, 1, 1, {
      status: 409,
    })

    expect(body).toMatchObject({ code: 'version_conflict' })
    expect((await account.get(created.id)).body).toMatchObject({
      progress: 1,
      progressVersion: 2,
    })
  })

  it('lets only one of several concurrent saves of the same version succeed', async () => {
    const { account, created } = await withCard()

    const statuses = await Promise.all(
      [1, 1, 1, 0, 1].map(async (progress) => {
        const response = await rawSave(account, created.id, 1, progress)
        await response.body?.cancel()
        return response.status
      }),
    )

    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 409)).toHaveLength(4)
    expect((await account.get(created.id)).body).toMatchObject({
      progressVersion: 2,
    })
  })

  it('lets content edits and Progress saves of the same Card both succeed', async () => {
    const { account, created } = await withCard()

    // Both based on what the device last fetched: neither makes the other stale.
    const [edited, saved] = await Promise.all([
      account.edit(created.id, 1, { answer: 'Edited.' }),
      account.saveProgress(created.id, 1, 1),
    ])

    expect(edited.body).toMatchObject({ contentVersion: 2 })
    expect(saved.body).toMatchObject({ progressVersion: 2 })
    expect((await account.get(created.id)).body).toMatchObject({
      answer: 'Edited.',
      progress: 1,
      contentVersion: 2,
      progressVersion: 2,
    })
    // And again, each on its own version only.
    await account.saveProgress(created.id, 2, 2)
    await account.edit(created.id, 2, { question: 'Again?' })
    expect((await account.get(created.id)).body).toMatchObject({
      question: 'Again?',
      progress: 2,
      contentVersion: 3,
      progressVersion: 3,
    })
  })

  it('lets a deletion through after a Progress save, but not after an edit', async () => {
    const { account, created } = await withCard()
    await account.saveProgress(created.id, 1, 4)
    await account.remove(created.id, 1)
    expect((await account.list()).total).toBe(0)

    const other = (await account.create(card(2))).body as Card
    await account.edit(other.id, 1, { answer: 'Changed meanwhile.' })
    await account.remove(other.id, 1, { status: 409 })
  })

  it('never recreates a deleted Card, however a save and a deletion race', async () => {
    for (let round = 0; round < 3; round++) {
      const { account, created } = await withCard()
      const [saved, deleted] = await Promise.all([
        rawSave(account, created.id, 1, 1),
        account.remove(created.id, 1),
      ])
      expect([200, 404]).toContain(saved.status)
      await saved.body?.cancel()
      expect(deleted.headers.get('Idempotent-Replayed')).toBeNull()
      // A later save finds nothing.
      await account.saveProgress(created.id, 2, 2, { status: 404 })
      await account.saveProgress(created.id, 1, 1, { status: 404 })
      expect(await account.list()).toMatchObject({ total: 0 })
      expect(await account.categories()).toEqual([])
    }
  })

  it("answers 404 for another account's Card, revealing and changing nothing", async () => {
    const { account: alice, created } = await withCard()
    const bob = newAccount()

    const { body } = await bob.saveProgress(created.id, 1, 5, { status: 404 })

    expect(body).toMatchObject({ code: 'not_found' })
    expect((await alice.get(created.id)).body).toEqual(created)
  })
})

describe('retrying a Progress save', () => {
  it('replays a lost save once, even after later saves, edits and deletion', async () => {
    const { account, created } = await withCard()
    const key = newKey()
    const first = (await account.saveProgress(created.id, 1, 1, { key })).body

    const replay = await account.saveProgress(created.id, 1, 1, { key })
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true')
    expect(replay.body).toEqual(first)
    expect((await account.get(created.id)).body).toMatchObject({
      progress: 1,
      progressVersion: 2,
    })

    await account.saveProgress(created.id, 2, 2)
    await account.edit(created.id, 1, { answer: 'Later.' })
    const later = await account.saveProgress(created.id, 1, 1, { key })
    // The Card as that save left it: older than what the backend holds now.
    expect(later.body).toEqual(first)
    expect((await account.get(created.id)).body).toMatchObject({
      answer: 'Later.',
      progress: 2,
    })

    await account.remove(created.id, 2)
    const afterDeletion = await account.saveProgress(created.id, 1, 1, { key })
    expect(afterDeletion.body).toEqual(first)
    expect(await account.list()).toMatchObject({ total: 0 })
  })

  it('applies a save raced by its own retries once', async () => {
    const { account, created } = await withCard()
    const key = newKey()

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => rawSave(account, created.id, 1, 1, key)),
    )

    const bodies = await Promise.all(responses.map((r) => r.json()))
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200])
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1)
    expect(
      responses.filter((r) => r.headers.get('Idempotent-Replayed') === null),
    ).toHaveLength(1)
    expect((await account.get(created.id)).body).toMatchObject({
      progress: 1,
      progressVersion: 2,
    })
  })

  it('refuses a key reused for another Progress or Card, and keeps keys to their operation and account', async () => {
    const account = newAccount()
    const one = (await account.create(card(1))).body as Card
    const two = (await account.create(card(2))).body as Card
    const key = newKey()
    await account.saveProgress(one.id, 1, 1, { key })

    await account.saveProgress(one.id, 1, 2, { key, status: 422 })
    await account.saveProgress(two.id, 1, 1, { key, status: 422 })
    // The same key for an edit is another operation's: a new write.
    await account.edit(two.id, 1, { answer: 'Edited.' }, { key })
    // And another account's.
    const bob = newAccount()
    const his = (await bob.create(card(1))).body as Card
    const { headers } = await bob.saveProgress(his.id, 1, 1, { key })
    expect(headers.get('Idempotent-Replayed')).toBeNull()
  })

  it('forgets Progress keys after 24 hours', async () => {
    const db = database((await worker.env()).DB)
    const owned = collection(db, `user_progress_expiry_${crypto.randomUUID()}`)
    const t0 = Date.now()
    const created = await owned.createCard(card(1), newKey(), 'h', t0)
    if (created.kind !== 'created') throw new Error(created.kind)
    const save = {
      cardId: created.card.id,
      progressVersion: 1,
      key: 'progress-key-0123456789',
      requestHash: 'hash',
      now: t0,
    }
    expect(await owned.setProgress(1, save)).toMatchObject({ kind: 'updated' })

    expect(
      await owned.setProgress(1, { ...save, now: t0 + IDEMPOTENCY_TTL_MS - 1 }),
    ).toMatchObject({ kind: 'replayed', card: { progress: 1 } })
    // Expired: the key is a new save, now stale.
    expect(
      await owned.setProgress(1, { ...save, now: t0 + IDEMPOTENCY_TTL_MS }),
    ).toEqual({ kind: 'conflict' })
  })
})
