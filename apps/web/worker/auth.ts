import { verifyToken } from '@clerk/backend'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'

import { database } from './collection.js'
import type { Env } from './env.js'
import { apiError } from './errors.js'
import { lifecycle } from './lifecycle.js'

/** The answer to a request with no session, or the session of a deleted identity. */
export const signInAgain = (c: Context) =>
  apiError(c, 401, 'unauthorized', 'Sign in to continue.')

export interface AuthVariables {
  /** The verified session's Clerk user id: the owner of everything touched. */
  ownerId: string
}

/**
 * Admits only requests with a valid Clerk session token as their bearer
 * token, and records its subject as the owner. Anything else (no token,
 * or one that is malformed, expired, not yet valid, wrongly signed or
 * issued for another origin) gets 401 before any data is read, as does the
 * session of an identity an administrator deleted. There is no other way
 * in: no test identities, no bypass.
 */
export const requireSession = createMiddleware<{
  Bindings: Env
  Variables: AuthVariables
}>(async (c, next) => {
  const parties = (c.env.CLERK_AUTHORIZED_PARTIES ?? '')
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean)
  const { CLERK_JWT_KEY: jwtKey, CLERK_SECRET_KEY: secretKey } = c.env
  if ((!jwtKey && !secretKey) || parties.length === 0) {
    // Misconfigured: refuse everything rather than guess.
    console.error('Clerk verification is not configured.')
    return apiError(c, 500, 'server_error', 'The server failed.')
  }

  const token = /^Bearer ([^\s]+)$/.exec(
    c.req.header('Authorization') ?? '',
  )?.[1]
  const subject = token
    ? await verifyToken(token, {
        jwtKey,
        secretKey,
        authorizedParties: parties,
      })
        // Resolves to the verified claims; rejects for any invalid token.
        .then((claims) => claims.sub as unknown)
        .catch(() => undefined)
    : undefined
  if (typeof subject !== 'string' || !subject) return signInAgain(c)
  // A session can outlive its identity by a minute: Clerk's tokens stay
  // valid until they expire. A deleted identity reads and writes nothing.
  if (await lifecycle(database(c.env.DB)).isDeleted(subject))
    return signInAgain(c)

  c.set('ownerId', subject)
  await next()
})
