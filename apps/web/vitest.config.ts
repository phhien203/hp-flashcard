import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, mergeConfig } from 'vitest/config'

import { browserTestConfig } from '../../vitest.shared.ts'
import viteConfig from './vite.config.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    projects: [
      // The assembled app in a real browser: UI → TanStack Query → fetch →
      // MSW service worker → mock store.
      mergeConfig(
        viteConfig({ command: 'serve', mode: 'test' }),
        defineConfig({
          root: dirname,
          test: {
            name: 'web',
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: ['src/**/*.node.test.ts'],
            setupFiles: ['./src/test/setup.ts'],
            browser: browserTestConfig(),
          },
        }),
      ),
      // The API contract, in Node: the OpenAPI document, the generated
      // types' freshness, and mock responses against the schemas.
      {
        root: dirname,
        test: {
          name: 'web:contract',
          include: ['src/**/*.node.test.ts'],
          environment: 'node',
        },
      },
      // The Worker at its HTTP seam: bundled, in workerd (Miniflare), on a
      // local D1 database built by the checked-in migrations.
      {
        root: dirname,
        test: {
          name: 'web:worker',
          include: ['worker/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
