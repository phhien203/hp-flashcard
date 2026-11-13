import { render } from 'vitest-browser-react'

import { App } from '../app/App.js'
import { createQueryClient } from '../app/queries.js'

/**
 * Renders the assembled app with a fresh QueryClient, so no cached data
 * leaks between tests. `seeds` are handed out to Shuffle, in order.
 */
export async function renderApp({ seeds = [] }: { seeds?: number[] } = {}) {
  const queue = [...seeds]
  const queryClient = createQueryClient()
  const screen = await render(
    <App
      queryClient={queryClient}
      createShuffleSeed={() => {
        const seed = queue.shift()
        if (seed === undefined) throw new Error('No Shuffle seed left')
        return seed
      }}
    />,
  )
  return { ...screen, queryClient }
}
