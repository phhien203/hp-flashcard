import { Hono, type Context } from 'hono'

import type { components } from '../src/api/schema.js'
import { checkCardText, type CardText } from '../src/domain/card-text.js'
import {
  creationFingerprint,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MESSAGE,
  IDEMPOTENCY_KEY_PATTERN,
  IDEMPOTENT_REPLAYED_HEADER,
} from '../src/domain/idempotency.js'
import {
  parseCardBody,
  parseCardListQuery,
  parseCategoryFilter,
} from '../src/domain/requests.js'
import { requireSession, type AuthVariables } from './auth.js'
import { collection, database } from './collection.js'
import type { Env } from './env.js'
import { apiError } from './errors.js'

type Schemas = components['schemas']
type AppEnv = { Bindings: Env; Variables: AuthVariables }

const invalid = (
  c: Context,
  message: string,
  fieldErrors: Record<string, string>,
) => apiError(c, 400, 'validation_failed', message, fieldErrors)

const notFound = (c: Context, cardId: string) =>
  apiError(c, 404, 'not_found', `No Card has the id "${cardId}".`)

/** For operations later slices build: refuse, never pretend. */
const notImplemented = (c: Context) =>
  apiError(c, 501, 'not_implemented', 'This operation is not available yet.')

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
export function createApp({ now = Date.now }: { now?: () => number } = {}) {
  const app = new Hono<AppEnv>()

  app.onError((error, c) => {
    // Sanitized: the route and the error's kind, never bodies or tokens.
    console.error(
      JSON.stringify({
        event: 'api_error',
        method: c.req.method,
        route: c.req.routePath,
        error: error.name,
      }),
    )
    return apiError(c, 500, 'server_error', 'The server failed.')
  })

  const api = app.basePath('/api')
  api.use('*', requireSession)
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
        return apiError(
          c,
          409,
          'quota_exceeded',
          'A collection can hold at most 1,000 cards.',
        )
      case 'key_reused':
        return apiError(
          c,
          422,
          'idempotency_key_reused',
          'This Idempotency-Key was used for a different request.',
        )
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

  // Editing, deleting and Progress arrive in later slices (ADR 0003).
  api.patch('/cards/:cardId', notImplemented)
  api.delete('/cards/:cardId', notImplemented)
  api.put('/cards/:cardId/progress', notImplemented)

  api.get('/categories', async (c) =>
    c.json<Schemas['CategoryList']>({
      items: await owned(c).listCategories(),
    }),
  )

  app.notFound((c) => apiError(c, 404, 'not_found', 'There is nothing here.'))

  return app
}
