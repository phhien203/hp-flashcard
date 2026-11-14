import './styles.css'

import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.js'
import { Notice } from './app/Notice.js'

const root = createRoot(document.getElementById('root')!)
const render = (node: ReactNode) => root.render(<StrictMode>{node}</StrictMode>)

// Mock mode is explicit and development-only: `pnpm dev:web:mock` (Vite's
// `--mode mock`). Production builds drop this branch, and with it MSW, the
// fixture and the mock sign-in; any other mode talks to the real API.
if (import.meta.env.DEV && import.meta.env.MODE === 'mock') {
  const { startMockBackend } = await import('./mocks/browser.js')
  const { scenariosFromUrl } = await import('./mocks/scenarios.js')
  const { MockRoot } = await import('./auth/mock-root.js')
  // The mock backend must be intercepting before the app's first request.
  await startMockBackend({
    // Failure, loading and empty scenarios (?scenario=…).
    scenarios: scenariosFromUrl(window.location.href),
  })
  render(<MockRoot />)
} else {
  const publishableKey: string | undefined = import.meta.env
    .VITE_CLERK_PUBLISHABLE_KEY
  if (!publishableKey) {
    render(
      <main className="mx-auto max-w-page p-400">
        <Notice
          role="alert"
          title="Sign-in isn’t configured"
          description="Set VITE_CLERK_PUBLISHABLE_KEY (see apps/web/README.md), or run pnpm dev:web:mock."
        />
      </main>,
    )
  } else {
    const { ClerkRoot } = await import('./auth/clerk.js')
    render(
      <ClerkRoot publishableKey={publishableKey}>
        {(session, signIn) => <App session={session} signIn={signIn} />}
      </ClerkRoot>,
    )
  }
}
