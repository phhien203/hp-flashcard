import { describe, expect, it } from 'vitest'

import { tokenForAccount } from './clerk-token.js'

const session = (userId: string) => ({
  user: { id: userId },
  getToken: () => Promise.resolve(`token for ${userId}`),
})

describe('tokenForAccount', () => {
  it("is the active session's token while it belongs to the account", async () => {
    const clerk = { session: session('user_a') }
    await expect(tokenForAccount(clerk, 'user_a')).resolves.toBe(
      'token for user_a',
    )
  })

  it('is null once signed out', async () => {
    await expect(tokenForAccount({ session: null }, 'user_a')).resolves.toBe(
      null,
    )
  })

  it("never lends another account's token to this one", async () => {
    // Account A's request asks for a token after B has signed in.
    const clerk = { session: session('user_b') }
    await expect(tokenForAccount(clerk, 'user_a')).resolves.toBe(null)
  })
})
