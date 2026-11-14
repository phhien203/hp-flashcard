import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { routePath } from 'hono/route'

import type { components } from '../src/api/schema.js'
import {
  checkCardText,
  QUOTA_EXCEEDED_MESSAGE,
  type CardText,
} from '../src/domain/card-text.js'
import {
  creationFingerprint,
  deletionFingerprint,
  editFingerprint,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MESSAGE,
  IDEMPOTENCY_KEY_PATTERN,
  IDEMPOTENT_REPLAYED_HEADER,
  progressFingerprint,
} from '../src/domain/idempotency.js'
import {
  RETRY_AFTER_HEADER,
  rateLimitedMessage,
} from '../src/domain/rate-limit.js'
import {
  parseCardBody,
  parseCardListQuery,
  parseCategoryFilter,
  parseProgressBody,
  parseVersionedWriteHeaders,
} from '../src/domain/requests.js'
import type { AppEnv } from './app-env.js'
import { requireSession } from './auth.js'
import { collection, database } from './collection.js'
import { apiError } from './errors.js'
import { isIdentityDeleted } from './lifecycle.js'
import { consoleLog, type Log } from './log.js'
import { admitWrite } from './rate-limit.js'
import { clerkWebhook } from './webhook.js'

type Schemas = components['schemas']

/**
 * The largest request body read, in bytes: room for the longest valid Card
 * (10,000 + 2,000 + 100 code points, even as JSON escapes) and any Clerk
 * event, and nothing near what a Worker should buffer.
 */
export const MAX_BODY_BYTES = 128 * 1024

/** The header carrying a request's id, in responses and in logs. */
export const REQUEST_ID_HEADER = 'X-Request-Id'

const invalid = (
  c: Context,
  message: string,
  fieldErrors: Record<string, string>,
) => apiError(c, 400, 'validation_failed', message, fieldErrors)

const notFound = (c: Context, cardId: string) =>
  apiError(c, 404, 'not_found', `No Card has the id "${cardId}".`)

const keyReused = (c: Context) =>
  apiError(
    c,
    422,
    'idempotency_key_reused',
    'This Idempotency-Key was used for a different request.',
  )

const versionConflict = (c: Context) =>
  apiError(
    c,
    409,
    'version_conflict',
    'This Card has changed since that version. Fetch it again to review it.',
  )

const progressConflict = (c: Context) =>
  apiError(
    c,
    409,
    'version_conflict',
    'This Card’s Progress has changed since that version. Fetch it again to review it.',
  )

const signInAgain = (c: Context) =>
  apiError(c, 401, 'unauthorized', 'Sign in to continue.')

/** SHA-256 of `text`, in hex. */
async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** The API of api/openapi.yaml, on D1, for verified Clerk sessions. */
export function createApp({
  now = Date.now,
  log = consoleLog,
}: {
  now?: () => number
  /** Where the structured, sanitized log records go. */
  log?: Log
} = {}) {
  const app = new Hono<AppEnv>()

  app.onError((error, c) => {
    // A deleted-identity guard refused a write: the identity was deleted
    // while the request ran. Nothing was written; the session is over.
    if (isIdentityDeleted(error)) return signInAgain(c)
    // Sanitized: the request, the route and the error's kind (its class
    // name), never its message, which may quote stored or sent values.
    log('error', {
      event: 'api_error',
      requestId: c.get('requestId'),
      method: c.req.method,
      route: routePath(c, -1),
      error: error.name,
    })
    return apiError(c, 500, 'server_error', 'The server failed.')
  })

  const api = app.basePath('/api')
  // Every request gets an id, in its response and its log record: the
  // route's pattern (never the URL, which names Cards), the status and the
  // latency. Never bodies, headers, tokens or identities.
  api.use('*', async (c, next) => {
    const requestId = crypto.randomUUID()
    c.set('requestId', requestId)
    const started = Date.now()
    await next()
    c.header(REQUEST_ID_HEADER, requestId)
    log(c.res.status >= 500 ? 'error' : 'info', {
      event: 'request',
      requestId,
      ray: c.req.header('cf-ray') ?? null,
      method: c.req.method,
      route: routePath(c, -1),
      status: c.res.status,
      durationMs: Date.now() - started,
    })
  })
  // Every response is one person's: no shared cache may keep or serve it.
  api.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'private, no-store')
    c.header('Vary', 'Authorization')
  })
  const payloadTooLarge = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) =>
      apiError(
        c,
        413,
        'payload_too_large',
        `The request body is larger than ${MAX_BODY_BYTES} bytes.`,
      ),
  })

  // Clerk's webhooks carry no session: their signature authenticates them.
  // Before requireSession, which they never reach.
  api.post('/webhooks/clerk', payloadTooLarge, (c) =>
    clerkWebhook(c, { now: now(), log }),
  )

  api.use('*', requireSession)
  // Writes, once authenticated: the per-account rate limit, then a bounded
  // body. A refused request reads no body and writes nothing.
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
    api.on(method, '*', async (c, next) => {
      const admission = await admitWrite(
        database(c.env.DB),
        c.get('ownerId'),
        now(),
      )
      if (admission.ok) return next()
      c.header(RETRY_AFTER_HEADER, String(admission.retryAfterSeconds))
      return apiError(
        c,
        429,
        'rate_limited',
        rateLimitedMessage(admission.retryAfterSeconds),
      )
    })
    api.on(method, '*', payloadTooLarge)
  }
  const owned = (c: Context<AppEnv>) =>
    collection(database(c.env.DB), c.get('ownerId'))

  api.get('/cards', async (c) => {
    const query = parseCardListQuery(new URL(c.req.url).searchParams)
    if (!query.ok) return invalid(c, query.error, query.fieldErrors)
    return c.json<Schemas['CardPage']>(await owned(c).listCards(query.value))
  })

  api.post('/cards', async (c) => {
    const key = c.req.header(IDEMPOTENCY_KEY_HEADER)
    const body = parseCardBody(await c.req.json().catch(() => undefined), {
      required: true,
    })
    if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      return invalid(c, 'The Idempotency-Key header is invalid.', {
        ...(body.ok ? {} : body.fieldErrors),
        [IDEMPOTENCY_KEY_HEADER]: IDEMPOTENCY_KEY_MESSAGE,
      })
    }
    if (!body.ok) return invalid(c, body.error, body.fieldErrors)
    const sent = body.value as CardText
    const checked = checkCardText(sent)
    if (!checked.ok) return invalid(c, 'The Card is invalid.', checked.errors)

    const creation = await owned(c).createCard(
      checked.value,
      key,
      await sha256(creationFingerprint(sent)),
      now(),
    )
    switch (creation.kind) {
      case 'quota_exceeded':
        return apiError(c, 409, 'quota_exceeded', QUOTA_EXCEEDED_MESSAGE)
      case 'key_reused':
        return keyReused(c)
      default:
        c.header(
          'Location',
          `/api/cards/${encodeURIComponent(creation.card.id)}`,
        )
        if (creation.kind === 'replayed')
          c.header(IDEMPOTENT_REPLAYED_HEADER, 'true')
        return c.json<Schemas['Card']>(creation.card, 201)
    }
  })

  // Before /cards/:cardId, which would take "statistics" for an id.
  api.get('/cards/statistics', async (c) => {
    const filter = parseCategoryFilter(new URL(c.req.url).searchParams)
    if (!filter.ok) return invalid(c, filter.error, filter.fieldErrors)
    return c.json<Schemas['CardStatistics']>(
      await owned(c).statistics(filter.value),
    )
  })

  api.get('/cards/:cardId', async (c) => {
    const cardId = c.req.param('cardId')
    const card = await owned(c).getCard(cardId)
    return card ? c.json<Schemas['Card']>(card) : notFound(c, cardId)
  })

  api.patch('/cards/:cardId', async (c) => {
    const cardId = c.req.param('cardId')
    const headers = parseVersionedWriteHeaders((name) => c.req.header(name))
    const body = parseCardBody(await c.req.json().catch(() => undefined), {
      required: false,
    })
    if (!headers.ok) {
      return invalid(c, headers.error, {
        ...(body.ok ? {} : body.fieldErrors),
        ...headers.fieldErrors,
      })
    }
    if (!body.ok) return invalid(c, body.error, body.fieldErrors)
    const checked = checkCardText(body.value)
    if (!checked.ok) return invalid(c, 'The Card is invalid.', checked.errors)

    const { key, version: contentVersion } = headers.value
    const edit = await owned(c).updateCard(checked.value, {
      cardId,
      contentVersion,
      key,
      requestHash: await sha256(
        editFingerprint(cardId, contentVersion, body.value),
      ),
      now: now(),
    })
    switch (edit.kind) {
      case 'not_found':
        return notFound(c, cardId)
      case 'conflict':
        return versionConflict(c)
      case 'key_reused':
        return keyReused(c)
      default:
        if (edit.kind === 'replayed')
          c.header(IDEMPOTENT_REPLAYED_HEADER, 'true')
        return c.json<Schemas['Card']>(edit.card)
    }
  })

  api.delete('/cards/:cardId', async (c) => {
    const cardId = c.req.param('cardId')
    const headers = parseVersionedWriteHeaders((name) => c.req.header(name))
    if (!headers.ok) return invalid(c, headers.error, headers.fieldErrors)

    const { key, version: contentVersion } = headers.value
    const deletion = await owned(c).deleteCard({
      cardId,
      contentVersion,
      key,
      requestHash: await sha256(deletionFingerprint(cardId, contentVersion)),
      now: now(),
    })
    switch (deletion.kind) {
      case 'not_found':
        return notFound(c, cardId)
      case 'conflict':
        return versionConflict(c)
      case 'key_reused':
        return keyReused(c)
      default:
        if (deletion.kind === 'replayed')
          c.header(IDEMPOTENT_REPLAYED_HEADER, 'true')
        return c.body(null, 204)
    }
  })

  api.put('/cards/:cardId/progress', async (c) => {
    const cardId = c.req.param('cardId')
    const headers = parseVersionedWriteHeaders(
      (name) => c.req.header(name),
      'progressVersion',
    )
    const body = parseProgressBody(await c.req.json().catch(() => undefined))
    if (!headers.ok) {
      return invalid(c, headers.error, {
        ...(body.ok ? {} : body.fieldErrors),
        ...headers.fieldErrors,
      })
    }
    if (!body.ok) return invalid(c, body.error, body.fieldErrors)

    const { key, version: progressVersion } = headers.value
    const save = await owned(c).setProgress(body.value, {
      cardId,
      progressVersion,
      key,
      requestHash: await sha256(
        progressFingerprint(cardId, progressVersion, body.value),
      ),
      now: now(),
    })
    switch (save.kind) {
      case 'not_found':
        return notFound(c, cardId)
      case 'conflict':
        return progressConflict(c)
      case 'key_reused':
        return keyReused(c)
      default:
        if (save.kind === 'replayed')
          c.header(IDEMPOTENT_REPLAYED_HEADER, 'true')
        return c.json<Schemas['Card']>(save.card)
    }
  })

  api.get('/categories', async (c) =>
    c.json<Schemas['CategoryList']>({
      items: await owned(c).listCategories(),
    }),
  )

  app.notFound((c) => apiError(c, 404, 'not_found', 'There is nothing here.'))

  return app
}
