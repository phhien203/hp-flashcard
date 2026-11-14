import { createClerkClient } from '@clerk/backend'
import { describe, expect, it } from 'vitest'

import { IDEMPOTENCY_KEY_HEADER } from '../src/domain/idempotency.js'
import { APP_ORIGIN, startWorker } from './test/harness.js'

/*
 * The one check against a real Clerk instance: a development instance's
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
})
