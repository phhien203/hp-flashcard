import { createClerkClient } from '@clerk/backend'
import { describe, expect, it } from 'vitest'

import { IDEMPOTENCY_KEY_HEADER } from '../src/domain/idempotency.js'
import { ifMatch, IF_MATCH_HEADER } from '../src/domain/versions.js'
import { APP_ORIGIN, createWebhookSender, startWorker } from './test/harness.js'

/*
 * The checks against a real Clerk instance: a development instance's
 * real session token, verified by the Worker through Clerk's keys. Every
 * other test signs its own tokens. It runs only when given a development
 * secret key, and never sends email:
 *
 *   CLERK_SECRET_KEY=sk_test_… pnpm vitest run --project web:worker clerk
 */
const secretKey = process.env.CLERK_SECRET_KEY

describe.skipIf(!secretKey)('the Clerk development instance', () => {
  it('signs in a real user whose Collection starts empty and is theirs', async () => {
    if (!secretKey!.startsWith('sk_test_'))
      throw new Error(
        'Use a development instance key (sk_test_…), never production.',
      )
    const clerk = createClerkClient({ secretKey })
    // Clerk's test addresses (+clerk_test) never receive email.
    const user = await clerk.users.createUser({
      emailAddress: [`hp-flashcard+clerk_test_${Date.now()}@example.com`],
    })
    const worker = await startWorker({
      secrets: {
        CLERK_SECRET_KEY: secretKey!,
        CLERK_AUTHORIZED_PARTIES: APP_ORIGIN,
      },
    })
    try {
      const session = await clerk.sessions.createSession({ userId: user.id })
      const { jwt } = await clerk.sessions.getToken(session.id)
      const auth = { Authorization: `Bearer ${jwt}` }

      const empty = await worker.fetch('/api/cards', { headers: auth })
      expect(empty.status).toBe(200)
      expect(await empty.json()).toMatchObject({ total: 0 })

      const created = await worker.fetch('/api/cards', {
        method: 'POST',
        headers: {
          ...auth,
          'Content-Type': 'application/json',
          [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
        },
        body: JSON.stringify({ question: 'Q?', answer: 'A.', category: 'C' }),
      })
      expect(created.status).toBe(201)

      await clerk.sessions.revokeSession(session.id)
      const unsigned = await worker.fetch('/api/cards')
      expect(unsigned.status).toBe(401)
    } finally {
      await worker.dispose()
      await clerk.users.deleteUser(user.id)
    }
  })

  it('keeps self-service account deletion off (Clerk configuration check)', async () => {
    // "Allow users to delete their accounts" must be off for the instance
    // (README.md, Human-only setup): a new user can't delete themselves.
    const clerk = createClerkClient({ secretKey })
    const user = await clerk.users.createUser({
      emailAddress: [`hp-flashcard+clerk_test_${Date.now()}@example.com`],
    })
    try {
      expect(user.deleteSelfEnabled).toBe(false)
    } finally {
      await clerk.users.deleteUser(user.id)
    }
  })

  it('studies, edits and deletes with a real session, then shuts out a deleted identity', async () => {
    const clerk = createClerkClient({ secretKey })
    const user = await clerk.users.createUser({
      emailAddress: [`hp-flashcard+clerk_test_${Date.now()}@example.com`],
    })
    const webhooks = createWebhookSender()
    const worker = await startWorker({
      secrets: {
        CLERK_SECRET_KEY: secretKey!,
        CLERK_AUTHORIZED_PARTIES: APP_ORIGIN,
        CLERK_WEBHOOK_SIGNING_SECRET: webhooks.secret,
      },
    })
    let deleted = false
    try {
      const session = await clerk.sessions.createSession({ userId: user.id })
      const { jwt } = await clerk.sessions.getToken(session.id)
      const send = (
        path: string,
        method = 'GET',
        { body, version }: { body?: unknown; version?: number } = {},
      ) =>
        worker.fetch(path, {
          method,
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
            [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
            ...(version ? { [IF_MATCH_HEADER]: ifMatch(version) } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })

      const created = await send('/api/cards', 'POST', {
        body: { question: 'Q?', answer: 'A.', category: 'C' },
      })
      expect(created.status).toBe(201)
      const { id } = (await created.json()) as { id: string }
      // A reload, from a new Worker instance: still there.
      await worker.restart()
      expect(await (await send('/api/cards')).json()).toMatchObject({
        total: 1,
      })
      const studied = await send(`/api/cards/${id}/progress`, 'PUT', {
        body: { progress: 1 },
        version: 1,
      })
      expect(await studied.json()).toMatchObject({ progress: 1 })
      const edited = await send(`/api/cards/${id}`, 'PATCH', {
        body: { answer: 'B.' },
        version: 1,
      })
      expect(await edited.json()).toMatchObject({ answer: 'B.', progress: 1 })
      expect(
        (await send(`/api/cards/${id}`, 'DELETE', { version: 2 })).status,
      ).toBe(204)

      // An administrator deletes the user. Clerk's session token stays
      // valid until it expires, so the deletion webhook is what ends it.
      await clerk.users.deleteUser(user.id)
      deleted = true
      expect((await send('/api/cards')).status).toBe(200)
      const event = JSON.stringify({
        type: 'user.deleted',
        data: { id: user.id, deleted: true },
      })
      const delivery = await worker.fetch('/api/webhooks/clerk', {
        method: 'POST',
        headers: webhooks.headers(event),
        body: event,
      })
      expect(delivery.status).toBe(200)
      expect((await send('/api/cards')).status).toBe(401)
    } finally {
      await worker.dispose()
      if (!deleted) await clerk.users.deleteUser(user.id)
    }
  })
})
