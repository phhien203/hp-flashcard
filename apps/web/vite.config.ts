import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { msw } from 'msw/vite'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  // Serves (and builds) MSW's mockServiceWorker.js; the app starts the
  // worker itself, in src/mocks/browser.ts.
  plugins: [react(), tailwindcss(), msw({ mode: 'worker-only' })],
  resolve: {
    // Resolve @hp-flashcard/ui to its TypeScript source (the
    // "@hp-flashcard/source" export condition), so no build is needed.
    conditions: ['@hp-flashcard/source', ...defaultClientConditions],
  },
  build: { target: 'es2023' },
})
