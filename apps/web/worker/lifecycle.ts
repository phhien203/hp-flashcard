import { eq, lt } from 'drizzle-orm'

import type { Database } from './collection.js'
import {
  cards,
  categories,
  deletedIdentities,
  idempotencyRecords,
  webhookDeliveries,
  writeRequests,
} from './db/schema.js'

/** How long a processed webhook delivery's id is remembered. */
export const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/** What processing an identity deletion came to. */
export type Purge = 'purged' | 'duplicate'

/**
 * Identity lifecycle (ADR 0002): an administrator deletes a person in
 * Clerk, Clerk delivers a signed `user.deleted` event, and the Collection
 * is purged for good.
 */
export function lifecycle(db: Database) {
  return {
    /** Whether `ownerId` names a deleted identity. */
    async isDeleted(ownerId: string) {
      const [row] = await db
        .select({ ownerId: deletedIdentities.ownerId })
        .from(deletedIdentities)
        .where(eq(deletedIdentities.ownerId, ownerId))
      return row !== undefined
    },

    /**
     * Records `ownerId` as deleted and deletes everything it owns: Cards
     * (and so their Progress), Categories, idempotency records, whatever
     * their expiry, and rate-limit entries. One D1 batch, so one
     * transaction, together with the delivery's id: either the event is
     * processed and remembered, or nothing happened and Clerk retries.
     *
     * The tombstone is what makes the purge final: triggers refuse every
     * later insert for the owner, so a request authenticated before the
     * purge that writes after it rolls back. A repeated delivery (same id)
     * changes nothing; a different delivery for the same identity purges
     * again, which finds nothing.
     */
    async purge({
      ownerId,
      deliveryId,
      type,
      now,
    }: {
      ownerId: string
      deliveryId: string
      type: string
      now: number
    }): Promise<Purge> {
      const [seen] = await db
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.id, deliveryId))
      if (seen) return 'duplicate'
      await db.batch([
        db
          .insert(webhookDeliveries)
          .values({ id: deliveryId, type, processedAt: now })
          .onConflictDoNothing(),
        db
          .insert(deletedIdentities)
          .values({ ownerId, deletedAt: now })
          .onConflictDoNothing(),
        db.delete(cards).where(eq(cards.ownerId, ownerId)),
        db.delete(categories).where(eq(categories.ownerId, ownerId)),
        db
          .delete(idempotencyRecords)
          .where(eq(idempotencyRecords.ownerId, ownerId)),
        db.delete(writeRequests).where(eq(writeRequests.ownerId, ownerId)),
      ])
      return 'purged'
    },

    /**
     * Records a delivery that needs no work (an event type the app doesn't
     * act on), so it is acknowledged once.
     */
    async acknowledge({
      deliveryId,
      type,
      now,
    }: {
      deliveryId: string
      type: string
      now: number
    }) {
      await db
        .insert(webhookDeliveries)
        .values({ id: deliveryId, type, processedAt: now })
        .onConflictDoNothing()
    },
  }
}

/** Forgets delivery ids older than the retention: the daily cleanup. */
export const forgetOldDeliveries = (db: Database, now: number) =>
  db
    .delete(webhookDeliveries)
    .where(lt(webhookDeliveries.processedAt, now - DELIVERY_RETENTION_MS))

/**
 * Whether a database failure was a deleted-identity guard (migrations/0003)
 * refusing a write: the request's identity was deleted while it ran.
 */
export function isIdentityDeleted(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes('identity_deleted')) return true
  }
  return false
}
