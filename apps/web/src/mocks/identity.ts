/**
 * The mock backend's stand-in for Clerk session tokens: `mock:<userId>`.
 * Only the mock backend accepts them; the Worker verifies real Clerk tokens
 * and has no way to accept these.
 */
const PREFIX = 'mock:'

/** The bearer token the mock sign-in hands out for `userId`. */
export const mockToken = (userId: string) => `${PREFIX}${userId}`

/** The account a request to the mock backend speaks for, if any. */
export function mockOwnerOf(request: Request): string | undefined {
  const match = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')
  const token = match?.[1]
  if (!token?.startsWith(PREFIX)) return undefined
  return token.slice(PREFIX.length) || undefined
}
