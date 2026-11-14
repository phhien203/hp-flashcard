import { verifyToken } from '@clerk/backend'
import { createMiddleware } from 'hono/factory'

import type { Env } from './env.js'
import { apiError } from './errors.js'

export interface AuthVariables {
  /** The verified session's Clerk user id: the owner of everything touched. */
  ownerId: string
}

/**
 * Admits only requests with a valid Clerk session token as their bearer
 * token, and records its subject as the owner. Anything else (no token,
 * or one that is malformed, expired, not yet valid, wrongly signed or
 * issued for another origin) gets 401 before any data is read. There is no
 * other way in: no test identities, no bypass.
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
  if (typeof subject !== 'string' || !subject)
    return apiError(c, 401, 'unauthorized', 'Sign in to continue.')

  c.set('ownerId', subject)
  await next()
})
