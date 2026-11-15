// The pure parts of the recovery drill (recovery-drill.mjs): the guard that
// keeps it off the production database, the synthetic data it seeds, and
// how it compares what a restore brought back. No I/O here.

/** Every drill database's name starts with this; production's never does. */
export const DRILL_PREFIX = 'hp-flashcard-drill-'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

/** The production D1 id(s) in wrangler.jsonc, which a drill must never touch. */
export function productionDatabaseIds(config) {
  return (config.env?.production?.d1_databases ?? [])
    .map((database) => database.database_id)
    .filter(Boolean)
}

/**
 * Refuses anything but a disposable drill database: a drill name, a real
 * id, and neither the production id nor the production name.
 */
export function assertDisposable(database, config) {
  const production = productionDatabaseIds(config)
  if (production.length === 0)
    throw new Error('wrangler.jsonc names no production database to guard')
  if (
    typeof database?.name !== 'string' ||
    !database.name.startsWith(DRILL_PREFIX) ||
    !/^[a-z0-9-]+$/.test(database.name)
  )
    throw new Error(`A drill database's name must start with ${DRILL_PREFIX}`)
  if (!UUID.test(database.id ?? ''))
    throw new Error('A drill database needs its own id')
  const productionNames = (config.env?.production?.d1_databases ?? []).map(
    (d) => d.database_name,
  )
  if (
    production.includes(database.id) ||
    productionNames.includes(database.name)
  )
    throw new Error('Refusing to drill on the production database')
}

/** A fresh drill database name. */
export const drillName = (now = new Date()) =>
  `${DRILL_PREFIX}${now
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)}`

/** SQL string literal. Synthetic data only: no user input reaches here. */
const literal = (value) =>
  typeof value === 'number' ? String(value) : `'${value.replace(/'/g, "''")}'`

const insert = (table, row) =>
  `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(literal).join(', ')});`

/**
 * Synthetic Collections for three owners, with Categories, Cards at
 * several Progress values and versions, retry records and rate-limit
 * entries. `kept` and `deleted` exist in the drill's stand-in Clerk;
 * `deleted` is deleted there after the bookmark.
 */
export function syntheticDataset(now) {
  const owners = {
    kept: 'user_drill_kept',
    other: 'user_drill_other',
    deleted: 'user_drill_deleted',
  }
  const categories = []
  const cards = []
  const retryRecords = []
  const writes = []
  let seq = 0
  for (const [role, ownerId] of Object.entries(owners)) {
    for (const c of [0, 1]) {
      const categoryId = `cat_${role}_${c}`
      categories.push({
        id: categoryId,
        owner_id: ownerId,
        name: `Drill ${role} ${c}`,
        name_key: `drill ${role} ${c}`,
        created_at: now,
      })
      for (const n of [0, 1, 2]) {
        seq++
        const id = `card_${role}_${c}_${n}`
        cards.push({
          seq,
          id,
          owner_id: ownerId,
          category_id: categoryId,
          question: `Synthetic question ${role} ${c}.${n}?`,
          answer: `Synthetic answer ${role} ${c}.${n}.`,
          progress: (seq * 2) % 6,
          content_version: 1 + (seq % 3),
          progress_version: 1 + (seq % 4),
          created_at: now + seq,
        })
        retryRecords.push({
          owner_id: ownerId,
          operation: 'createCard',
          key: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
          request_hash: 'f'.repeat(64),
          response: JSON.stringify({ id }),
          created_at: now,
          expires_at: now + 24 * 60 * 60 * 1000,
        })
        writes.push({ owner_id: ownerId, at: now })
      }
    }
  }
  const sql = [
    ...categories.map((row) => insert('categories', row)),
    ...cards.map((row) => insert('cards', row)),
    ...retryRecords.map((row) => insert('idempotency_records', row)),
    ...writes.map((row) => insert('write_requests', row)),
  ].join('\n')
  return { owners, categories, cards, retryRecords, sql }
}

/** The query whose rows `compareCards` compares: every Card, in order. */
export const CARDS_QUERY =
  'SELECT seq, id, owner_id, category_id, question, answer, progress, content_version, progress_version, created_at FROM cards ORDER BY seq'

/**
 * The differences between the Cards a restore brought back and those
 * expected, by id: missing, unexpected, or with any column changed.
 */
export function compareCards(actual, expected) {
  const problems = []
  const byId = new Map(actual.map((row) => [row.id, row]))
  for (const want of expected) {
    const got = byId.get(want.id)
    if (!got) {
      problems.push(`missing card ${want.id}`)
      continue
    }
    for (const [column, value] of Object.entries(want))
      if (got[column] !== value)
        problems.push(`card ${want.id}: ${column} differs`)
    byId.delete(want.id)
  }
  for (const id of byId.keys()) problems.push(`unexpected card ${id}`)
  return problems
}
