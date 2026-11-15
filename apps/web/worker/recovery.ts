import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import type { components } from '../src/api/schema.js'
import {
  MAINTENANCE_MESSAGE,
  MAINTENANCE_RETRY_AFTER_SECONDS,
} from '../src/domain/maintenance.js'
import { RETRY_AFTER_HEADER } from '../src/domain/rate-limit.js'
import type { AppEnv } from './app-env.js'
import { database, type Database } from './collection.js'
import { recoveries } from './db/schema.js'
import { apiError } from './errors.js'
import { purgeStatements } from './lifecycle.js'
import type { Log } from './log.js'

type Schemas = components['schemas']

/*
 * Database recovery (ADR 0005, docs/web-recovery.md).
 *
 * The operator starts a recovery by giving the Worker a new
 * `RECOVERY_EPOCH`: a Worker variable, outside D1, so restoring D1 can't
 * clear it. From then on the API answers `503` to everything but its
 * health and Clerk's webhooks, until a row in `recoveries` for that epoch
 * says it was reopened. Reopening needs a reconciliation of deleted
 * identities against Clerk, for that epoch, in the database as it is now:
 * a restore rolls `recoveries` back with everything else, so restoring
 * after reconciling closes the API again until it is reconciled again.
 *
 * Clerk, not D1, is the authority on which identities are deleted: a
 * restore can't bring a deleted Clerk user back, while it can bring back a
 * Collection, a tombstone's absence, or a forgotten webhook delivery.
 */

/** The Clerk Backend API, unless `CLERK_API_URL` says otherwise (tests). */
const CLERK_API_URL = 'https://api.clerk.com'

/** How many user ids one Clerk user-list request asks about. */
const CLERK_PAGE = 100

/** Answers `503`: the API is closed for maintenance; nothing was done. */
export const underMaintenance = (c: Context) => {
  c.header(RETRY_AFTER_HEADER, String(MAINTENANCE_RETRY_AFTER_SECONDS))
  return apiError(c, 503, 'maintenance', MAINTENANCE_MESSAGE)
}

/** Whether the recovery `epoch` has been reopened, in D1 as it is now. */
async function isReopened(db: Database, epoch: string) {
  const [row] = await db
    .select({ epoch: recoveries.epoch })
    .from(recoveries)
    .where(and(eq(recoveries.epoch, epoch), isNotNull(recoveries.reopenedAt)))
  return row !== undefined
}

/**
 * Closes the API while a recovery is under way: before any session is
 * verified or any data read. Fails closed: a database that can't answer
 * (mid-restore) keeps it closed.
 */
export const maintenanceGate = createMiddleware<AppEnv>(async (c, next) => {
  if (await isUnderMaintenance(c.env)) return underMaintenance(c)
  await next()
})

/** Whether the API is closed for maintenance, for the health endpoint. */
export async function isUnderMaintenance(env: AppEnv['Bindings']) {
  const epoch = env.RECOVERY_EPOCH?.trim()
  if (!epoch) return false
  return !(await isReopened(database(env.DB), epoch).catch(() => false))
}

/** SHA-256 of `text`, as bytes: equal-length inputs for a timing-safe compare. */
const digest = async (text: string) =>
  crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))

/** Compares two secrets without leaking, by timing, where they differ. */
async function sameSecret(a: string, b: string) {
  return crypto.subtle.timingSafeEqual(await digest(a), await digest(b))
}

/**
 * Of `ownerIds`, those Clerk no longer has: deleted. Asks Clerk's Backend
 * API which of them exist, 100 at a time, and fails (throws) rather than
 * guess when Clerk doesn't answer as expected, so a reconciliation is all
 * or nothing.
 */
export async function deletedInClerk(
  ownerIds: readonly string[],
  { apiUrl, secretKey }: { apiUrl: string; secretKey: string },
): Promise<Set<string>> {
  const deleted = new Set<string>()
  for (let start = 0; start < ownerIds.length; start += CLERK_PAGE) {
    const page = ownerIds.slice(start, start + CLERK_PAGE)
    const url = new URL('/v1/users', apiUrl)
    for (const id of page) url.searchParams.append('user_id', id)
    url.searchParams.set('limit', String(CLERK_PAGE))
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    if (!response.ok) throw new ClerkUnavailable(response.status)
    const users: unknown = await response.json()
    if (!Array.isArray(users)) throw new ClerkUnavailable(response.status)
    const existing = new Set(
      users.map((user: unknown) =>
        typeof user === 'object' && user !== null && 'id' in user
          ? user.id
          : undefined,
      ),
    )
    for (const id of page) if (!existing.has(id)) deleted.add(id)
  }
  return deleted
}

/** Clerk didn't answer which identities exist. */
export class ClerkUnavailable extends Error {
  constructor(status: number) {
    super(`Clerk answered ${status}.`)
    this.name = 'ClerkUnavailable'
  }
}

/**
 * Every table keyed by owner: one list, so reconciling and inspecting
 * can't disagree about where an identity's rows live.
 */
const OWNER_TABLES = [
  'cards',
  'categories',
  'idempotency_records',
  'write_requests',
] as const

/** Each owner's `owner_id` from every owner-keyed table, joined by `union`. */
const ownerIds = (union: 'UNION' | 'UNION ALL') =>
  OWNER_TABLES.map((table) => `SELECT owner_id FROM ${table}`).join(
    ` ${union} `,
  )

/** Every owner with anything in D1, and those already recorded as deleted. */
async function owners(d1: D1Database) {
  const { results } = await d1
    .prepare(
      `SELECT owner_id AS ownerId,
              EXISTS (SELECT 1 FROM deleted_identities d
                      WHERE d.owner_id = o.owner_id) AS tombstoned
       FROM (${ownerIds('UNION')}) o
       ORDER BY owner_id`,
    )
    .all<{ ownerId: string; tombstoned: number }>()
  return results
}

/**
 * What D1 holds, and anything in it that a healthy database never has:
 * Cards whose Category is missing or someone else's, versions below 1,
 * Progress outside 0–5, or rows of an identity recorded as deleted.
 */
async function inspect(d1: D1Database): Promise<Schemas['RecoveryCounts']> {
  const row = await d1
    .prepare(
      `SELECT
         (SELECT count(*) FROM (${ownerIds('UNION')})) AS owners,
         (SELECT count(*) FROM cards) AS cards,
         (SELECT count(*) FROM categories) AS categories,
         (SELECT count(*) FROM idempotency_records) AS retryRecords,
         (SELECT count(*) FROM deleted_identities) AS deletedIdentities,
         (SELECT count(*) FROM cards c WHERE NOT EXISTS (
            SELECT 1 FROM categories g
            WHERE g.id = c.category_id AND g.owner_id = c.owner_id))
           AS cardsWithoutCategory,
         (SELECT count(*) FROM cards
            WHERE content_version < 1 OR progress_version < 1
               OR progress NOT BETWEEN 0 AND 5) AS invalidCards,
         (SELECT count(*) FROM (${ownerIds('UNION ALL')}) o
          WHERE o.owner_id IN (SELECT owner_id FROM deleted_identities))
           AS deletedIdentityRows`,
    )
    .first<Schemas['RecoveryCounts']>()
  if (!row) throw new Error('The inspection returned nothing.')
  return row
}

/** Whether the counts show nothing a healthy database never has. */
const consistent = (counts: Schemas['RecoveryCounts']) =>
  counts.cardsWithoutCategory === 0 &&
  counts.invalidCards === 0 &&
  counts.deletedIdentityRows === 0

/**
 * The operator's recovery endpoints, `/api/recovery/*`: only while a
 * recovery is under way (`RECOVERY_EPOCH`) and an operator token is
 * configured (`RECOVERY_ADMIN_TOKEN`); otherwise they don't exist (`404`).
 * Authenticated by that token as a bearer token, never a Clerk session.
 */
export function recoveryRoutes({ now, log }: { now: () => number; log: Log }) {
  const routes = new Hono<AppEnv>()

  routes.use('*', async (c, next) => {
    const epoch = c.env.RECOVERY_EPOCH?.trim()
    const token = c.env.RECOVERY_ADMIN_TOKEN
    if (!epoch || !token)
      return apiError(c, 404, 'not_found', 'There is nothing here.')
    const sent = /^Bearer ([^\s]+)$/.exec(c.req.header('Authorization') ?? '')
    if (!sent?.[1] || !(await sameSecret(sent[1], token)))
      return apiError(c, 401, 'unauthorized', 'Sign in to continue.')
    await next()
  })

  /** Where the recovery stands, and what D1 holds. */
  const status = async (c: Context<AppEnv>) => {
    const epoch = c.env.RECOVERY_EPOCH!.trim()
    const db = database(c.env.DB)
    const [row] = await db
      .select()
      .from(recoveries)
      .where(eq(recoveries.epoch, epoch))
    const counts = await inspect(c.env.DB)
    return {
      epoch,
      reconciledAt: row?.reconciledAt ?? null,
      purged: row?.purged ?? null,
      reopenedAt: row?.reopenedAt ?? null,
      consistent: consistent(counts),
      counts,
    } satisfies Schemas['RecoveryStatus']
  }

  routes.get('/', async (c) =>
    c.json<Schemas['RecoveryStatus']>(await status(c)),
  )

  /*
   * Reconciles deleted identities against Clerk: every owner with anything
   * in D1 that Clerk no longer has is purged and tombstoned, as the
   * `user.deleted` webhook would have. Without `purge: true` it only
   * counts them. With it, `expectedDeleted` must equal the count, so a
   * secret key for the wrong Clerk instance (which would find everyone
   * deleted) purges nothing. The purges and the epoch's reconciliation are
   * one D1 batch.
   */
  routes.post('/reconcile', async (c) => {
    const epoch = c.env.RECOVERY_EPOCH!.trim()
    const secretKey = c.env.CLERK_SECRET_KEY
    if (!secretKey) {
      log('error', {
        event: 'recovery_misconfigured',
        requestId: c.get('requestId'),
      })
      return apiError(c, 500, 'server_error', 'The server failed.')
    }
    const body = (await c.req.json().catch(() => undefined)) as
      Schemas['ReconcileRequest'] | undefined
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof body.purge !== 'boolean' ||
      (body.purge && !Number.isSafeInteger(body.expectedDeleted))
    )
      return apiError(
        c,
        400,
        'validation_failed',
        'The reconciliation request is invalid.',
        { purge: 'Send purge (true or false); with true, expectedDeleted.' },
      )

    const db = database(c.env.DB)
    const [existing] = await db
      .select({ reopenedAt: recoveries.reopenedAt })
      .from(recoveries)
      .where(eq(recoveries.epoch, epoch))
    if (existing?.reopenedAt != null)
      return apiError(
        c,
        409,
        'recovery_state',
        'This recovery was already reopened. Start another with a new epoch.',
      )

    const found = await owners(c.env.DB)
    let deleted: Set<string>
    try {
      deleted = await deletedInClerk(
        found.filter((owner) => !owner.tombstoned).map((o) => o.ownerId),
        { apiUrl: c.env.CLERK_API_URL ?? CLERK_API_URL, secretKey },
      )
    } catch (error) {
      if (!(error instanceof ClerkUnavailable)) throw error
      log('error', {
        event: 'recovery_clerk_unavailable',
        requestId: c.get('requestId'),
      })
      return apiError(
        c,
        502,
        'upstream_unavailable',
        'Clerk did not say which identities exist. Nothing was purged.',
      )
    }
    // Owners already tombstoned yet still holding rows are purged too.
    for (const owner of found) if (owner.tombstoned) deleted.add(owner.ownerId)

    const result = {
      epoch,
      ownersChecked: found.length,
      deleted: deleted.size,
      purged: false,
    }
    if (!body.purge) return c.json<Schemas['Reconciliation']>(result)
    if (body.expectedDeleted !== deleted.size)
      return apiError(
        c,
        409,
        'recovery_state',
        `Clerk reports ${deleted.size} deleted identities, not ${body.expectedDeleted}. Nothing was purged.`,
      )

    const at = now()
    await db.batch([
      db
        .insert(recoveries)
        .values({ epoch, reconciledAt: at, purged: deleted.size })
        .onConflictDoUpdate({
          target: recoveries.epoch,
          set: { reconciledAt: at, purged: deleted.size },
        }),
      ...[...deleted].flatMap((ownerId) => purgeStatements(db, ownerId, at)),
    ])
    // Counts only: never the identities.
    log('info', {
      event: 'recovery_reconciled',
      requestId: c.get('requestId'),
      ownersChecked: found.length,
      purged: deleted.size,
    })
    return c.json<Schemas['Reconciliation']>({ ...result, purged: true })
  })

  /*
   * Reopens the API, only once this epoch has been reconciled in the
   * database as it is now, and the database shows nothing a healthy one
   * never has.
   */
  routes.post('/reopen', async (c) => {
    const current = await status(c)
    if (current.reopenedAt !== null) return c.json(current)
    if (current.reconciledAt === null)
      return apiError(
        c,
        409,
        'recovery_state',
        'Reconcile deleted identities for this epoch before reopening.',
      )
    if (!current.consistent)
      return apiError(
        c,
        409,
        'recovery_state',
        'The database holds inconsistent rows. Inspect it before reopening.',
      )
    const db = database(c.env.DB)
    await db
      .update(recoveries)
      .set({ reopenedAt: now() })
      .where(
        and(eq(recoveries.epoch, current.epoch), isNull(recoveries.reopenedAt)),
      )
    // A restore between the checks and the update leaves nothing reopened.
    const after = await status(c)
    if (after.reopenedAt === null)
      return apiError(
        c,
        409,
        'recovery_state',
        'The recovery changed while reopening. Check its status and try again.',
      )
    log('info', { event: 'recovery_reopened', requestId: c.get('requestId') })
    return c.json<Schemas['RecoveryStatus']>(after)
  })

  return routes
}
