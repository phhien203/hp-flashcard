import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
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
 * The Worker as `wrangler dev` runs it, through Wrangler's test harness:
 * wrangler.jsonc's entry point, bundling, compatibility settings and D1
 * binding, in workerd, with a local D1 database built by the checked-in
 * migrations (applied as `wrangler d1 migrations apply` applies them). The
 * only test-specific input is the Clerk key, passed as a secret.
 */
export async function startWorker(
  clerk: { issuer: Issuer } | { secrets: Record<string, string> },
) {
  const secrets =
    'issuer' in clerk
      ? {
          CLERK_JWT_KEY: clerk.issuer.jwtKey,
          CLERK_AUTHORIZED_PARTIES: APP_ORIGIN,
        }
      : clerk.secrets
  const options = {
    root: APP_DIR,
    workers: [{ configPath: './wrangler.jsonc', secrets }],
  }
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
    /** The Worker's bindings, e.g. its D1 database, from Node. */
    env: () => server.getWorker<Env>().getEnv(),
    /** Runs the daily cron, as Cloudflare would. */
    scheduled: () => server.getWorker<Env>().scheduled({ cron: '17 3 * * *' }),
    dispose: () => server.close(),
  }
}

export type TestWorker = Awaited<ReturnType<typeof startWorker>>
