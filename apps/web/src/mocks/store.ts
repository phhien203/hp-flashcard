import type { Card, CardPage, CardStatistics, Category } from '../api/types.js'
import fixture from './fixtures/cards.json' with { type: 'json' }
import {
  CARD_QUOTA,
  categoryKey,
  checkCardText,
  type CardText,
  type CardTextErrors,
} from '../domain/card-text.js'
import { MASTERED } from '../domain/progress.js'
import type { CardListQuery } from '../domain/requests.js'
import { seededShuffle } from '../domain/shuffle.js'

/** A Card as the fixture describes it: its Category by name. */
export interface SeedCard {
  id: string
  question: string
  answer: string
  category: string
  progress: number
}

interface StoredCard {
  id: string
  question: string
  answer: string
  categoryId: string
  progress: number
  contentVersion: number
  progressVersion: number
}

export type WriteResult =
  | { ok: true; card: Card }
  | { ok: false; reason: 'invalid'; fieldErrors: CardTextErrors }
  | { ok: false; reason: 'not_found' }

/** A creation's outcome: as a write, or refused by the quota or a key. */
export type CreateResult =
  | (WriteResult & { replayed?: boolean })
  | { ok: false; reason: 'quota_exceeded' }
  | { ok: false; reason: 'key_reused' }

/** How an edit or deletion naming a version and a key went. */
export type VersionedOutcome<T> =
  | { ok: true; value: T; replayed: boolean }
  | { ok: false; reason: 'invalid'; fieldErrors: CardTextErrors }
  | { ok: false; reason: 'not_found' | 'conflict' | 'key_reused' }

/** What an edit or deletion names besides its fields. */
export interface VersionedRequest {
  contentVersion: number
  key: string
  fingerprint: string
}

/** What a Progress save names besides the Progress. */
export interface ProgressRequest {
  progressVersion: number
  key: string
  fingerprint: string
}

/**
 * The mock backend's in-memory data. It lives as long as the page: route
 * changes keep it, a browser refresh starts again from the fixture. Only
 * the mock handlers use it; app code goes through the HTTP API.
 */
export class MockStore {
  /** In the default order: most recently created first. */
  #cards: StoredCard[] = []
  #categories = new Map<string, { id: string; name: string }>()
  #nextCategoryId = 1
  #nextCardId = 1
  /** Completed creations by idempotency key. */
  #creations = new Map<string, { fingerprint: string; card: Card }>()
  /** Completed edits and deletions by idempotency key. */
  #edits = new Map<string, { fingerprint: string; card: Card }>()
  #deletions = new Map<string, { fingerprint: string }>()
  #progressSaves = new Map<string, { fingerprint: string; card: Card }>()

  constructor(seed: readonly SeedCard[] = fixture) {
    this.reset(seed)
  }

  /** Replaces every Card with `seed`, as on a fresh page load. */
  reset(seed: readonly SeedCard[] = fixture) {
    this.#cards = []
    this.#categories.clear()
    this.#nextCategoryId = 1
    this.#nextCardId = 1
    this.#creations.clear()
    this.#edits.clear()
    this.#deletions.clear()
    this.#progressSaves.clear()
    for (const card of seed) {
      this.#cards.push({
        id: card.id,
        question: card.question,
        answer: card.answer,
        categoryId: this.#categoryFor(card.category).id,
        progress: card.progress,
        contentVersion: 1,
        progressVersion: 1,
      })
    }
  }

  #categoryFor(name: string) {
    const key = categoryKey(name)
    let category = this.#categories.get(key)
    if (!category) {
      category = { id: `cat-${this.#nextCategoryId++}`, name: name.trim() }
      this.#categories.set(key, category)
    }
    return category
  }

  #toCard(card: StoredCard): Card {
    const category = [...this.#categories.values()].find(
      (c) => c.id === card.categoryId,
    )
    if (!category) throw new Error(`Card ${card.id} has no Category`)
    return {
      id: card.id,
      question: card.question,
      answer: card.answer,
      category: { id: category.id, name: category.name },
      progress: card.progress,
      contentVersion: card.contentVersion,
      progressVersion: card.progressVersion,
    }
  }

  /** A page of matching Cards: filtered, then shuffled by `seed`, then paged. */
  listCards({
    categoryIds,
    hideMastered,
    offset,
    limit,
    seed,
  }: CardListQuery): CardPage {
    let matching = this.#cards.filter(
      (card) =>
        (categoryIds.length === 0 || categoryIds.includes(card.categoryId)) &&
        !(hideMastered && card.progress >= MASTERED),
    )
    if (seed !== undefined)
      matching = seededShuffle(matching, seed, (card) => card.id)
    const items = matching.slice(offset, offset + limit)
    const end = offset + items.length
    return {
      items: items.map((card) => this.#toCard(card)),
      total: matching.length,
      offset,
      limit,
      nextOffset: end < matching.length ? end : null,
    }
  }

  /**
   * Counts the Cards in the given Categories (every Category when none) by
   * Progress. Mastery, pages and shuffling don't change the counts.
   */
  statistics(categoryIds: readonly string[]): CardStatistics {
    const counts: CardStatistics = {
      total: 0,
      notStarted: 0,
      inProgress: 0,
      mastered: 0,
    }
    for (const card of this.#cards) {
      if (categoryIds.length > 0 && !categoryIds.includes(card.categoryId))
        continue
      counts.total++
      if (card.progress === 0) counts.notStarted++
      else if (card.progress >= MASTERED) counts.mastered++
      else counts.inProgress++
    }
    return counts
  }

  getCard(id: string): Card | undefined {
    const card = this.#cards.find((c) => c.id === id)
    return card && this.#toCard(card)
  }

  /**
   * Creates a Card with Progress 0, first in the default order. Fields are
   * trimmed and must not be blank; the Category is matched by name ignoring
   * case and surrounding whitespace, or created.
   */
  createCard(fields: CardText): WriteResult {
    const checked = checkCardText(fields)
    if (!checked.ok)
      return { ok: false, reason: 'invalid', fieldErrors: checked.errors }
    const trimmed = checked.value
    const card: StoredCard = {
      id: this.#newCardId(),
      question: trimmed.question,
      answer: trimmed.answer,
      categoryId: this.#categoryFor(trimmed.category).id,
      progress: 0,
      contentVersion: 1,
      progressVersion: 1,
    }
    this.#cards.unshift(card)
    return { ok: true, card: this.#toCard(card) }
  }

  /**
   * Creates a Card as the API does: refused once the Collection holds
   * `CARD_QUOTA` Cards, and at most once per idempotency `key`. Repeating a
   * key with the same `fingerprint` answers the original Card again;
   * reusing it for a different request is refused.
   */
  createCardOnce(
    fields: CardText,
    key: string,
    fingerprint: string,
  ): CreateResult {
    const earlier = this.#creations.get(key)
    if (earlier) {
      return earlier.fingerprint === fingerprint
        ? { ok: true, card: earlier.card, replayed: true }
        : { ok: false, reason: 'key_reused' }
    }
    const checked = checkCardText(fields)
    if (!checked.ok)
      return { ok: false, reason: 'invalid', fieldErrors: checked.errors }
    if (this.#cards.length >= CARD_QUOTA)
      return { ok: false, reason: 'quota_exceeded' }
    const result = this.createCard(fields)
    if (result.ok) this.#creations.set(key, { fingerprint, card: result.card })
    return result
  }

  /**
   * Edits a Card as the API does: only if it is still at the request's
   * `contentVersion`, and at most once per idempotency `key`. Repeating a
   * key with the same `fingerprint` answers the Card as that edit left it,
   * even after later writes; reusing it for another request is refused.
   */
  updateCardOnce(
    id: string,
    fields: Partial<CardText>,
    { contentVersion, key, fingerprint }: VersionedRequest,
  ): VersionedOutcome<Card> {
    // As the Worker does: invalid text first, then the key, then the Card.
    const checked = checkCardText(fields)
    if (!checked.ok)
      return { ok: false, reason: 'invalid', fieldErrors: checked.errors }
    const earlier = this.#edits.get(key)
    if (earlier) {
      return earlier.fingerprint === fingerprint
        ? { ok: true, value: earlier.card, replayed: true }
        : { ok: false, reason: 'key_reused' }
    }
    const current = this.#cards.find((c) => c.id === id)
    if (!current) return { ok: false, reason: 'not_found' }
    if (current.contentVersion !== contentVersion)
      return { ok: false, reason: 'conflict' }
    const result = this.updateCard(id, fields)
    if (!result.ok) return result
    this.#edits.set(key, { fingerprint, card: result.card })
    return { ok: true, value: result.card, replayed: false }
  }

  /**
   * Deletes a Card as the API does: only if it is still at the request's
   * `contentVersion`, and at most once per idempotency `key`.
   */
  deleteCardOnce(
    id: string,
    { contentVersion, key, fingerprint }: VersionedRequest,
  ): VersionedOutcome<null> {
    const earlier = this.#deletions.get(key)
    if (earlier) {
      return earlier.fingerprint === fingerprint
        ? { ok: true, value: null, replayed: true }
        : { ok: false, reason: 'key_reused' }
    }
    const current = this.#cards.find((c) => c.id === id)
    if (!current) return { ok: false, reason: 'not_found' }
    if (current.contentVersion !== contentVersion)
      return { ok: false, reason: 'conflict' }
    this.deleteCard(id)
    this.#deletions.set(key, { fingerprint })
    return { ok: true, value: null, replayed: false }
  }

  /**
   * Updates the given fields with the same rules as creation, whatever
   * the Card's version (as another device's edit would), and advances its
   * `contentVersion`. The Card keeps its id, Progress and place in the
   * default order; a Category left without Cards ceases to exist.
   */
  updateCard(id: string, fields: Partial<CardText>): WriteResult {
    const card = this.#cards.find((c) => c.id === id)
    if (!card) return { ok: false, reason: 'not_found' }
    const checked = checkCardText(fields)
    if (!checked.ok)
      return { ok: false, reason: 'invalid', fieldErrors: checked.errors }
    const trimmed = checked.value
    if (trimmed.question !== undefined) card.question = trimmed.question
    if (trimmed.answer !== undefined) card.answer = trimmed.answer
    if (trimmed.category !== undefined) {
      card.categoryId = this.#categoryFor(trimmed.category).id
      this.#dropEmptyCategories()
    }
    card.contentVersion++
    return { ok: true, card: this.#toCard(card) }
  }

  /**
   * Sets a Card's Progress, a whole number from 0 to 5, whatever its
   * version (as another device's save would), and advances its
   * `progressVersion`. Everything else about the Card, its
   * `contentVersion` and place in the default order included, stays.
   */
  setProgress(id: string, progress: number): Card | undefined {
    const card = this.#cards.find((c) => c.id === id)
    if (!card) return undefined
    card.progress = progress
    card.progressVersion++
    return this.#toCard(card)
  }

  /**
   * Saves a Card's Progress as the API does: only if it is still at the
   * request's `progressVersion`, and at most once per idempotency `key`.
   * Repeating a key with the same `fingerprint` answers the Card as that
   * save left it, even after later writes.
   */
  setProgressOnce(
    id: string,
    progress: number,
    { progressVersion, key, fingerprint }: ProgressRequest,
  ): VersionedOutcome<Card> {
    const earlier = this.#progressSaves.get(key)
    if (earlier) {
      return earlier.fingerprint === fingerprint
        ? { ok: true, value: earlier.card, replayed: true }
        : { ok: false, reason: 'key_reused' }
    }
    const current = this.#cards.find((c) => c.id === id)
    if (!current) return { ok: false, reason: 'not_found' }
    if (current.progressVersion !== progressVersion)
      return { ok: false, reason: 'conflict' }
    const card = this.setProgress(id, progress)!
    this.#progressSaves.set(key, { fingerprint, card })
    return { ok: true, value: card, replayed: false }
  }

  /**
   * Deletes a Card, reporting whether it existed. A Category left without
   * Cards ceases to exist.
   */
  deleteCard(id: string): boolean {
    const index = this.#cards.findIndex((c) => c.id === id)
    if (index === -1) return false
    this.#cards.splice(index, 1)
    this.#dropEmptyCategories()
    return true
  }

  #newCardId() {
    let id: string
    do id = `card-new-${this.#nextCardId++}`
    while (this.#cards.some((c) => c.id === id))
    return id
  }

  /** Forgets Categories without Cards, so a later one starts afresh. */
  #dropEmptyCategories() {
    const used = new Set(this.#cards.map((card) => card.categoryId))
    for (const [key, category] of this.#categories) {
      if (!used.has(category.id)) this.#categories.delete(key)
    }
  }

  /** Every Category that has Cards, by name, with global counts. */
  listCategories(): Category[] {
    const counts = new Map<string, number>()
    for (const card of this.#cards) {
      counts.set(card.categoryId, (counts.get(card.categoryId) ?? 0) + 1)
    }
    return [...this.#categories.values()]
      .filter((c) => counts.has(c.id))
      .map((c) => ({ ...c, count: counts.get(c.id)! }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}

/** The account whose Collection the mock backend seeds from the fixture. */
export const MOCK_DEMO_USER = 'user_mock_demo'

/**
 * Every account's Collection. The demo account's starts from the fixture;
 * any other account's starts empty, as a new account's does.
 */
export class MockBackend {
  readonly #collections = new Map<string, MockStore>()
  /** The demo account's Collection. */
  readonly demo = new MockStore()

  constructor() {
    this.#collections.set(MOCK_DEMO_USER, this.demo)
  }

  /** The Collection that belongs to `userId`. */
  collectionOf(userId: string) {
    let collection = this.#collections.get(userId)
    if (!collection) {
      collection = new MockStore([])
      this.#collections.set(userId, collection)
    }
    return collection
  }

  /** Restores the fixture for the demo account and forgets every other. */
  reset() {
    this.demo.reset()
    this.#collections.clear()
    this.#collections.set(MOCK_DEMO_USER, this.demo)
  }
}

/** The accounts the mock backend serves. */
export const mockBackend = new MockBackend()

/** The demo account's Collection, which tests and scenarios act on. */
export const mockStore = mockBackend.demo
