import type { Card, CardPage, Category } from '../api/types.js'
import fixture from './fixtures/cards.json' with { type: 'json' }
import { seededShuffle } from './shuffle.js'

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
}

export interface CardQuery {
  categoryIds: readonly string[]
  hideMastered: boolean
  offset: number
  limit: number
  seed: number | undefined
}

const MASTERED = 5

/** The fields of a Card a client writes, before validation. */
export interface CardFields {
  question: string
  answer: string
  category: string
}

/** Why a write was rejected: messages keyed by field name. */
export type FieldErrors = Partial<Record<keyof CardFields, string>>

export type WriteResult =
  | { ok: true; card: Card }
  | { ok: false; reason: 'invalid'; fieldErrors: FieldErrors }
  | { ok: false; reason: 'not_found' }

/** The message for a blank field, as the app also shows it. */
export const BLANK_FIELD_MESSAGES: Record<keyof CardFields, string> = {
  question: 'Please enter a question.',
  answer: 'Please enter an answer.',
  category: 'Please enter a category.',
}

/** Trims `fields` and reports the blank ones. */
function validate(fields: Partial<CardFields>) {
  const fieldErrors: FieldErrors = {}
  const trimmed: Partial<CardFields> = {}
  for (const name of ['question', 'answer', 'category'] as const) {
    const value = fields[name]
    if (value === undefined) continue
    trimmed[name] = value.trim()
    if (!trimmed[name]) fieldErrors[name] = BLANK_FIELD_MESSAGES[name]
  }
  return { trimmed, fieldErrors }
}

/** Category names are equivalent regardless of case and surrounding whitespace. */
export const categoryKey = (name: string) => name.trim().toLocaleLowerCase()

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

  constructor(seed: readonly SeedCard[] = fixture) {
    this.reset(seed)
  }

  /** Replaces every Card with `seed`, as on a fresh page load. */
  reset(seed: readonly SeedCard[] = fixture) {
    this.#cards = []
    this.#categories.clear()
    this.#nextCategoryId = 1
    this.#nextCardId = 1
    for (const card of seed) {
      this.#cards.push({
        id: card.id,
        question: card.question,
        answer: card.answer,
        categoryId: this.#categoryFor(card.category).id,
        progress: card.progress,
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
    }
  }

  /** A page of matching Cards: filtered, then shuffled by `seed`, then paged. */
  listCards({
    categoryIds,
    hideMastered,
    offset,
    limit,
    seed,
  }: CardQuery): CardPage {
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

  getCard(id: string): Card | undefined {
    const card = this.#cards.find((c) => c.id === id)
    return card && this.#toCard(card)
  }

  /**
   * Creates a Card with Progress 0, first in the default order. Fields are
   * trimmed and must not be blank; the Category is matched by name ignoring
   * case and surrounding whitespace, or created.
   */
  createCard(fields: CardFields): WriteResult {
    const { trimmed, fieldErrors } = validate(fields)
    if (Object.keys(fieldErrors).length > 0)
      return { ok: false, reason: 'invalid', fieldErrors }
    const card: StoredCard = {
      id: this.#newCardId(),
      question: trimmed.question!,
      answer: trimmed.answer!,
      categoryId: this.#categoryFor(trimmed.category!).id,
      progress: 0,
    }
    this.#cards.unshift(card)
    return { ok: true, card: this.#toCard(card) }
  }

  /**
   * Updates the given fields with the same rules as creation. The Card
   * keeps its id, Progress and place in the default order; a Category left
   * without Cards ceases to exist.
   */
  updateCard(id: string, fields: Partial<CardFields>): WriteResult {
    const card = this.#cards.find((c) => c.id === id)
    if (!card) return { ok: false, reason: 'not_found' }
    const { trimmed, fieldErrors } = validate(fields)
    if (Object.keys(fieldErrors).length > 0)
      return { ok: false, reason: 'invalid', fieldErrors }
    if (trimmed.question !== undefined) card.question = trimmed.question
    if (trimmed.answer !== undefined) card.answer = trimmed.answer
    if (trimmed.category !== undefined) {
      card.categoryId = this.#categoryFor(trimmed.category).id
      this.#dropEmptyCategories()
    }
    return { ok: true, card: this.#toCard(card) }
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

/** The one store the mock backend serves. */
export const mockStore = new MockStore()
