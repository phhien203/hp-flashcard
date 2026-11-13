import { setupWorker } from 'msw/browser'

import { handlers } from './handlers.js'
import { SCENARIOS, type ScenarioName } from './scenarios.js'
import { mockStore } from './store.js'

/** The mock backend, run by a service worker in the browser. */
export const worker = setupWorker(...handlers)

/**
 * Starts intercepting the app's API requests. Await it before the app makes
 * any. `scenarios` puts the backend in development-only situations.
 */
export async function startMockBackend({
  scenarios = [],
  quiet = false,
}: { scenarios?: readonly ScenarioName[]; quiet?: boolean } = {}) {
  await worker.start({
    quiet,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    // An /api request without a handler is a bug: the contract has no such
    // operation, or it isn't mocked yet. Everything else (assets, modules)
    // goes to the network.
    onUnhandledFrame({ frame, defaults }) {
      const { data } = frame as { data: { request?: Request } }
      const url = data.request && new URL(data.request.url)
      if (url?.pathname.startsWith('/api/')) defaults.error()
    },
  })
  for (const name of scenarios) worker.use(...SCENARIOS[name](mockStore))
}
