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
  const key = (item: number) => `item-${item}`

  it('gives the same order for the same seed', () => {
    expect(seededShuffle(items, 123, key)).toEqual(
      seededShuffle(items, 123, key),
    )
  })

  it('keeps every item exactly once', () => {
    expect([...seededShuffle(items, 9, key)].sort((a, b) => a - b)).toEqual(
      items,
    )
  })

  it('keeps the others in order when items come and go', () => {
    const order = seededShuffle(items, 31, key)
    const withNew = seededShuffle([...items, 99], 31, key)
    expect(withNew.filter((item) => item !== 99)).toEqual(order)
    const without = seededShuffle(
      items.filter((item) => item !== 7),
      31,
      key,
    )
    expect(without).toEqual(order.filter((item) => item !== 7))
  })

  it('does not change its input', () => {
    const copy = [...items]
    seededShuffle(items, 5, key)
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
    expect(ids).toEqual(
      seededShuffle(fixture, 77, (card) => card.id).map((card) => card.id),
    )
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

describe('MockStore writes', () => {
  const fields = { question: 'Q?', answer: 'A.', category: 'Biology' }

  it('creates a trimmed Card with Progress 0, first in the default order', () => {
    const store = new MockStore()
    const result = store.createCard({
      question: '  What is DNA? ',
      answer: '\tDeoxyribonucleic acid.\n',
      category: ' Biology ',
    })
    expect(result).toMatchObject({
      ok: true,
      card: {
        question: 'What is DNA?',
        answer: 'Deoxyribonucleic acid.',
        category: { name: 'Biology' },
        progress: 0,
      },
    })
    const created = result.ok ? result.card : undefined
    expect(page(store).items[0]).toEqual(created)
    expect(store.getCard(created!.id)).toEqual(created)
    expect(page(store).total).toBe(41)
  })

  it('gives every created Card its own id, even for a duplicate question', () => {
    const store = new MockStore()
    const a = store.createCard(fields)
    const b = store.createCard(fields)
    expect(a.ok && b.ok && a.card.id !== b.card.id).toBe(true)
  })

  it('rejects blank fields', () => {
    const store = new MockStore()
    expect(
      store.createCard({ question: '  ', answer: '', category: '\n' }),
    ).toEqual({
      ok: false,
      reason: 'invalid',
      fieldErrors: {
        question: expect.any(String),
        answer: expect.any(String),
        category: expect.any(String),
      },
    })
    expect(page(store).total).toBe(40)
  })

  it('reuses an equivalent Category, keeping its spelling', () => {
    const store = new MockStore()
    const before = store.listCategories()
    const biology = before.find((c) => c.name === 'Biology')!
    const result = store.createCard({ ...fields, category: '  BIOLOGY ' })
    expect(result.ok && result.card.category).toEqual({
      id: biology.id,
      name: 'Biology',
    })
    expect(store.listCategories().find((c) => c.id === biology.id)?.count).toBe(
      biology.count + 1,
    )
  })

  it('edits a Card, keeping its id, Progress and place', () => {
    const store = new MockStore()
    const result = store.updateCard('card-01', {
      question: ' Edited? ',
      category: 'geography',
    })
    expect(result).toMatchObject({
      ok: true,
      card: {
        id: 'card-01',
        question: 'Edited?',
        category: { name: 'Geography' },
        progress: 5,
      },
    })
    expect(page(store).items[0]?.id).toBe('card-01')
  })

  it('removes a Category when its last Card moves out', () => {
    const store = new MockStore([
      { id: 'a', question: 'Q1', answer: 'A1', category: 'Art', progress: 0 },
      { id: 'b', question: 'Q2', answer: 'A2', category: 'Music', progress: 3 },
    ])
    store.updateCard('a', { category: 'Music' })
    expect(store.listCategories()).toEqual([
      { id: expect.any(String), name: 'Music', count: 2 },
    ])

    // A new "art" is a new Category, with the new spelling.
    const result = store.updateCard('b', { category: 'art' })
    expect(result.ok && result.card.category.name).toBe('art')
  })

  it('reports unknown and invalid edits', () => {
    const store = new MockStore()
    expect(store.updateCard('nope', fields)).toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(store.updateCard('card-01', { answer: ' ' })).toMatchObject({
      ok: false,
      reason: 'invalid',
      fieldErrors: { answer: expect.any(String) },
    })
    expect(store.getCard('card-01')?.answer).toBe(fixture[0]!.answer)
  })
  it('deletes a Card, keeping the others in order', () => {
    const store = new MockStore()
    expect(store.deleteCard('card-02')).toBe(true)
    expect(store.getCard('card-02')).toBeUndefined()
    expect(page(store).total).toBe(39)
    expect(page(store).items.map((card) => card.id)).toEqual(
      fixture
        .filter((card) => card.id !== 'card-02')
        .slice(0, 12)
        .map((card) => card.id),
    )
    const geography = store.listCategories().find((c) => c.name === 'Geography')
    expect(geography?.count).toBe(
      fixture.filter((card) => card.category === 'Geography').length - 1,
    )
  })

  it('removes a Category with its last Card, and reports unknown Cards', () => {
    const store = new MockStore([
      { id: 'a', question: 'Q1', answer: 'A1', category: 'Art', progress: 0 },
      { id: 'b', question: 'Q2', answer: 'A2', category: 'Music', progress: 3 },
    ])
    expect(store.deleteCard('a')).toBe(true)
    expect(store.deleteCard('a')).toBe(false)
    expect(store.deleteCard('nope')).toBe(false)
    expect(store.listCategories()).toEqual([
      { id: expect.any(String), name: 'Music', count: 1 },
    ])
    expect(store.deleteCard('b')).toBe(true)
    expect(store.listCategories()).toEqual([])
    expect(page(store)).toMatchObject({ items: [], total: 0, nextOffset: null })
  })

  it('sets Progress, keeping the Card and its place', () => {
    const store = new MockStore()
    const before = store.getCard('card-02')!
    expect(store.setProgress('card-02', 5)).toEqual({ ...before, progress: 5 })
    expect(page(store, { limit: 3 }).items.map((card) => card.id)).toEqual([
      'card-01',
      'card-02',
      'card-03',
    ])
    expect(page(store, { hideMastered: true }).total).toBe(31)
    expect(store.setProgress('nope', 1)).toBeUndefined()
  })
})

describe('MockStore statistics', () => {
  it('counts Cards by Progress, across the whole collection', () => {
    const store = new MockStore()
    expect(store.statistics([])).toEqual({
      total: 40,
      notStarted: 8,
      inProgress: 24,
      mastered: 8,
    })
  })

  it('counts only the given Categories, any of them', () => {
    const store = new MockStore()
    const ids = store
      .listCategories()
      .filter((c) => ['Biology', 'History'].includes(c.name))
      .map((c) => c.id)
    const expected = fixture.filter((card) =>
      ['Biology', 'History'].includes(card.category),
    )
    expect(store.statistics(ids)).toEqual({
      total: expected.length,
      notStarted: expected.filter((card) => card.progress === 0).length,
      inProgress: expected.filter((c) => c.progress > 0 && c.progress < 5)
        .length,
      mastered: expected.filter((card) => card.progress === 5).length,
    })
    expect(store.statistics(['cat-404']).total).toBe(0)
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
