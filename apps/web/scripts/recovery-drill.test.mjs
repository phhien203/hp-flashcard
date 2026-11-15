import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  assertDisposable,
  CARDS_QUERY,
  compareCards,
  drillName,
  DRILL_PREFIX,
  productionDatabaseIds,
  syntheticDataset,
} from './recovery-drill-policy.mjs'

const config = JSON.parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1'),
)
const PRODUCTION_ID = config.env.production.d1_databases[0].database_id
const DRILL_ID = '11111111-2222-4333-8444-555555555555'

test('the guard knows the production database from wrangler.jsonc', () => {
  assert.deepEqual(productionDatabaseIds(config), [PRODUCTION_ID])
})

test('the guard admits only a disposable drill database', () => {
  assertDisposable({ name: drillName(), id: DRILL_ID }, config)
})

test('the guard refuses the production database, by id or by name', () => {
  for (const database of [
    { name: drillName(), id: PRODUCTION_ID },
    { name: 'hp-flashcard', id: DRILL_ID },
    { name: 'hp-flashcard', id: PRODUCTION_ID },
    { name: 'something-else', id: DRILL_ID },
    { name: drillName(), id: undefined },
    { name: `${DRILL_PREFIX}X'; DROP`, id: DRILL_ID },
  ])
    assert.throws(() => assertDisposable(database, config))
})

test('the guard refuses when it has no production database to guard', () => {
  assert.throws(() =>
    assertDisposable({ name: drillName(), id: DRILL_ID }, { env: {} }),
  )
})

test('drill names are fresh and recognisable', () => {
  assert.equal(
    drillName(new Date('2026-11-15T10:20:30Z')),
    'hp-flashcard-drill-20261115102030',
  )
})

test('synthetic data covers every owner, Progress value and versions', () => {
  const data = syntheticDataset(1_800_000_000_000)
  assert.equal(new Set(data.cards.map((c) => c.owner_id)).size, 3)
  assert.deepEqual(
    [...new Set(data.cards.map((c) => c.progress))].sort(),
    [0, 2, 4],
  )
  assert.ok(data.cards.some((c) => c.content_version > 1))
  assert.ok(data.cards.some((c) => c.progress_version > 1))
  assert.equal(data.retryRecords.length, data.cards.length)
  for (const card of data.cards)
    assert.ok(
      data.categories.some(
        (g) => g.id === card.category_id && g.owner_id === card.owner_id,
      ),
    )
  assert.match(data.sql, /^INSERT INTO categories/)
  assert.match(CARDS_QUERY, /ORDER BY seq$/)
})

test('compareCards reports missing, changed and unexpected cards', () => {
  const { cards } = syntheticDataset(1)
  assert.deepEqual(compareCards(cards, cards), [])
  const damaged = cards
    .slice(1)
    .map((c, i) => (i === 0 ? { ...c, progress: 5 - c.progress } : c))
  damaged.push({ ...cards[0], id: 'card_new' })
  assert.deepEqual(compareCards(damaged, cards), [
    `missing card ${cards[0].id}`,
    `card ${cards[1].id}: progress differs`,
    'unexpected card card_new',
  ])
})
