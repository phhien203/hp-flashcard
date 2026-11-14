import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/**
 * The durable Collections. Every row belongs to one owner: the Clerk user
 * id of a verified session token, never a value a request supplies.
 *
 * Text limits repeat src/domain/card-text.ts as checks: SQLite's `length()`
 * counts characters (code points) of text, as the app does.
 */

/** Categories exist through their Cards; names match by `name_key`. */
export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    /** The spelling of the first Card that used it. */
    name: text('name').notNull(),
    /** The trimmed, lower-cased name: equivalent names share it. */
    nameKey: text('name_key').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    // One Category per equivalent name per owner, even under races.
    uniqueIndex('categories_owner_name_key_unique').on(t.ownerId, t.nameKey),
    // The target of cards' (owner_id, category_id) foreign key.
    uniqueIndex('categories_owner_id_unique').on(t.ownerId, t.id),
    check('categories_name_length', sql`length(${t.name}) between 1 and 100`),
  ],
)

export const cards = sqliteTable(
  'cards',
  {
    /** Creation order: strictly increasing, never reused. */
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    id: text('id').notNull().unique(),
    ownerId: text('owner_id').notNull(),
    categoryId: text('category_id').notNull(),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    progress: integer('progress').notNull().default(0),
    /** Advanced by content edits (ADR 0003). */
    contentVersion: integer('content_version').notNull().default(1),
    /** Advanced by Progress updates (ADR 0003). */
    progressVersion: integer('progress_version').notNull().default(1),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    // A Card's Category must be its owner's.
    foreignKey({
      name: 'cards_owner_category_fk',
      columns: [t.ownerId, t.categoryId],
      foreignColumns: [categories.ownerId, categories.id],
    }),
    index('cards_owner_seq_idx').on(t.ownerId, t.seq),
    index('cards_owner_category_idx').on(t.ownerId, t.categoryId),
    check('cards_progress_range', sql`${t.progress} between 0 and 5`),
    check(
      'cards_question_length',
      sql`length(${t.question}) between 1 and 2000`,
    ),
    check('cards_answer_length', sql`length(${t.answer}) between 1 and 10000`),
  ],
)

/**
 * Completed writes by idempotency key, for 24 hours: the request's
 * fingerprint and the response to repeat.
 */
export const idempotencyRecords = sqliteTable(
  'idempotency_records',
  {
    ownerId: text('owner_id').notNull(),
    /** The operation the key was used for, e.g. `createCard`. */
    operation: text('operation').notNull(),
    key: text('key').notNull(),
    /** SHA-256 of the request's fingerprint. */
    requestHash: text('request_hash').notNull(),
    /** The JSON body of the completed response. */
    response: text('response').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.operation, t.key] }),
    index('idempotency_records_expires_at_idx').on(t.expiresAt),
  ],
)

/**
 * Identities an administrator deleted in Clerk (ADR 0002), kept for good:
 * Clerk never reuses a user id. Triggers (migrations/0003) refuse any row
 * for an owner listed here, so a request already in flight when the purge
 * commits can't bring a Collection back.
 */
export const deletedIdentities = sqliteTable('deleted_identities', {
  ownerId: text('owner_id').primaryKey(),
  deletedAt: integer('deleted_at').notNull(),
})

/**
 * Clerk webhook deliveries already processed, by their `svix-id`, so a
 * repeated delivery is acknowledged without being applied again.
 */
export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    /** The event type, e.g. `user.deleted`. */
    type: text('type').notNull(),
    processedAt: integer('processed_at').notNull(),
  },
  (t) => [index('webhook_deliveries_processed_at_idx').on(t.processedAt)],
)

/**
 * Each owner's accepted write requests of the last minute: the sliding
 * window the write rate limit counts (src/domain/rate-limit.ts). One table
 * in D1, which runs one write at a time, so every Worker instance counts
 * the same requests.
 */
export const writeRequests = sqliteTable(
  'write_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerId: text('owner_id').notNull(),
    at: integer('at').notNull(),
  },
  (t) => [index('write_requests_owner_at_idx').on(t.ownerId, t.at)],
)
