// The D1 recovery drill (ADR 0005, docs/web-recovery.md): on a DISPOSABLE
// remote D1 database, never production, apply the real migrations, seed
// synthetic data, bookmark it, damage it, restore it with Time Travel,
// verify it, then reconcile deleted identities and reopen through the real
// Worker (wrangler dev, bound to the remote drill database), and delete the
// database. Prints a JSON report: commands' outcomes, durations, checks.
//
//   node apps/web/scripts/recovery-drill.mjs --confirm-disposable \
//     [--location eeur] [--report drill.json]
//
// Needs an authenticated Wrangler (`wrangler login`, or CLOUDFLARE_API_TOKEN
// with D1 edit) for the account in wrangler.jsonc. Creates exactly one
// database, named hp-flashcard-drill-<timestamp>, and deletes it at the end,
// whatever happened. Never run from routine tests or CI.
import { spawn, execFileSync } from 'node:child_process'
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertDisposable,
  CARDS_QUERY,
  compareCards,
  drillName,
  syntheticDataset,
} from './recovery-drill-policy.mjs'

const app = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const option = (name) => {
  const at = args.indexOf(name)
  return at === -1 ? undefined : args[at + 1]
}
if (!args.includes('--confirm-disposable')) {
  console.error(
    'This creates, restores and deletes a remote D1 database. Re-run with --confirm-disposable.',
  )
  process.exit(2)
}

/** wrangler.jsonc, without its comments and trailing commas. */
const config = JSON.parse(
  readFileSync(join(app, 'wrangler.jsonc'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1'),
)
const accountId = config.env.production.account_id

const wranglerEnv = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: accountId,
  // Non-interactive: Wrangler's confirmations take their defaults.
  CI: 'true',
}
const wrangler = (...wranglerArgs) =>
  execFileSync('pnpm', ['exec', 'wrangler', ...wranglerArgs], {
    cwd: app,
    env: wranglerEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  })
const json = (output) => JSON.parse(output.slice(output.search(/[[{]/)))

const report = {
  startedAt: new Date().toISOString(),
  wrangler: wrangler('--version').trim(),
  database: undefined,
  bookmark: undefined,
  durationsMs: {},
  checks: [],
  cleanedUp: false,
}
const check = (name, ok, detail) => {
  report.checks.push({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) })
  if (!ok) throw new Error(`Drill check failed: ${name}`)
}
const timed = async (name, step) => {
  const started = Date.now()
  try {
    return await step()
  } finally {
    report.durationsMs[name] = Date.now() - started
  }
}

const scratch = mkdtempSync(join(tmpdir(), 'hp-flashcard-drill-'))
const name = drillName()
let database
let dev

try {
  // `wrangler whoami` succeeds even when signed out: read what it says.
  const whoami = (() => {
    try {
      return wrangler('whoami')
    } catch {
      return ''
    }
  })()
  if (!whoami || /not authenticated/i.test(whoami))
    throw new Error('Wrangler is not authenticated: the drill is blocked.')

  await timed('create', () => {
    wrangler('d1', 'create', name, '--location', option('--location') ?? 'eeur')
    // Created: from here on, cleanup must remove it even if reading it fails.
    database = { name }
    const info = json(wrangler('d1', 'info', name, '--json'))
    database = { name, id: info.uuid }
    assertDisposable(database, config)
    report.database = database
  })

  // A config of the drill database only: never the production binding.
  const drillConfig = join(scratch, 'wrangler.jsonc')
  writeFileSync(
    drillConfig,
    JSON.stringify({
      name: 'hp-flashcard-drill',
      main: join(app, 'worker/index.ts'),
      compatibility_date: config.compatibility_date,
      account_id: accountId,
      workers_dev: false,
      preview_urls: false,
      d1_databases: [
        {
          binding: 'DB',
          database_name: database.name,
          database_id: database.id,
          migrations_dir: join(app, 'migrations'),
          remote: true,
        },
      ],
    }),
  )
  const d1 = (...d1Args) =>
    wrangler('d1', ...d1Args, '--remote', '--config', drillConfig)
  const query = (sql) =>
    json(d1('execute', 'DB', '--json', '--command', sql))[0].results

  await timed('migrate', () => d1('migrations', 'apply', 'DB'))
  const now = Date.now()
  const data = syntheticDataset(now)
  const seed = join(scratch, 'seed.sql')
  writeFileSync(seed, data.sql)
  await timed('seed', () => d1('execute', 'DB', '--file', seed))
  const expectedCards = query(CARDS_QUERY)
  check(
    'seeded every synthetic card',
    expectedCards.length === data.cards.length,
  )

  // The recovery point.
  report.bookmark = json(
    wrangler('d1', 'time-travel', 'info', name, '--json'),
  ).bookmark
  check('recorded a bookmark', typeof report.bookmark === 'string')

  // After it: the deleted identity's purge (as its webhook would), a write
  // acknowledged after the recovery point, and damage.
  const { owners } = data
  query(
    [
      `INSERT INTO deleted_identities VALUES ('${owners.deleted}', ${Date.now()})`,
      `DELETE FROM cards WHERE owner_id = '${owners.deleted}'`,
      `DELETE FROM categories WHERE owner_id = '${owners.deleted}'`,
      `DELETE FROM idempotency_records WHERE owner_id = '${owners.deleted}'`,
      `DELETE FROM write_requests WHERE owner_id = '${owners.deleted}'`,
      `INSERT INTO cards (id, owner_id, category_id, question, answer, created_at) VALUES ('card_after_bookmark', '${owners.kept}', 'cat_kept_0', 'After?', 'Lost.', ${Date.now()})`,
      `DELETE FROM cards WHERE owner_id = '${owners.other}'`,
      `UPDATE cards SET progress = 0, content_version = content_version + 7`,
    ].join('; '),
  )
  check(
    'damaged the database',
    compareCards(query(CARDS_QUERY), expectedCards).length > 0,
  )

  // The restore: the whole database, in place.
  await timed('restore', () =>
    wrangler(
      'd1',
      'time-travel',
      'restore',
      name,
      `--bookmark=${report.bookmark}`,
      '--json',
    ),
  )

  const problems = compareCards(query(CARDS_QUERY), expectedCards)
  check(
    'restored every card, value and version',
    problems.length === 0,
    problems,
  )
  const counts = query(
    `SELECT (SELECT count(*) FROM categories) AS categories,
            (SELECT count(*) FROM idempotency_records) AS retryRecords,
            (SELECT count(*) FROM write_requests) AS writes,
            (SELECT count(*) FROM deleted_identities) AS tombstones,
            (SELECT count(*) FROM cards c WHERE NOT EXISTS (
               SELECT 1 FROM categories g
               WHERE g.id = c.category_id AND g.owner_id = c.owner_id)) AS orphans`,
  )[0]
  check(
    'restored categories, retry records and relationships',
    counts.categories === data.categories.length &&
      counts.retryRecords === data.retryRecords.length &&
      counts.orphans === 0,
    counts,
  )
  check(
    'the restore resurrected the deleted identity, without its tombstone',
    counts.tombstones === 0,
  )

  // Reconcile and reopen through the real Worker, bound to the drill
  // database, with a stand-in Clerk that knows only the kept identities.
  await timed('reconcile-and-reopen', async () => {
    const clerk = await clerkStandIn([owners.kept, owners.other])
    const issuer = createIssuer()
    const adminToken = randomBytes(24).toString('hex')
    const port = 8700 + Math.floor(Math.random() * 200)
    const origin = `http://127.0.0.1:${port}`
    writeFileSync(
      join(scratch, '.dev.vars'),
      Object.entries({
        RECOVERY_EPOCH: `drill-${Date.now()}`,
        RECOVERY_ADMIN_TOKEN: adminToken,
        CLERK_SECRET_KEY: clerk.secretKey,
        CLERK_API_URL: clerk.url,
        CLERK_JWT_KEY: issuer.jwtKey,
        CLERK_AUTHORIZED_PARTIES: origin,
      })
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join('\n'),
    )
    dev = spawn(
      'pnpm',
      [
        'exec',
        'wrangler',
        'dev',
        '--config',
        drillConfig,
        '--port',
        String(port),
        '--ip',
        '127.0.0.1',
      ],
      { cwd: app, env: wranglerEnv, stdio: 'ignore' },
    )
    try {
      await waitFor(`${origin}/api/health`)
      const operator = (path, body) =>
        fetch(`${origin}/api/recovery${path}`, {
          method: body === undefined && path === '' ? 'GET' : 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      const as = (sub) => ({
        Authorization: `Bearer ${issuer.sessionToken(sub, origin)}`,
      })

      check(
        'maintenance closes the API',
        (await fetch(`${origin}/api/cards`, { headers: as(owners.kept) }))
          .status === 503,
      )
      check(
        'reopening before reconciling is refused',
        (await operator('/reopen')).status === 409,
      )
      const dry = await (await operator('/reconcile', { purge: false })).json()
      check('Clerk reports one deleted identity', dry.deleted === 1, dry)
      const purged = await operator('/reconcile', {
        purge: true,
        expectedDeleted: 1,
      })
      check('reconciliation purged it', purged.status === 200)
      check('reopened', (await operator('/reopen')).status === 200)

      const list = await (
        await fetch(`${origin}/api/cards`, { headers: as(owners.kept) })
      ).json()
      check(
        'the kept owner reads exactly its restored cards',
        list.total ===
          expectedCards.filter((c) => c.owner_id === owners.kept).length,
      )
      const first = list.items[0]
      const edit = await fetch(`${origin}/api/cards/${first.id}`, {
        method: 'PATCH',
        headers: {
          ...as(owners.kept),
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
          'If-Match': `"${first.contentVersion}"`,
        },
        body: JSON.stringify({ answer: 'Edited after the drill restore.' }),
      })
      check('a versioned edit succeeds after the restore', edit.status === 200)
      check(
        'the deleted identity stays shut out',
        (await fetch(`${origin}/api/cards`, { headers: as(owners.deleted) }))
          .status === 401,
      )
    } finally {
      dev.kill()
      await clerk.close()
    }
  })
  report.outcome = 'passed'
} catch (error) {
  report.outcome = 'failed'
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  dev?.kill()
  if (database) {
    try {
      wrangler('d1', 'delete', database.name, '--skip-confirmation')
      report.cleanedUp = true
    } catch {
      report.cleanupError = `Delete ${database.name} by hand.`
    }
  } else report.cleanedUp = true
  rmSync(scratch, { recursive: true, force: true })
  report.finishedAt = new Date().toISOString()
  const output = JSON.stringify(report, null, 2)
  console.log(output)
  const path = option('--report')
  if (path) writeFileSync(path, `${output}\n`)
}

/** A stand-in for Clerk's Backend API that knows only `existing`. */
async function clerkStandIn(existing) {
  const secretKey = `sk_test_${randomBytes(12).toString('hex')}`
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const ok = request.headers.authorization === `Bearer ${secretKey}`
    response.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify(
        ok
          ? url.searchParams
              .getAll('user_id')
              .filter((id) => existing.includes(id))
              .map((id) => ({ id }))
          : { errors: [] },
      ),
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    secretKey,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/** An RSA key pair standing in for a Clerk instance's session tokens. */
function createIssuer() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    jwtKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    sessionToken(sub, azp) {
      const now = Math.floor(Date.now() / 1000)
      const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'drill' })}.${encode({ sub, sid: 'sess_drill', azp, iat: now - 5, nbf: now - 5, exp: now + 60 })}`
      const signature = sign('RSA-SHA256', Buffer.from(unsigned), privateKey)
      return `${unsigned}.${signature.toString('base64url')}`
    },
  }
}

/** Waits up to a minute for `url` to answer. */
async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('wrangler dev did not start')
}
