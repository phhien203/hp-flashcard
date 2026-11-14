import { render } from 'vitest-browser-react'

import { createMockAuth, type MockAuth } from '../auth/mock-auth.js'
import { MockRoot } from '../auth/mock-root.js'

/**
 * Renders the assembled app on the mock sign-in, signed in as the demo
 * account unless `auth` says otherwise. Each render is a fresh page load:
 * a fresh query cache, with the mock backend's data kept. `seeds` are
 * handed out to Shuffle, in order.
 */
export async function renderApp({
  seeds = [],
  auth = createMockAuth(),
}: { seeds?: number[]; auth?: MockAuth } = {}) {
  const queue = [...seeds]
  const screen = await render(
    <MockRoot
      auth={auth}
      createShuffleSeed={() => {
        const seed = queue.shift()
        if (seed === undefined) throw new Error('No Shuffle seed left')
        return seed
      }}
    />,
  )
  return { ...screen, auth }
}
