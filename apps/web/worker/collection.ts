import { and, count, desc, eq, gt, lte, sql, type SQL } from 'drizzle-orm'
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'

import type { components } from '../src/api/schema.js'
import {
  CARD_QUOTA,
  categoryKey,
  type CardText,
} from '../src/domain/card-text.js'
import { IDEMPOTENCY_TTL_MS } from '../src/domain/idempotency.js'
import type { CardListQuery } from '../src/domain/requests.js'
import { seededShuffle } from '../src/domain/shuffle.js'
import * as schema from './db/schema.js'
import { cards, categories, idempotencyRecords } from './db/schema.js'

type Schemas = components['schemas']
type Card = Schemas['Card']

export type Database = DrizzleD1Database<typeof schema>

export const database = (d1: D1Database): Database => drizzle(d1, { schema })

const MASTERED = 5

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
  categoryId: sql<string>`${categories.id}`.as('category_id'),
  categoryName: sql<string>`${categories.name}`.as('category_name'),
}

const toCard = (row: {
  id: string
  question: string
  answer: string
  progress: number
  categoryId: string
  categoryName: string
}): Card => ({
  id: row.id,
  question: row.question,
  answer: row.answer,
  category: { id: row.categoryId, name: row.categoryName },
  progress: row.progress,
})

/** What creating a Card came to. */
export type Creation =
  | { kind: 'created'; card: Card }
  | { kind: 'replayed'; card: Card }
  | { kind: 'key_reused' }
  | { kind: 'quota_exceeded' }

const CREATE_CARD = 'createCard'

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
    db
      .select(cardColumns)
      .from(cards)
      .innerJoin(
        categories,
        and(
          eq(categories.id, cards.categoryId),
          eq(categories.ownerId, cards.ownerId),
        ),
      )

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
    const record = await findRecord(CREATE_CARD, key, now)
    if (!record) return undefined
    return record.requestHash === requestHash
      ? { kind: 'replayed', card: JSON.parse(record.response) as Card }
      : { kind: 'key_reused' }
  }

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
        .innerJoin(
          cards,
          and(
            eq(cards.categoryId, categories.id),
            eq(cards.ownerId, categories.ownerId),
          ),
        )
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
          // Expired records are forgotten, so their keys create anew.
          db
            .delete(idempotencyRecords)
            .where(
              and(
                eq(idempotencyRecords.ownerId, ownerId),
                lte(idempotencyRecords.expiresAt, now),
              ),
            ),
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
                operation: sql<string>`${CREATE_CARD}`.as('operation'),
                key: sql<string>`${key}`.as('key'),
                requestHash: sql<string>`${requestHash}`.as('requestHash'),
                response: sql<string>`json_object(
                  'id', ${cards.id},
                  'question', ${cards.question},
                  'answer', ${cards.answer},
                  'category', json_object('id', ${categories.id}, 'name', ${categories.name}),
                  'progress', ${cards.progress}
                )`.as('response'),
                createdAt: sql<number>`${now}`.as('createdAt'),
                expiresAt: sql<number>`${now + IDEMPOTENCY_TTL_MS}`.as(
                  'expiresAt',
                ),
              })
              .from(cards)
              .innerJoin(
                categories,
                and(
                  eq(categories.id, cards.categoryId),
                  eq(categories.ownerId, cards.ownerId),
                ),
              )
              .where(and(eq(cards.ownerId, ownerId), eq(cards.id, cardId))),
          ),
          db
            .select({ response: idempotencyRecords.response })
            .from(idempotencyRecords)
            .where(
              and(
                eq(idempotencyRecords.ownerId, ownerId),
                eq(idempotencyRecords.operation, CREATE_CARD),
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
  }
}

/** Deletes every expired idempotency record: the daily cleanup. */
export const forgetExpiredRecords = (db: Database, now: number) =>
  db.delete(idempotencyRecords).where(lte(idempotencyRecords.expiresAt, now))
