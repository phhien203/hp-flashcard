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

  constructor(seed: readonly SeedCard[] = fixture) {
    this.reset(seed)
  }

  /** Replaces every Card with `seed`, as on a fresh page load. */
  reset(seed: readonly SeedCard[] = fixture) {
    this.#cards = []
    this.#categories.clear()
    this.#nextCategoryId = 1
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
    if (seed !== undefined) matching = seededShuffle(matching, seed)
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
