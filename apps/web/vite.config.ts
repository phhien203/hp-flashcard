import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { msw } from 'msw/vite'
import { defaultClientConditions, defineConfig, type UserConfig } from 'vite'

/** Where `pnpm dev:api` (wrangler dev) serves the Worker locally. */
const LOCAL_API = 'http://localhost:8787'

export default defineConfig(({ command, mode }): UserConfig => ({
  plugins: [
    react(),
    tailwindcss(),
    // Serves MSW's mockServiceWorker.js for tests and mock mode; the app
    // starts the worker itself, in src/mocks/browser.ts. Production
    // builds leave it out: they never start the mock backend.
    ...(command === 'serve' ? [msw({ mode: 'worker-only' })] : []),
  ],
  resolve: {
    // Resolve @hp-flashcard/ui to its TypeScript source (the
    // "@hp-flashcard/source" export condition), so no build is needed.
    conditions: ['@hp-flashcard/source', ...defaultClientConditions],
  },
  // In real mode the API is the local Worker; in mock mode MSW answers
  // /api/* in the browser before any request reaches this proxy.
  server: mode === 'mock' ? {} : { proxy: { '/api': LOCAL_API } },
  build: { target: 'es2023' },
}))
