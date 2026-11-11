import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Resolve @hp-flashcard/* workspace packages to their TypeScript source
    // (see the "@hp-flashcard/source" export condition) for instant HMR
    // without building. Published consumers never see this condition.
    conditions: ['@hp-flashcard/source', ...defaultClientConditions],
  },
})
