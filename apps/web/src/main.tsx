import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.js'
import { createQueryClient } from './app/queries.js'

// There is no real backend yet: the mock backend must be intercepting
// before the app makes its first request. It loads as its own chunk, so it
// can be dropped once a real backend exists.
const { startMockBackend } = await import('./mocks/browser.js')
const { scenariosFromUrl } = await import('./mocks/scenarios.js')
await startMockBackend({
  // Development-only failure, loading and empty scenarios (?scenario=…).
  scenarios: import.meta.env.DEV ? scenariosFromUrl(window.location.href) : [],
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App queryClient={createQueryClient()} />
  </StrictMode>,
)
