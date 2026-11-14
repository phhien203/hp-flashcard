import { verifyWebhook } from '@clerk/backend/webhooks'
import type { Context } from 'hono'

import type { AppEnv } from './app-env.js'
import { database } from './collection.js'
import { apiError } from './errors.js'
import { lifecycle } from './lifecycle.js'
import type { Log } from './log.js'

/** The header Clerk (through Svix) identifies a delivery by, across retries. */
const DELIVERY_ID_HEADER = 'svix-id'

/**
 * `POST /api/webhooks/clerk`: Clerk's signed events. Only `user.deleted`
 * does anything: an administrator deleted the identity, so its Collection
 * is purged (lifecycle.ts).
 *
 * The signature is checked by Clerk's own `verifyWebhook` (Standard
 * Webhooks) over the original, unparsed body, with the endpoint's signing
 * secret. It also refuses a timestamp more than five minutes off, so a
 * captured delivery can't be replayed later; within those minutes, the
 * delivery id is remembered and a repeat is acknowledged without being
 * applied again. A forged or altered request gets `400` and changes
 * nothing.
 *
 * The answer is `200` only once the event's effect has committed. Any
 * failure answers `500` (via the app's error handler), so Clerk delivers
 * the event again.
 */
export async function clerkWebhook(
  c: Context<AppEnv>,
  { now, log }: { now: number; log: Log },
) {
  const signingSecret = c.env.CLERK_WEBHOOK_SIGNING_SECRET
  if (!signingSecret) {
    log('error', {
      event: 'webhook_misconfigured',
      requestId: c.get('requestId'),
    })
    return apiError(c, 500, 'server_error', 'The server failed.')
  }

  const event = await verifyWebhook(c.req.raw, { signingSecret }).catch(
    () => undefined,
  )
  const deliveryId = c.req.header(DELIVERY_ID_HEADER)
  if (!event || !deliveryId) {
    log('info', {
      event: 'webhook_rejected',
      requestId: c.get('requestId'),
    })
    return apiError(
      c,
      400,
      'invalid_signature',
      'The webhook signature is invalid.',
    )
  }

  const identities = lifecycle(database(c.env.DB))
  let outcome: string
  if (event.type === 'user.deleted') {
    const ownerId = event.data.id
    if (typeof ownerId !== 'string' || ownerId === '') {
      // Signed, but names no identity: nothing to purge, ever.
      await identities.acknowledge({ deliveryId, type: event.type, now })
      outcome = 'no_identity'
    } else {
      outcome = await identities.purge({
        ownerId,
        deliveryId,
        type: event.type,
        now,
      })
    }
  } else {
    await identities.acknowledge({ deliveryId, type: event.type, now })
    outcome = 'ignored'
  }
  // The event type and outcome only: never the identity or its emails.
  log('info', {
    event: 'webhook',
    requestId: c.get('requestId'),
    type: event.type,
    outcome,
  })
  return c.json({ received: true })
}
