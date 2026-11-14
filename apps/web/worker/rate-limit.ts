import { and, eq, gt, lte, min, sql } from 'drizzle-orm'

import { WRITE_LIMIT, WRITE_WINDOW_MS } from '../src/domain/rate-limit.js'
import type { Database } from './collection.js'
import { writeRequests } from './db/schema.js'

/** Whether a write request may go ahead, or how long to wait. */
export type Admission = { ok: true } | { ok: false; retryAfterSeconds: number }

/**
 * Admits a write request by `ownerId` at `now` if fewer than `WRITE_LIMIT`
 * were admitted in the `WRITE_WINDOW_MS` before it: a sliding window.
 *
 * The count lives in D1, not in a Worker instance's memory, so it is the
 * same count however many instances serve the account. One batch, so one
 * transaction, and D1 runs one write at a time: forgetting the owner's
 * entries that left the window, the conditional insert (which counts and
 * inserts in one statement), and reading the result can't interleave with
 * another request's, so racing requests never admit more than the limit.
 */
export async function admitWrite(
  db: Database,
  ownerId: string,
  now: number,
): Promise<Admission> {
  const windowStart = now - WRITE_WINDOW_MS
  const own = eq(writeRequests.ownerId, ownerId)
  const [, admitted, [oldest]] = await db.batch([
    db
      .delete(writeRequests)
      .where(and(own, lte(writeRequests.at, windowStart))),
    db
      .insert(writeRequests)
      .select(
        db
          .select({
            id: sql<null>`null`.as('id'),
            ownerId: sql<string>`${ownerId}`.as('owner_id'),
            at: sql<number>`${now}`.as('at'),
          })
          .from(sql`(select 1)`)
          .where(
            sql`(select count(*) from ${writeRequests} where ${and(own, gt(writeRequests.at, windowStart))}) < ${WRITE_LIMIT}`,
          ),
      )
      .returning({ id: writeRequests.id }),
    db
      .select({ oldest: min(writeRequests.at) })
      .from(writeRequests)
      .where(and(own, gt(writeRequests.at, windowStart))),
  ])
  if (admitted.length > 0) return { ok: true }
  // The window frees a place when its oldest entry leaves it.
  const freedAt = (oldest?.oldest ?? now) + WRITE_WINDOW_MS
  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((freedAt - now) / 1000)),
  }
}

/** Forgets every entry that has left the window: the daily cleanup. */
export const forgetOldWrites = (db: Database, now: number) =>
  db.delete(writeRequests).where(lte(writeRequests.at, now - WRITE_WINDOW_MS))
