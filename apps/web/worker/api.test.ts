import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { contractChecker, type Method } from '../src/api/contract-check.js'
import { CARD_QUOTA } from '../src/domain/card-text.js'
import { IDEMPOTENCY_KEY_HEADER } from '../src/domain/idempotency.js'
import { IDEMPOTENCY_TTL_MS } from '../src/domain/idempotency.js'
import { collection, database, forgetExpiredRecords } from './collection.js'
import {
  createIssuer,
  startWorker,
  type Issuer,
  type TestWorker,
} from './test/harness.js'

/*
 * The Worker at its HTTP seam: the bundled Worker in workerd, with a local
 * D1 database built by the checked-in migrations, verifying session tokens
 * with Clerk's code against a test signing key. Every response is checked
 * against api/openapi.yaml.
 */

type Card = {
  id: string
  question: string
  answer: string
  category: { id: string; name: string }
  progress: number
}
type CardPage = { items: Card[]; total: number; nextOffset: number | null }

let issuer: Issuer
let worker: TestWorker
let check: Awaited<ReturnType<typeof contractChecker>>
let accounts = 0

beforeAll(async () => {
  issuer = createIssuer()
  worker = await startWorker({ issuer })
  check = await contractChecker(worker.fetch)
})
afterAll(() => worker?.dispose())

/** A new account, with a valid session, so tests don't share Collections. */
function newAccount() {
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

const newKey = (): string => crypto.randomUUID()

const everything = {
  categoryIds: [],
  hideMastered: false,
  offset: 0,
  limit: 48,
  seed: undefined,
}

const card = (n: number | string, category = 'General') => ({
  question: `Question ${n}?`,
  answer: `Answer ${n}.`,
  category,
})

describe('authentication', () => {
  const rejected = (headers: Record<string, string>) =>
    Promise.all([
      check('get', '/api/cards', '/api/cards', 401, { headers }),
      check('get', '/api/categories', '/api/categories', 401, { headers }),
      check('post', '/api/cards', '/api/cards', 401, {
        headers: { ...headers, [IDEMPOTENCY_KEY_HEADER]: newKey() },
        body: card(1),
      }),
    ])

  it.for([
    ['no token', () => ({})],
    ['a malformed token', () => ({ Authorization: 'Bearer not.a.jwt' })],
    ['a non-bearer scheme', () => ({ Authorization: 'Basic dXNlcjpwYXNz' })],
    [
      'an expired token',
      () => ({
        Authorization: `Bearer ${issuer.sessionToken({ sub: 'user_x', expiresIn: -120 })}`,
      }),
    ],
    [
      'a token not valid yet',
      () => ({
        Authorization: `Bearer ${issuer.sessionToken({ sub: 'user_x', notBefore: 600 })}`,
      }),
    ],
    [
      'a token signed by another key',
      () => ({
        Authorization: `Bearer ${createIssuer().sessionToken({ sub: 'user_x' })}`,
      }),
    ],
    [
      'a token issued for another origin',
      () => ({
        Authorization: `Bearer ${issuer.sessionToken({ sub: 'user_x', azp: 'https://evil.example' })}`,
      }),
    ],
  ] as const)('refuses %s with 401, writing nothing', async ([, headers]) => {
    const responses = await rejected(headers())
    for (const { body } of responses)
      expect(body).toMatchObject({ code: 'unauthorized' })
    const owner = {
      Authorization: `Bearer ${issuer.sessionToken({ sub: 'user_x' })}`,
    }
    const { body } = await check('get', '/api/cards', '/api/cards', 200, {
      headers: owner,
    })
    expect(body).toMatchObject({ total: 0 })
  })
})

describe('a new account', () => {
  it('starts with an empty Collection', async () => {
    const account = newAccount()
    expect(await account.list()).toMatchObject({
      items: [],
      total: 0,
      nextOffset: null,
    })
    expect(await account.categories()).toEqual([])
    const { body } = await account.call(
      'get',
      '/api/cards/statistics',
      '/api/cards/statistics',
      200,
    )
    expect(body).toEqual({
      total: 0,
      notStarted: 0,
      inProgress: 0,
      mastered: 0,
    })
  })
})

describe('creating and reading Cards', () => {
  it('creates a trimmed Card at Progress 0 and reads it back', async () => {
    const account = newAccount()
    const { body, headers } = await account.create({
      question: '  What is DNA?\n',
      answer: '\tDeoxyribonucleic acid. ',
      category: '  Biology ',
    })
    const created = body as Card
    expect(created).toMatchObject({
      question: 'What is DNA?',
      answer: 'Deoxyribonucleic acid.',
      category: { name: 'Biology' },
      progress: 0,
    })
    expect(headers.get('Location')).toBe(`/api/cards/${created.id}`)
    const { body: read } = await account.call(
      'get',
      '/api/cards/{cardId}',
      `/api/cards/${created.id}`,
      200,
    )
    expect(read).toEqual(created)
  })

  it('lists the newest Card first, and allows duplicate questions', async () => {
    const account = newAccount()
    const ids: string[] = []
    for (const n of [1, 2, 3, 3])
      ids.push(((await account.create(card(n))).body as Card).id)
    const page = await account.list()
    expect(page.total).toBe(4)
    expect(page.items.map((c) => c.id)).toEqual([...ids].reverse())
  })

  it('pages, filters and shuffles the listing', async () => {
    const account = newAccount()
    for (let n = 0; n < 14; n++)
      await account.create(card(n, n % 2 ? 'Odd' : 'Even'))
    const first = await account.list('?limit=12')
    expect(first).toMatchObject({ total: 14, nextOffset: 12 })
    const rest = await account.list('?offset=12&limit=12')
    expect(rest).toMatchObject({ nextOffset: null })
    expect(rest.items).toHaveLength(2)

    const odd = (await account.categories()).find((c) => c.name === 'Odd')!
    expect(odd.count).toBe(7)
    const filtered = await account.list(`?category=${odd.id}`)
    expect(filtered.total).toBe(7)

    const shuffled = [
      ...(await account.list('?seed=7&limit=12')).items,
      ...(await account.list('?seed=7&offset=12&limit=12')).items,
    ].map((c) => c.id)
    expect(new Set(shuffled).size).toBe(14)
    expect(shuffled).not.toEqual(
      [...first.items, ...rest.items].map((c) => c.id),
    )
  })

  it('matches Categories ignoring case and whitespace, keeping the first spelling', async () => {
    const account = newAccount()
    const created = await Promise.all(
      ['Biology', ' biology', 'BIOLOGY  '].map(
        async (category, n) =>
          (await account.create(card(n, category))).body as Card,
      ),
    )
    expect(new Set(created.map((c) => c.category.id)).size).toBe(1)
    expect(await account.categories()).toEqual([
      {
        id: created[0]!.category.id,
        name: created[0]!.category.name,
        count: 3,
      },
    ])
  })

  it('never creates duplicate Categories, however requests race', async () => {
    const account = newAccount()
    const spellings = ['Physics', 'physics', ' PHYSICS', 'Physics ', 'pHySiCs']
    await Promise.all(
      Array.from({ length: 20 }, (_, n) =>
        account.create(card(n, spellings[n % spellings.length])),
      ),
    )
    const categories = await account.categories()
    expect(categories).toHaveLength(1)
    expect(categories[0]).toMatchObject({ count: 20 })
  })
})

describe('ownership', () => {
  it("keeps every account's Cards, Categories and counts to itself", async () => {
    const alice = newAccount()
    const bob = newAccount()
    const secret = (await alice.create(card('secret', 'Private'))).body as Card

    await bob.call('get', '/api/cards/{cardId}', `/api/cards/${secret.id}`, 404)
    expect(await bob.list()).toMatchObject({ items: [], total: 0 })
    expect(await bob.list(`?category=${secret.category.id}`)).toMatchObject({
      total: 0,
    })
    expect(await bob.categories()).toEqual([])

    // The same Category name is Bob's own Category.
    const bobs = (await bob.create(card(1, 'private'))).body as Card
    expect(bobs.category).toMatchObject({ name: 'private' })
    expect(bobs.category.id).not.toBe(secret.category.id)
    expect(await alice.categories()).toEqual([
      { id: secret.category.id, name: 'Private', count: 1 },
    ])
  })

  it('takes the owner only from the verified session, never the request', async () => {
    const alice = newAccount()
    const bob = newAccount()
    const { body } = await bob.create(
      { ...card(1), ownerId: alice.userId },
      { status: 400 },
    )
    expect(body).toMatchObject({ fieldErrors: { ownerId: 'Unknown field.' } })
    expect(await alice.list()).toMatchObject({ total: 0 })
  })

  it('serves the same Collection to every session of an account', async () => {
    const account = newAccount()
    const created = (await account.create(card(1))).body as Card
    const { body } = await check('get', '/api/cards', '/api/cards', 200, {
      headers: account.auth('sess_other_device'),
    })
    expect(body).toMatchObject({ items: [created], total: 1 })
  })
})

describe('validation', () => {
  it.for([
    [{ ...card(1), question: ' \n\t ' }, 'question'],
    [{ ...card(1), answer: '' }, 'answer'],
    [{ question: 'Q?', answer: 'A.' }, 'category'],
    [{ ...card(1), category: 7 }, 'category'],
    [{ ...card(1), question: 'x'.repeat(2001) }, 'question'],
    [{ ...card(1), answer: 'x'.repeat(10001) }, 'answer'],
    [{ ...card(1), category: 'x'.repeat(101) }, 'category'],
    [{ ...card(1), question: 'Broken \uD800 text' }, 'question'],
    // SQLite's length() stops at a NUL, so the database couldn't check it.
    [{ ...card(1), question: '\u0000 hidden' }, 'question'],
    [{ ...card(1), category: 'Bio\u0000logy' }, 'category'],
  ] as const)(
    'rejects a bad %# field, creating nothing',
    async ([body, field]) => {
      const account = newAccount()
      const { body: error } = await account.create(body, { status: 400 })
      expect(error).toMatchObject({
        code: 'validation_failed',
        fieldErrors: { [field]: expect.any(String) },
      })
      expect(await account.list()).toMatchObject({ total: 0 })
    },
  )

  it('counts characters as code points, after trimming', async () => {
    const account = newAccount()
    const { body } = await account.create({
      question: `  ${'😀'.repeat(2000)}  `,
      answer: 'é'.repeat(10000),
      category: '日本'.repeat(50),
    })
    expect((body as Card).question).toBe('😀'.repeat(2000))
  })

  it.for([undefined, 'short', 'has spaces, which are not allowed'])(
    'rejects the Idempotency-Key %j',
    async (key) => {
      const account = newAccount()
      const { body } = await account.call(
        'post',
        '/api/cards',
        '/api/cards',
        400,
        {
          body: card(1),
          headers: key === undefined ? {} : { [IDEMPOTENCY_KEY_HEADER]: key },
        },
      )
      expect(body).toMatchObject({
        fieldErrors: { [IDEMPOTENCY_KEY_HEADER]: expect.any(String) },
      })
    },
  )
})

describe('retrying a creation', () => {
  it('answers a retry after a lost response with the original Card, once', async () => {
    const account = newAccount()
    const key = newKey()
    // The first response is lost: the client never reads it.
    await worker.fetch('/api/cards', {
      method: 'POST',
      headers: {
        ...account.auth(),
        'Content-Type': 'application/json',
        [IDEMPOTENCY_KEY_HEADER]: key,
      },
      body: JSON.stringify(card(1)),
    })
    const { body, headers } = await account.create(card(1), { key })
    expect(headers.get('Idempotent-Replayed')).toBe('true')
    expect(await account.list()).toMatchObject({ items: [body], total: 1 })
  })

  it('creates one Card when the same request races itself', async () => {
    const account = newAccount()
    const key = newKey()
    const results = await Promise.all(
      Array.from({ length: 10 }, () => account.create(card(1), { key })),
    )
    const ids = new Set(results.map(({ body }) => (body as Card).id))
    expect(ids.size).toBe(1)
    expect(
      results.filter(({ headers }) => headers.get('Idempotent-Replayed')),
    ).toHaveLength(9)
    expect(await account.list()).toMatchObject({ total: 1 })
  })

  it('repeats the original response after the Collection has changed', async () => {
    const account = newAccount()
    const key = newKey()
    const first = await account.create(card(1), { key })
    await account.create(card(2))
    const again = await account.create(card(1), { key })
    expect(again.body).toEqual(first.body)
    expect(await account.list()).toMatchObject({ total: 2 })
  })

  it('creates a new Card for the same text with a new key', async () => {
    const account = newAccount()
    await account.create(card(1))
    await account.create(card(1))
    expect(await account.list()).toMatchObject({ total: 2 })
  })

  it('refuses a key reused for a different request', async () => {
    const account = newAccount()
    const key = newKey()
    await account.create(card(1), { key })
    const { body } = await account.create(card(2), { key, status: 422 })
    expect(body).toMatchObject({ code: 'idempotency_key_reused' })
    expect(await account.list()).toMatchObject({ total: 1 })
  })

  it("keeps keys to their account: another's key creates, and leaks nothing", async () => {
    const alice = newAccount()
    const bob = newAccount()
    const key = newKey()
    const hers = (await alice.create(card('hers', 'Hers'), { key }))
      .body as Card
    const { body, headers } = await bob.create(card('hers', 'Hers'), { key })
    expect(headers.get('Idempotent-Replayed')).toBeNull()
    expect((body as Card).id).not.toBe(hers.id)
    expect((body as Card).category.id).not.toBe(hers.category.id)
    // A different body under Alice's key is not "reused" for Bob either.
    await bob.create(card('other'), { key: newKey() })
    expect(await alice.list()).toMatchObject({ total: 1 })
  })
})

describe('expiring retry records', () => {
  // Time can't be moved inside workerd, so this drives the Collection
  // module directly, on the Worker's own D1 binding, at chosen times.
  const fields = card('expiring')

  it('answers retries for 24 hours, then forgets the key', async () => {
    const db = database((await worker.env()).DB)
    const owned = collection(db, `user_expiry_${crypto.randomUUID()}`)
    const key = newKey()
    const t0 = Date.now()
    const created = await owned.createCard(fields, key, 'hash', t0)
    expect(created.kind).toBe('created')

    const later = await owned.createCard(
      fields,
      key,
      'hash',
      t0 + IDEMPOTENCY_TTL_MS - 1,
    )
    expect(later).toEqual({ ...created, kind: 'replayed' })

    const expired = await owned.createCard(
      fields,
      key,
      'hash',
      t0 + IDEMPOTENCY_TTL_MS,
    )
    expect(expired.kind).toBe('created')
    expect(expired).not.toEqual({ ...created, kind: 'created' })
    expect((await owned.listCards(everything)).total).toBe(2)
  })

  it('lets the daily cleanup delete only expired records', async () => {
    const db = database((await worker.env()).DB)
    const before = collection(db, `user_cleanup_${crypto.randomUUID()}`)
    const now = collection(db, `user_cleanup_${crypto.randomUUID()}`)
    const t0 = Date.now()
    const tOld = t0 - IDEMPOTENCY_TTL_MS - 1
    await before.createCard(fields, 'old-key-0123456789', 'hash', tOld)
    const live = await now.createCard(fields, 'live-key-0123456789', 'hash', t0)

    await forgetExpiredRecords(db, t0)

    // Asked as of just after its creation, the old key is gone: it creates.
    const reused = await before.createCard(
      fields,
      'old-key-0123456789',
      'hash',
      tOld + 1,
    )
    expect(reused.kind).toBe('created')
    expect(
      await now.createCard(fields, 'live-key-0123456789', 'hash', t0),
    ).toEqual({
      ...live,
      kind: 'replayed',
    })
    expect((await worker.scheduled()).outcome).toBe('ok')
  })
})

describe('the Card quota', () => {
  it(`holds at ${CARD_QUOTA} Cards, even when requests race for the last places`, async () => {
    const account = newAccount()
    for (let start = 0; start < CARD_QUOTA - 2; start += 100) {
      await Promise.all(
        Array.from({ length: Math.min(100, CARD_QUOTA - 2 - start) }, (_, i) =>
          account.create(card(start + i)),
        ),
      )
    }
    expect((await account.list()).total).toBe(CARD_QUOTA - 2)

    const keys = Array.from({ length: 6 }, newKey)
    const statuses = await Promise.all(
      keys.map(async (key, n) => {
        const response = await worker.fetch('/api/cards', {
          method: 'POST',
          headers: {
            ...account.auth(),
            'Content-Type': 'application/json',
            [IDEMPOTENCY_KEY_HEADER]: key,
          },
          body: JSON.stringify(card(`last ${n}`)),
        })
        return { key, status: response.status, body: await response.json() }
      }),
    )
    expect(statuses.filter(({ status }) => status === 201)).toHaveLength(2)
    const refused = statuses.filter(({ status }) => status === 409)
    expect(refused).toHaveLength(4)
    expect(refused[0]!.body).toMatchObject({ code: 'quota_exceeded' })
    expect((await account.list()).total).toBe(CARD_QUOTA)

    // A full Collection still answers retries of completed creations.
    const done = statuses.find(({ status }) => status === 201)!
    const n = statuses.indexOf(done)
    const { headers } = await account.create(card(`last ${n}`), {
      key: done.key,
    })
    expect(headers.get('Idempotent-Replayed')).toBe('true')
    const { body } = await account.create(card('one more'), { status: 409 })
    expect(body).toMatchObject({ code: 'quota_exceeded' })
    // Another account's quota is its own.
    await newAccount().create(card(1))
  }, 120_000)
})

describe('operations of later slices', () => {
  it.for([
    ['patch', '/api/cards/{cardId}', { question: 'Q?' }],
    ['delete', '/api/cards/{cardId}', undefined],
    ['put', '/api/cards/{cardId}/progress', { progress: 1 }],
  ] as const)(
    '%s %s answers 501 and changes nothing',
    async ([method, template, body]) => {
      const account = newAccount()
      const created = (await account.create(card(1))).body as Card
      const path = template.replace('{cardId}', created.id)
      const { body: error } = await account.call(method, template, path, 501, {
        body,
      })
      expect(error).toMatchObject({ code: 'not_implemented' })
      expect(await account.list()).toMatchObject({ items: [created] })
    },
  )
})

describe('durability', () => {
  it('keeps Cards across Worker instances and sessions', async () => {
    const account = newAccount()
    const created = (await account.create(card('durable'))).body as Card
    await worker.restart()
    const { body } = await check(
      'get',
      '/api/cards/{cardId}',
      `/api/cards/${created.id}`,
      200,
      { headers: account.auth('sess_after_restart') },
    )
    expect(body).toEqual(created)
  })
})
