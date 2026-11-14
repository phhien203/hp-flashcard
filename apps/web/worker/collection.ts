import {
  and,
  count,
  desc,
  eq,
  gt,
  lte,
  notExists,
  sql,
  type SQL,
} from 'drizzle-orm'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

import type { components } from '../src/api/schema.js'
import {
  CARD_QUOTA,
  categoryKey,
  type CardText,
} from '../src/domain/card-text.js'
import { IDEMPOTENCY_TTL_MS, OPERATIONS } from '../src/domain/idempotency.js'
import { MASTERED } from '../src/domain/progress.js'
import type { CardListQuery } from '../src/domain/requests.js'
import { seededShuffle } from '../src/domain/shuffle.js'
import * as schema from './db/schema.js'
import { cards, categories, idempotencyRecords } from './db/schema.js'

type Schemas = components['schemas']
type Card = Schemas['Card']

export type Database = DrizzleD1Database<typeof schema>

export const database = (d1: D1Database): Database => drizzle(d1, { schema })

/** Joins a Card to its Category, which always has the same owner. */
const cardInCategory = and(
  eq(categories.id, cards.categoryId),
  eq(categories.ownerId, cards.ownerId),
)

/**
 * The columns that make up a Card in API responses. The Category's are
 * aliased: D1 returns batched rows as objects, where the two tables' `id`
 * columns would collide.
 */
const cardColumns = {
  id: cards.id,
  question: cards.question,
  answer: cards.answer,
  progress: cards.progress,
  contentVersion: cards.contentVersion,
  progressVersion: cards.progressVersion,
  categoryId: sql<string>`${categories.id}`.as('category_id'),
  categoryName: sql<string>`${categories.name}`.as('category_name'),
}

const toCard = (row: {
  id: string
  question: string
  answer: string
  progress: number
  contentVersion: number
  progressVersion: number
  categoryId: string
  categoryName: string
}): Card => ({
  id: row.id,
  question: row.question,
  answer: row.answer,
  category: { id: row.categoryId, name: row.categoryName },
  progress: row.progress,
  contentVersion: row.contentVersion,
  progressVersion: row.progressVersion,
})

/**
 * A Card as JSON, built by the database from the joined Card and Category
 * rows: the response an idempotency record keeps, exactly as committed.
 */
const cardJson = sql<string>`json_object(
  'id', ${cards.id},
  'question', ${cards.question},
  'answer', ${cards.answer},
  'category', json_object('id', ${categories.id}, 'name', ${categories.name}),
  'progress', ${cards.progress},
  'contentVersion', ${cards.contentVersion},
  'progressVersion', ${cards.progressVersion}
)`

/** What creating a Card came to. */
export type Creation =
  | { kind: 'created'; card: Card }
  | { kind: 'replayed'; card: Card }
  | { kind: 'key_reused' }
  | { kind: 'quota_exceeded' }

/** What editing a Card came to. */
export type Edit =
  | { kind: 'updated'; card: Card }
  | { kind: 'replayed'; card: Card }
  | { kind: 'key_reused' }
  | { kind: 'not_found' }
  | { kind: 'conflict' }

/** What deleting a Card came to. */
export type Deletion =
  | { kind: 'deleted' }
  | { kind: 'replayed' }
  | { kind: 'key_reused' }
  | { kind: 'not_found' }
  | { kind: 'conflict' }

/** What saving a Card's Progress came to. */
export type ProgressSave = Edit

/** The version-checked writes to an existing Card. */
export interface VersionedWrite {
  cardId: string
  /** The `contentVersion` the request was based on. */
  contentVersion: number
  key: string
  requestHash: string
  now: number
}

/** A Progress save: version-checked against the `progressVersion`. */
export interface ProgressWrite extends Omit<VersionedWrite, 'contentVersion'> {
  /** The `progressVersion` the request was based on. */
  progressVersion: number
}

/**
 * One owner's Collection. Every query is scoped to `ownerId`, which comes
 * from the verified session, so no request can reach another Collection.
 */
export function collection(db: Database, ownerId: string) {
  const ownCards = eq(cards.ownerId, ownerId)
  /** The owner's Cards in any of `categoryIds` (any Category when none). */
  const inCategories = (categoryIds: readonly string[]): SQL | undefined =>
    categoryIds.length > 0
      ? // One JSON parameter, however many identifiers: D1 caps bound
        // parameters per query.
        sql`${cards.categoryId} in (select value from json_each(${JSON.stringify(categoryIds)}))`
      : undefined
  const fromCards = () =>
    db.select(cardColumns).from(cards).innerJoin(categories, cardInCategory)

  /** The live record of an earlier request with this key, if any. */
  const findRecord = async (operation: string, key: string, now: number) =>
    (
      await db
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.ownerId, ownerId),
            eq(idempotencyRecords.operation, operation),
            eq(idempotencyRecords.key, key),
            gt(idempotencyRecords.expiresAt, now),
          ),
        )
    )[0]

  /** An earlier creation with this key: repeated, or refused. */
  const earlierCreation = async (
    key: string,
    requestHash: string,
    now: number,
  ): Promise<Creation | undefined> => {
    const record = await findRecord(OPERATIONS.create, key, now)
    if (!record) return undefined
    return record.requestHash === requestHash
      ? { kind: 'replayed', card: JSON.parse(record.response) as Card }
      : { kind: 'key_reused' }
  }

  /** An earlier edit or Progress save with this key: repeated, or refused. */
  const earlierEdit = async (
    { key, requestHash, now }: Omit<VersionedWrite, 'contentVersion'>,
    operation: string = OPERATIONS.update,
  ): Promise<Edit | undefined> => {
    const record = await findRecord(operation, key, now)
    if (!record) return undefined
    return record.requestHash === requestHash
      ? { kind: 'replayed', card: JSON.parse(record.response) as Card }
      : { kind: 'key_reused' }
  }

  /** An earlier deletion with this key: repeated, or refused. */
  const earlierDeletion = async ({
    key,
    requestHash,
    now,
  }: VersionedWrite): Promise<Deletion | undefined> => {
    const record = await findRecord(OPERATIONS.delete, key, now)
    if (!record) return undefined
    return record.requestHash === requestHash
      ? { kind: 'replayed' }
      : { kind: 'key_reused' }
  }

  /** Why a version-checked write found nothing to change. */
  const refusal = async (cardId: string) => {
    const [found] = await db
      .select({ id: cards.id })
      .from(cards)
      .where(and(ownCards, eq(cards.id, cardId)))
    return found ? ('conflict' as const) : ('not_found' as const)
  }

  /** The owner's Card `cardId`, if it is still at `contentVersion`. */
  const cardAtVersion = (cardId: string, contentVersion: number) =>
    and(
      ownCards,
      eq(cards.id, cardId),
      eq(cards.contentVersion, contentVersion),
    )

  /** The owner's Card `cardId`, if its Progress is still at `progressVersion`. */
  const cardAtProgressVersion = (cardId: string, progressVersion: number) =>
    and(
      ownCards,
      eq(cards.id, cardId),
      eq(cards.progressVersion, progressVersion),
    )

  /** Forgets the owner's expired records, so their keys write anew. */
  const forgetExpired = (now: number) =>
    db
      .delete(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.ownerId, ownerId),
          lte(idempotencyRecords.expiresAt, now),
        ),
      )

  /**
   * Records a write under its key, as part of the write's batch, but only
   * if the Card is still at the version the request was based on: the
   * record's existence is what the batch's other statements and the outcome
   * hinge on. The response is filled in once the write has happened.
   */
  const recordIfCurrent = (
    operation: string,
    { key, requestHash, now }: Omit<VersionedWrite, 'contentVersion'>,
    current: SQL | undefined,
  ) =>
    db
      .insert(idempotencyRecords)
      .select(
        db
          .select({
            ownerId: cards.ownerId,
            operation: sql<string>`${operation}`.as('operation'),
            key: sql<string>`${key}`.as('key'),
            requestHash: sql<string>`${requestHash}`.as('requestHash'),
            response: sql<string>`''`.as('response'),
            createdAt: sql<number>`${now}`.as('createdAt'),
            expiresAt: sql<number>`${now + IDEMPOTENCY_TTL_MS}`.as('expiresAt'),
          })
          .from(cards)
          .where(current),
      )
      // Whether this request's batch made the record, or found another's.
      .returning({ key: idempotencyRecords.key })

  const thisRecord = (operation: string, key: string) =>
    and(
      eq(idempotencyRecords.ownerId, ownerId),
      eq(idempotencyRecords.operation, operation),
      eq(idempotencyRecords.key, key),
    )

  /** Deletes the owner's Categories that no longer have Cards. */
  const dropEmptyCategories = () =>
    db.delete(categories).where(
      and(
        eq(categories.ownerId, ownerId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(cards)
            .where(
              and(
                eq(cards.ownerId, categories.ownerId),
                eq(cards.categoryId, categories.id),
              ),
            ),
        ),
      ),
    )

  return {
    /** A page of matching Cards: filtered, shuffled by `seed`, then paged. */
    async listCards({
      categoryIds,
      hideMastered,
      offset,
      limit,
      seed,
    }: CardListQuery): Promise<Schemas['CardPage']> {
      const where = and(
        ownCards,
        inCategories(categoryIds),
        hideMastered ? sql`${cards.progress} < ${MASTERED}` : undefined,
      )
      let total: number
      let rows: Parameters<typeof toCard>[0][]
      if (seed === undefined) {
        // One batch: one consistent snapshot for the count and the page.
        const [counted, page] = await db.batch([
          db.select({ total: count() }).from(cards).where(where),
          fromCards()
            .where(where)
            .orderBy(desc(cards.seq))
            .limit(limit)
            .offset(offset),
        ])
        total = counted[0]?.total ?? 0
        rows = page
      } else {
        // A Card's shuffled place depends only on the seed and its id.
        const ids = await db.select({ id: cards.id }).from(cards).where(where)
        total = ids.length
        const pageIds = seededShuffle(ids, seed, (row) => row.id)
          .slice(offset, offset + limit)
          .map((row) => row.id)
        const found =
          pageIds.length === 0
            ? []
            : await fromCards().where(
                and(
                  ownCards,
                  sql`${cards.id} in (select value from json_each(${JSON.stringify(pageIds)}))`,
                ),
              )
        rows = pageIds.flatMap((id) => found.filter((row) => row.id === id))
      }
      const end = offset + rows.length
      return {
        items: rows.map(toCard),
        total,
        offset,
        limit,
        nextOffset: end < total ? end : null,
      }
    },

    async getCard(cardId: string): Promise<Card | undefined> {
      const [row] = await fromCards().where(and(ownCards, eq(cards.id, cardId)))
      return row && toCard(row)
    },

    /** Counts the Cards in the Categories (every Category when none). */
    async statistics(
      categoryIds: readonly string[],
    ): Promise<Schemas['CardStatistics']> {
      const [row] = await db
        .select({
          total: count(),
          notStarted: sql<number>`coalesce(sum(${cards.progress} = 0), 0)`,
          inProgress: sql<number>`coalesce(sum(${cards.progress} between 1 and ${MASTERED - 1}), 0)`,
          mastered: sql<number>`coalesce(sum(${cards.progress} >= ${MASTERED}), 0)`,
        })
        .from(cards)
        .where(and(ownCards, inCategories(categoryIds)))
      return {
        total: row?.total ?? 0,
        notStarted: Number(row?.notStarted ?? 0),
        inProgress: Number(row?.inProgress ?? 0),
        mastered: Number(row?.mastered ?? 0),
      }
    },

    /** Every Category that has Cards, by name, with its Card count. */
    async listCategories(): Promise<Schemas['Category'][]> {
      const rows = await db
        .select({ id: categories.id, name: categories.name, count: count() })
        .from(categories)
        .innerJoin(cards, cardInCategory)
        .where(eq(categories.ownerId, ownerId))
        .groupBy(categories.id)
      return rows.sort((a, b) => a.name.localeCompare(b.name))
    },

    /**
     * Creates a Card from trimmed, valid `fields`, at most once per
     * idempotency `key`.
     *
     * Everything a creation writes happens in one D1 batch, which D1 runs
     * as a single transaction (D1 has no interactive transactions): the
     * Category (matched or created), the Card, and the idempotency record
     * holding the response. If any statement fails, none takes effect.
     * The database refuses what must never happen, however requests race:
     * a second Category for an equivalent name (a unique index), a Card
     * past the quota (a trigger), a second record for a key (the primary
     * key). A failed batch is then explained by reading the outcome: an
     * earlier creation with the key, or a full Collection.
     */
    async createCard(
      fields: CardText,
      key: string,
      requestHash: string,
      now: number,
    ): Promise<Creation> {
      const earlier = await earlierCreation(key, requestHash, now)
      if (earlier) return earlier

      const cardId = crypto.randomUUID()
      const nameKey = categoryKey(fields.category)
      try {
        const [, , , , recorded] = await db.batch([
          forgetExpired(now),
          db
            .insert(categories)
            .values({
              id: crypto.randomUUID(),
              ownerId,
              name: fields.category,
              nameKey,
              createdAt: now,
            })
            .onConflictDoNothing({
              target: [categories.ownerId, categories.nameKey],
            }),
          db.insert(cards).select(
            db
              .select({
                seq: sql<number>`null`.as('seq'),
                id: sql<string>`${cardId}`.as('id'),
                ownerId: categories.ownerId,
                categoryId: categories.id,
                question: sql<string>`${fields.question}`.as('question'),
                answer: sql<string>`${fields.answer}`.as('answer'),
                progress: sql<number>`0`.as('progress'),
                contentVersion: sql<number>`1`.as('contentVersion'),
                progressVersion: sql<number>`1`.as('progressVersion'),
                createdAt: sql<number>`${now}`.as('createdAt'),
              })
              .from(categories)
              .where(
                and(
                  eq(categories.ownerId, ownerId),
                  eq(categories.nameKey, nameKey),
                ),
              ),
          ),
          // The response, as the database now holds the Card, to repeat.
          db.insert(idempotencyRecords).select(
            db
              .select({
                ownerId: cards.ownerId,
                operation: sql<string>`${OPERATIONS.create}`.as('operation'),
                key: sql<string>`${key}`.as('key'),
                requestHash: sql<string>`${requestHash}`.as('requestHash'),
                response: sql<string>`${cardJson}`.as('response'),
                createdAt: sql<number>`${now}`.as('createdAt'),
                expiresAt: sql<number>`${now + IDEMPOTENCY_TTL_MS}`.as(
                  'expiresAt',
                ),
              })
              .from(cards)
              .innerJoin(categories, cardInCategory)
              .where(and(eq(cards.ownerId, ownerId), eq(cards.id, cardId))),
          ),
          db
            .select({ response: idempotencyRecords.response })
            .from(idempotencyRecords)
            .where(
              and(
                eq(idempotencyRecords.ownerId, ownerId),
                eq(idempotencyRecords.operation, OPERATIONS.create),
                eq(idempotencyRecords.key, key),
              ),
            ),
        ])
        const response = recorded[0]?.response
        if (!response) throw new Error('The creation recorded no response.')
        return { kind: 'created', card: JSON.parse(response) as Card }
      } catch (error) {
        const raced = await earlierCreation(key, requestHash, now)
        if (raced) return raced
        const [owned] = await db
          .select({ total: count() })
          .from(cards)
          .where(ownCards)
        if ((owned?.total ?? 0) >= CARD_QUOTA) return { kind: 'quota_exceeded' }
        throw error
      }
    },

    /**
     * Edits a Card with trimmed, valid `fields`, if it is still at the
     * request's `contentVersion`, at most once per idempotency key.
     *
     * One D1 batch, so one transaction: the record of the key, inserted only
     * while the Card is at the expected version; the Category (matched or
     * created); the Card, updated under the same version condition and
     * advanced to the next version; the response, as the database now holds
     * the Card; and the removal of Categories left without Cards. Of two
     * edits based on the same version, the second finds the Card moved on
     * and changes nothing. Nothing written means the Card is gone or has
     * changed, which a read then tells apart.
     */
    async updateCard(
      fields: Partial<CardText>,
      write: VersionedWrite,
    ): Promise<Edit> {
      const earlier = await earlierEdit(write)
      if (earlier) return earlier

      const { cardId, contentVersion, key, requestHash, now } = write
      const operation = OPERATIONS.update
      const nameKey =
        fields.category === undefined ? undefined : categoryKey(fields.category)
      try {
        const [, inserted, , , , , recorded] = await db.batch([
          forgetExpired(now),
          recordIfCurrent(
            operation,
            write,
            cardAtVersion(cardId, contentVersion),
          ),
          // Matching an equivalent Category, or creating it. If the Card
          // turns out to have moved on, the cleanup below removes it again.
          nameKey === undefined
            ? db
                .select({ one: sql`1` })
                .from(categories)
                .limit(0)
            : db
                .insert(categories)
                .values({
                  id: crypto.randomUUID(),
                  ownerId,
                  name: fields.category!,
                  nameKey,
                  createdAt: now,
                })
                .onConflictDoNothing({
                  target: [categories.ownerId, categories.nameKey],
                }),
          db
            .update(cards)
            .set({
              question: fields.question,
              answer: fields.answer,
              categoryId:
                nameKey === undefined
                  ? undefined
                  : sql`(select ${categories.id} from ${categories} where ${and(
                      eq(categories.ownerId, ownerId),
                      eq(categories.nameKey, nameKey),
                    )})`,
              contentVersion: sql`${cards.contentVersion} + 1`,
            })
            .where(cardAtVersion(cardId, contentVersion)),
          db
            .update(idempotencyRecords)
            .set({
              response: sql`(select ${cardJson} from ${cards} inner join ${categories} on ${cardInCategory} where ${and(
                ownCards,
                eq(cards.id, cardId),
              )})`,
            })
            .where(
              and(
                thisRecord(operation, key),
                eq(idempotencyRecords.response, ''),
              ),
            ),
          dropEmptyCategories(),
          db
            .select({
              requestHash: idempotencyRecords.requestHash,
              response: idempotencyRecords.response,
            })
            .from(idempotencyRecords)
            .where(thisRecord(operation, key)),
        ])
        const [record] = recorded
        if (!record) return { kind: await refusal(cardId) }
        // A request with the same key committed first.
        if (record.requestHash !== requestHash) return { kind: 'key_reused' }
        const card = JSON.parse(record.response) as Card
        // A retry that raced the original: it applied nothing itself.
        if (inserted.length === 0) return { kind: 'replayed', card }
        return { kind: 'updated', card }
      } catch (error) {
        const raced = await earlierEdit(write)
        if (raced) return raced
        throw error
      }
    },

    /**
     * Sets a Card's Progress to `progress` (absolute: one more for "I Know
     * This", 0 to reset), if its Progress is still at the request's
     * `progressVersion`, at most once per idempotency key.
     *
     * One D1 batch, like an edit, but conditioned on and advancing the
     * `progressVersion` only: a content edit doesn't make a Progress save
     * stale, nor a Progress save an edit or deletion. An UPDATE, never an
     * insert: a save for a deleted Card changes nothing and answers 404.
     */
    async setProgress(
      progress: number,
      write: ProgressWrite,
    ): Promise<ProgressSave> {
      const operation = OPERATIONS.progress
      const earlier = await earlierEdit(write, operation)
      if (earlier) return earlier

      const { cardId, progressVersion, key, requestHash, now } = write
      const current = cardAtProgressVersion(cardId, progressVersion)
      try {
        const [, inserted, , , recorded] = await db.batch([
          forgetExpired(now),
          recordIfCurrent(operation, write, current),
          db
            .update(cards)
            .set({
              progress,
              progressVersion: sql`${cards.progressVersion} + 1`,
            })
            .where(current),
          db
            .update(idempotencyRecords)
            .set({
              response: sql`(select ${cardJson} from ${cards} inner join ${categories} on ${cardInCategory} where ${and(
                ownCards,
                eq(cards.id, cardId),
              )})`,
            })
            .where(
              and(
                thisRecord(operation, key),
                eq(idempotencyRecords.response, ''),
              ),
            ),
          db
            .select({
              requestHash: idempotencyRecords.requestHash,
              response: idempotencyRecords.response,
            })
            .from(idempotencyRecords)
            .where(thisRecord(operation, key)),
        ])
        const [record] = recorded
        if (!record) return { kind: await refusal(cardId) }
        if (record.requestHash !== requestHash) return { kind: 'key_reused' }
        const card = JSON.parse(record.response) as Card
        if (inserted.length === 0) return { kind: 'replayed', card }
        return { kind: 'updated', card }
      } catch (error) {
        const raced = await earlierEdit(write, operation)
        if (raced) return raced
        throw error
      }
    },

    /**
     * Permanently deletes a Card and its Progress, if it is still at the
     * request's `contentVersion`, at most once per idempotency key.
     *
     * One D1 batch, as for edits: the record of the key, inserted only while
     * the Card is at the expected version; the Card, deleted under the same
     * condition, which frees its place in the quota in the same transaction;
     * and the removal of a Category left without Cards.
     */
    async deleteCard(write: VersionedWrite): Promise<Deletion> {
      const earlier = await earlierDeletion(write)
      if (earlier) return earlier

      const { cardId, contentVersion, key, requestHash, now } = write
      const operation = OPERATIONS.delete
      try {
        const [, inserted, , , recorded] = await db.batch([
          forgetExpired(now),
          recordIfCurrent(
            operation,
            write,
            cardAtVersion(cardId, contentVersion),
          ),
          db.delete(cards).where(cardAtVersion(cardId, contentVersion)),
          dropEmptyCategories(),
          db
            .select({ requestHash: idempotencyRecords.requestHash })
            .from(idempotencyRecords)
            .where(thisRecord(operation, key)),
        ])
        const [record] = recorded
        if (!record) return { kind: await refusal(cardId) }
        if (record.requestHash !== requestHash) return { kind: 'key_reused' }
        if (inserted.length === 0) return { kind: 'replayed' }
        return { kind: 'deleted' }
      } catch (error) {
        const raced = await earlierDeletion(write)
        if (raced) return raced
        throw error
      }
    },
  }
}

/** Deletes every expired idempotency record: the daily cleanup. */
export const forgetExpiredRecords = (db: Database, now: number) =>
  db.delete(idempotencyRecords).where(lte(idempotencyRecords.expiresAt, now))
