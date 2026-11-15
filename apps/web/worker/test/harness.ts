import {
  createHmac,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import { createTestHarness } from 'wrangler'

import type { Env } from '../env.js'

const APP_DIR = fileURLToPath(new URL('../../', import.meta.url).href)

/** The origin the test sessions were issued for (their `azp`). */
export const APP_ORIGIN = 'http://localhost:5173'

/**
 * A stand-in for a Clerk instance: an RSA key pair. The Worker gets the
 * public key as `CLERK_JWT_KEY`, exactly as it gets the real instance's, and
 * verifies the tokens `sessionToken` signs with Clerk's own code.
 */
export function createIssuer() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  return {
    jwtKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    sessionToken: (claims: SessionClaims) => signToken(privateKey, claims),
  }
}

export type Issuer = ReturnType<typeof createIssuer>

export interface SessionClaims {
  sub: string
  sid?: string
  azp?: string
  /** Seconds from now until it expires; negative for an expired token. */
  expiresIn?: number
  /** Seconds from now until it becomes valid. */
  notBefore?: number
}

const base64url = (data: Buffer | string) =>
  Buffer.from(data).toString('base64url')

function signToken(
  privateKey: KeyObject,
  {
    sub,
    sid = 'sess_test',
    azp = APP_ORIGIN,
    expiresIn = 60,
    notBefore = -5,
  }: SessionClaims,
) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' }),
  )
  const payload = base64url(
    JSON.stringify({
      sub,
      sid,
      azp,
      iss: 'https://clerk.test.example',
      iat: now - 5,
      nbf: now + notBefore,
      exp: now + expiresIn,
    }),
  )
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    privateKey,
  )
  return `${header}.${payload}.${base64url(signature)}`
}

/**
 * A stand-in for a Clerk webhook endpoint: its signing secret, which the
 * Worker gets as `CLERK_WEBHOOK_SIGNING_SECRET`, and deliveries signed with
 * it as Clerk (through Svix) signs them, per Standard Webhooks.
 */
export function createWebhookSender(
  secret = `whsec_${randomBytes(24).toString('base64')}`,
) {
  return {
    secret,
    /**
     * The headers of a delivery of exactly `body`, signed at `timestamp`
     * (seconds) with this sender's secret.
     */
    headers(
      body: string,
      {
        id = `msg_${crypto.randomUUID()}`,
        timestamp = Math.floor(Date.now() / 1000),
      }: { id?: string; timestamp?: number } = {},
    ) {
      const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
      const signature = createHmac('sha256', key)
        .update(`${id}.${timestamp}.${body}`)
        .digest('base64')
      return {
        'svix-id': id,
        'svix-timestamp': String(timestamp),
        'svix-signature': `v1,${signature}`,
        'Content-Type': 'application/json',
      }
    },
  }
}

export type WebhookSender = ReturnType<typeof createWebhookSender>

/**
 * The Worker as `wrangler dev` runs it, through Wrangler's test harness:
 * wrangler.jsonc's entry point, bundling, compatibility settings and D1
 * binding, in workerd, with a local D1 database built by the checked-in
 * migrations (applied as `wrangler d1 migrations apply` applies them). The
 * only test-specific inputs are the Clerk keys, passed as secrets.
 */
export async function startWorker(
  clerk:
    | {
        issuer: Issuer
        webhooks?: WebhookSender
        /** More secrets or variables, e.g. a recovery's. */
        extra?: Record<string, string>
      }
    | { secrets: Record<string, string> },
) {
  const base =
    'issuer' in clerk
      ? {
          CLERK_JWT_KEY: clerk.issuer.jwtKey,
          CLERK_AUTHORIZED_PARTIES: APP_ORIGIN,
          ...(clerk.webhooks
            ? { CLERK_WEBHOOK_SIGNING_SECRET: clerk.webhooks.secret }
            : {}),
          ...clerk.extra,
        }
      : clerk.secrets
  const optionsWith = (secrets: Record<string, string>) => ({
    root: APP_DIR,
    workers: [{ configPath: './wrangler.jsonc', secrets }],
  })
  let options = optionsWith(base)
  // wrangler.jsonc serves the built frontend from dist/, which must exist,
  // though the API needs no build.
  await mkdir(`${APP_DIR}dist`, { recursive: true })
  const server = createTestHarness(options)
  await server.listen()
  await server.getWorker<Env>().applyD1Migrations('DB')

  return {
    /** Sends a request to the Worker, as the browser would. */
    fetch: (pathname: string, init: RequestInit = {}) =>
      server.fetch(
        `${APP_ORIGIN}${pathname}`,
        init as never,
      ) as unknown as Promise<Response>,
    /**
     * Replaces the running Worker with a fresh instance, keeping the
     * database, as a deployment or a new isolate would.
     */
    restart: () => server.update(options),
    /**
     * Deploys the Worker again with `extra` secrets or variables in place
     * of the previous extras, keeping the database, as an operator's
     * `wrangler secret put` or `secret delete` would.
     */
    reconfigure: (extra: Record<string, string>) => {
      options = optionsWith({ ...base, ...extra })
      return server.update(options)
    },
    /** The Worker's bindings, e.g. its D1 database, from Node. */
    env: () => server.getWorker<Env>().getEnv(),
    /** Runs the daily cron, as Cloudflare would. */
    scheduled: () => server.getWorker<Env>().scheduled({ cron: '17 3 * * *' }),
    dispose: () => server.close(),
  }
}

export type TestWorker = Awaited<ReturnType<typeof startWorker>>

/**
 * A stand-in for Clerk's Backend API: `GET /v1/users?user_id=…` answers
 * which of the ids it is asked about still exist, as Clerk does, for the
 * secret key it was made with. `failing` makes it answer 503.
 */
export async function startClerkApi(
  secretKey = `sk_test_${randomBytes(12).toString('hex')}`,
) {
  const existing = new Set<string>()
  const state = { failing: false, requests: 0 }
  const server = createServer((request, response) => {
    state.requests++
    const url = new URL(request.url ?? '/', 'http://localhost')
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.headers.authorization !== `Bearer ${secretKey}`)
      return send(401, { errors: [{ code: 'authentication_invalid' }] })
    if (state.failing) return send(503, { errors: [] })
    if (request.method !== 'GET' || url.pathname !== '/v1/users')
      return send(404, { errors: [] })
    send(
      200,
      url.searchParams
        .getAll('user_id')
        .filter((id) => existing.has(id))
        .map((id) => ({ id, object: 'user' })),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    secretKey,
    url: `http://127.0.0.1:${port}`,
    /** Clerk has these users (until `remove`d). */
    add: (...ids: string[]) => ids.forEach((id) => existing.add(id)),
    /** An administrator deleted these users in Clerk. */
    remove: (...ids: string[]) => ids.forEach((id) => existing.delete(id)),
    state,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

export type ClerkApi = Awaited<ReturnType<typeof startClerkApi>>

/** Every table a restore puts back, in an order foreign keys accept. */
const RESTORED_TABLES = [
  'categories',
  'cards',
  'idempotency_records',
  'write_requests',
  'webhook_deliveries',
  'recoveries',
  // Last: its triggers would refuse the rows above for a deleted owner.
  'deleted_identities',
] as const

/**
 * A local stand-in for D1 Time Travel, which only exists remotely: the
 * whole database's rows at a moment (the bookmark), from `database`, and a restore that
 * puts every table back to them, losing everything written since. The
 * real restore is rehearsed on a disposable remote database
 * (scripts/recovery-drill.mjs).
 */
export async function bookmark(database: () => Promise<D1Database>) {
  const d1 = await database()
  const rows: Record<string, Record<string, unknown>[]> = {}
  for (const table of RESTORED_TABLES)
    rows[table] = (await d1.prepare(`SELECT * FROM ${table}`).all()).results
  return {
    /** Overwrites the whole database with the bookmarked rows. */
    restore: async () => {
      // A fresh stub: redeploying the Worker invalidates older ones.
      const d1 = await database()
      await d1.batch([
        ...[...RESTORED_TABLES]
          .reverse()
          .map((table) => d1.prepare(`DELETE FROM ${table}`)),
        ...RESTORED_TABLES.flatMap((table) =>
          rows[table]!.map((row) => {
            const columns = Object.keys(row)
            return d1
              .prepare(
                `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
              )
              .bind(...Object.values(row))
          }),
        ),
      ])
    },
  }
}
