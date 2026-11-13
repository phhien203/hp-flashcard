import { describe, expect, it } from 'vitest'

import fixture from './fixtures/cards.json' with { type: 'json' }
import { scenariosFromUrl } from './scenarios.js'
import { seededShuffle } from './shuffle.js'
import { MockStore } from './store.js'

const page = (
  store: MockStore,
  query: Partial<Parameters<MockStore['listCards']>[0]> = {},
) =>
  store.listCards({
    categoryIds: [],
    hideMastered: false,
    offset: 0,
    limit: 12,
    seed: undefined,
    ...query,
  })

describe('the fixture', () => {
  it('has 40 Cards across several Categories and every Progress level', () => {
    expect(fixture).toHaveLength(40)
    expect(new Set(fixture.map((card) => card.id)).size).toBe(40)
    expect(
      new Set(fixture.map((card) => card.category)).size,
    ).toBeGreaterThanOrEqual(4)
    expect(new Set(fixture.map((card) => card.progress))).toEqual(
      new Set([0, 1, 2, 3, 4, 5]),
    )
  })
})

describe('seededShuffle', () => {
  const items = Array.from({ length: 40 }, (_, i) => i)

  it('gives the same order for the same seed', () => {
    expect(seededShuffle(items, 123)).toEqual(seededShuffle(items, 123))
  })

  it('keeps every item exactly once', () => {
    expect([...seededShuffle(items, 9)].sort((a, b) => a - b)).toEqual(items)
  })

  it('does not change its input', () => {
    const copy = [...items]
    seededShuffle(items, 5)
    expect(items).toEqual(copy)
  })
})

describe('MockStore', () => {
  it('starts from the fixture, in its order', () => {
    const store = new MockStore()
    expect(page(store, { limit: 48 }).items.map((card) => card.id)).toEqual(
      fixture.map((card) => card.id),
    )
  })

  it('gives each Category a stable id, matching names regardless of case and whitespace', () => {
    const store = new MockStore([
      { id: 'a', question: 'Q1', answer: 'A1', category: 'Art', progress: 0 },
      {
        id: 'b',
        question: 'Q2',
        answer: 'A2',
        category: '  art ',
        progress: 1,
      },
      { id: 'c', question: 'Q3', answer: 'A3', category: 'Music', progress: 5 },
    ])

    const categories = store.listCategories()
    expect(categories).toEqual([
      { id: expect.any(String), name: 'Art', count: 2 },
      { id: expect.any(String), name: 'Music', count: 1 },
    ])
    expect(store.getCard('b')?.category).toEqual({
      id: categories[0]!.id,
      name: 'Art',
    })
  })

  it('pages a shuffled collection without duplicates or omissions', () => {
    const store = new MockStore()
    const ids: string[] = []
    let offset: number | null = 0
    while (offset !== null) {
      const result = page(store, { offset, seed: 77 })
      ids.push(...result.items.map((card) => card.id))
      offset = result.nextOffset
    }
    expect(ids).toEqual(seededShuffle(fixture, 77).map((card) => card.id))
  })

  it('reset() restores the fixture, as a browser refresh does', () => {
    const store = new MockStore()
    store.reset([])
    expect(page(store).total).toBe(0)
    expect(store.listCategories()).toEqual([])

    store.reset()
    expect(page(store).total).toBe(40)
    expect(store.listCategories()).toEqual(new MockStore().listCategories())
  })
})

describe('scenariosFromUrl', () => {
  it('reads known scenario names and ignores the rest', () => {
    expect(
      scenariosFromUrl('http://localhost/?scenario=slow, page-error,nope'),
    ).toEqual(['slow', 'page-error'])
    expect(scenariosFromUrl('http://localhost/')).toEqual([])
  })
})
